import { NextRequest, NextResponse } from "next/server";
import { authCookieName, createSessionToken, hashPassword, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function moneyToCents(value: string) {
  const raw = text(value);
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function centsToMoney(cents: number) {
  return Math.round(cents || 0) / 100;
}

function accountType(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("dinheiro") || lower.includes("caixa")) return "dinheiro/caixa";
  if (lower.includes("cartao") || lower.includes("cartão")) return "cartao de credito";
  return "conta bancaria";
}

function formKey(prefix: string, name: string) {
  return `${prefix}_${name}`;
}

async function ensureCategory(tenantId: string, name: string, type: string, description?: string) {
  const existing = await prisma.category.findFirst({
    where: { tenantId, name, type }
  });
  if (existing) return existing;
  return prisma.category.create({
    data: { tenantId, name, type, description }
  });
}

async function ensureGoal(input: {
  tenantId: string;
  owner: string;
  name: string;
  currentValue?: number;
  targetValue: number;
  actionPlan?: string;
  notes?: string;
}) {
  if (!input.name || input.targetValue <= 0) return null;
  const existing = await prisma.goal.findFirst({
    where: { tenantId: input.tenantId, name: input.name }
  });
  const data = {
    owner: input.owner,
    currentValue: input.currentValue || 0,
    targetValue: input.targetValue,
    gap: Math.max(0, input.targetValue - (input.currentValue || 0)),
    actionPlan: input.actionPlan,
    notes: input.notes,
    status: "em andamento"
  };
  return existing
    ? prisma.goal.update({ where: { id: existing.id }, data })
    : prisma.goal.create({ data: { tenantId: input.tenantId, name: input.name, ...data } });
}

function categoriesForSetup(input: {
  tenantKind: string;
  controlAreas: string[];
  frequentEntries: string;
  frequentExpenses: string;
  agroCosts: string[];
}) {
  const categories: Array<{ name: string; type: string; description?: string }> = [
    { name: "A conferir", type: "entrada", description: "Entrada importada ou registrada sem classificacao final." },
    { name: "A conferir", type: "saida", description: "Saida importada ou registrada sem classificacao final." },
    { name: "Transferencia propria", type: "entrada" },
    { name: "Transferencia propria", type: "saida" },
    { name: "Saldo inicial", type: "entrada" },
    { name: "Outras receitas", type: "entrada" },
    { name: "Outras despesas", type: "saida" }
  ];

  const area = new Set(input.controlAreas);
  if (area.has("Vida pessoal")) {
    categories.push(
      { name: "Salario", type: "entrada" },
      { name: "Alimentacao", type: "saida" },
      { name: "Transporte", type: "saida" },
      { name: "Moradia", type: "saida" },
      { name: "Saude", type: "saida" },
      { name: "Lazer", type: "saida" }
    );
  }
  if (area.has("Empresa/MEI") || area.has("Clientes/contratos")) {
    categories.push(
      { name: "Servicos", type: "entrada" },
      { name: "Mensalidades", type: "entrada" },
      { name: "Projetos avulsos", type: "entrada" },
      { name: "Impostos", type: "saida" },
      { name: "Softwares e assinaturas", type: "saida" },
      { name: "Fornecedores", type: "saida" },
      { name: "Marketing", type: "saida" }
    );
  }
  if (area.has("Cartao de credito")) {
    categories.push({ name: "Cartao de credito", type: "saida" }, { name: "Pagamento de cartao", type: "saida" });
  }
  if (area.has("Vendas")) {
    categories.push({ name: "Vendas", type: "entrada" }, { name: "Comissoes", type: "entrada" });
  }
  if (input.tenantKind === "agro" || area.has("Agro/producao rural")) {
    categories.push(
      { name: "Vendas de hortalicas", type: "entrada" },
      { name: "Vendas de legumes", type: "entrada" },
      { name: "Entrega", type: "entrada" },
      { name: "Sementes/mudas", type: "saida" },
      { name: "Adubo/fertilizante", type: "saida" },
      { name: "Defensivos", type: "saida" },
      { name: "Irrigacao", type: "saida" },
      { name: "Energia", type: "saida" },
      { name: "Agua", type: "saida" },
      { name: "Combustivel", type: "saida" },
      { name: "Transporte/frete", type: "saida" },
      { name: "Funcionarios/diarias", type: "saida" },
      { name: "Manutencao de equipamentos", type: "saida" },
      { name: "Embalagens", type: "saida" },
      { name: "Ferramentas", type: "saida" }
    );
  }
  for (const cost of input.agroCosts) categories.push({ name: cost, type: "saida" });

  const frequent = `${input.frequentEntries}\n${input.frequentExpenses}`;
  if (/pix/i.test(frequent)) categories.push({ name: "Pix a conferir", type: "entrada" }, { name: "Pix a conferir", type: "saida" });
  if (/combust/i.test(frequent)) categories.push({ name: "Combustivel", type: "saida" });
  if (/mercado|supermercado|feira/i.test(frequent)) categories.push({ name: "Mercado", type: "saida" });
  if (/internet|telefone|celular/i.test(frequent)) categories.push({ name: "Internet e telefone", type: "saida" });

  const unique = new Map<string, { name: string; type: string; description?: string }>();
  for (const category of categories) unique.set(`${category.type}:${category.name.toLowerCase()}`, category);
  return [...unique.values()];
}

function publicUrl(request: NextRequest, path: string) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const proto = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  const redirectTo = String(form.get("redirectTo") || "/configuracoes");
  const controlAreas = form.getAll("controlAreas").map(text).filter(Boolean);
  const selectedAccounts = form.getAll("accounts").map(text).filter(Boolean);
  const customAccount = text(form.get("customAccount"));
  const accountNames = [...new Set([...selectedAccounts, customAccount].filter(Boolean))];
  const savingPockets = form.getAll("savingPockets").map(text).filter(Boolean);
  const customPocket = text(form.get("customPocket"));
  const pocketNames = [...new Set([...savingPockets, customPocket].filter(Boolean))];
  const profession = text(form.get("profession"));
  const monthlyIncomeCents = moneyToCents(String(form.get("monthlyIncome") || ""));
  const investmentGoal = text(form.get("investmentGoal"));
  const emergencyReserveGoalCents = moneyToCents(String(form.get("emergencyReserveGoal") || ""));
  const followUpLevel = text(form.get("followUpLevel")) || "equilibrado";
  const goalsText = text(form.get("goalsText"));
  const objectivesText = text(form.get("objectivesText"));
  const frequentEntries = text(form.get("frequentEntries"));
  const frequentExpenses = text(form.get("frequentExpenses"));
  const businessName = text(form.get("businessName")) || user.tenant.brandName;
  const assistantName = user.tenant.kind === "agro" ? "Assistente Rural 360" : "Assistente Merli360";
  const shouldChangePassword = user.mustChangePassword || Boolean(password);
  const agroCrops = form.getAll("agroCrops").map(text).filter(Boolean);
  const agroOtherCrops = text(form.get("agroOtherCrops"));
  const agroBuyers = form.getAll("agroBuyers").map(text).filter(Boolean);
  const agroCosts = form.getAll("agroCosts").map(text).filter(Boolean);
  const agroArea = text(form.get("agroArea"));
  const agroHarvestFrequency = text(form.get("agroHarvestFrequency"));
  const agroStockRoutine = text(form.get("agroStockRoutine"));
  const agroMainDifficulty = text(form.get("agroMainDifficulty"));

  if (shouldChangePassword && password.length < 8) return NextResponse.redirect(publicUrl(request, "/primeiro-acesso?error=size"));
  if (shouldChangePassword && password !== confirmPassword) return NextResponse.redirect(publicUrl(request, "/primeiro-acesso?error=match"));

  const updated = shouldChangePassword
    ? await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(password),
          mustChangePassword: false
        }
      })
    : user;

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (const account of accountNames) {
    const balanceField = account === customAccount ? "balance_custom" : `balance_${account}`;
    await prisma.financialAccount.upsert({
      where: { tenantId_name: { tenantId: user.tenantId, name: account } },
      update: {
        initialBalanceCents: moneyToCents(String(form.get(balanceField) || "")),
        initialBalanceDate: today,
        includeInTotal: !/cart[aã]o/i.test(account),
        status: "ativa"
      },
      create: {
        tenantId: user.tenantId,
        name: account,
        type: accountType(account),
        currency: "BRL",
        initialBalanceCents: moneyToCents(String(form.get(balanceField) || "")),
        initialBalanceDate: today,
        includeInTotal: !/cart[aã]o/i.test(account),
        status: "ativa"
      }
    });
  }

  for (const pocket of pocketNames) {
    const currentField = pocket === customPocket ? "pocket_current_custom" : formKey("pocket_current", pocket);
    const targetField = pocket === customPocket ? "pocket_target_custom" : formKey("pocket_target", pocket);
    const currentCents = moneyToCents(String(form.get(currentField) || ""));
    const targetCents = moneyToCents(String(form.get(targetField) || ""));
    await prisma.financialAccount.upsert({
      where: { tenantId_name: { tenantId: user.tenantId, name: `Cofrinho - ${pocket}` } },
      update: {
        initialBalanceCents: currentCents,
        initialBalanceDate: today,
        includeInTotal: true,
        status: "ativa",
        type: "cofrinho/reserva",
        notes: targetCents > 0 ? `Meta do cofrinho: R$ ${centsToMoney(targetCents).toFixed(2)}.` : "Cofrinho criado no primeiro acesso."
      },
      create: {
        tenantId: user.tenantId,
        name: `Cofrinho - ${pocket}`,
        type: "cofrinho/reserva",
        currency: "BRL",
        initialBalanceCents: currentCents,
        initialBalanceDate: today,
        includeInTotal: true,
        status: "ativa",
        notes: targetCents > 0 ? `Meta do cofrinho: R$ ${centsToMoney(targetCents).toFixed(2)}.` : "Cofrinho criado no primeiro acesso."
      }
    });
    if (targetCents > 0) {
      await ensureGoal({
        tenantId: user.tenantId,
        owner: user.name,
        name: `Cofrinho - ${pocket}`,
        currentValue: centsToMoney(currentCents),
        targetValue: centsToMoney(targetCents),
        actionPlan: "Acompanhar aportes e evitar comprometer esta reserva com gastos do mes.",
        notes: "Meta criada automaticamente no primeiro acesso a partir dos cofrinhos."
      });
    }
  }

  const setupCategories = categoriesForSetup({
    tenantKind: user.tenant.kind,
    controlAreas,
    frequentEntries,
    frequentExpenses,
    agroCosts
  });
  await Promise.all(setupCategories.map((category) => ensureCategory(user.tenantId, category.name, category.type, category.description)));

  if (emergencyReserveGoalCents > 0) {
    await ensureGoal({
      tenantId: user.tenantId,
      owner: user.name,
      name: "Reserva de emergencia",
      currentValue: 0,
      targetValue: centsToMoney(emergencyReserveGoalCents),
      actionPlan: "Separar um valor mensal antes de gastos variaveis e acompanhar no cofrinho de reserva.",
      notes: "Meta criada no primeiro acesso para orientar a IA nas recomendacoes."
    });
  }

  const memoryText = [
    `Primeiro acesso concluido em ${new Date().toISOString().slice(0, 10)}.`,
    `Nome cadastrado no SaaS: ${user.name}.`,
    profession ? `Profissao/atividade: ${profession}.` : "",
    monthlyIncomeCents > 0 ? `Renda ou faturamento medio informado: R$ ${centsToMoney(monthlyIncomeCents).toFixed(2)}.` : "",
    controlAreas.length ? `O usuario quer controlar: ${controlAreas.join(", ")}.` : "",
    accountNames.length ? `Contas/carteiras configuradas: ${accountNames.join(", ")}.` : "",
    pocketNames.length ? `Cofrinhos/reservas configurados: ${pocketNames.map((pocket) => {
      const targetField = pocket === customPocket ? "pocket_target_custom" : formKey("pocket_target", pocket);
      const target = moneyToCents(String(form.get(targetField) || ""));
      return target > 0 ? `${pocket} com meta de R$ ${centsToMoney(target).toFixed(2)}` : pocket;
    }).join(", ")}.` : "",
    investmentGoal ? `Meta de investimento/aporte: ${investmentGoal}.` : "",
    emergencyReserveGoalCents > 0 ? `Reserva de emergencia desejada: R$ ${centsToMoney(emergencyReserveGoalCents).toFixed(2)}.` : "",
    `Nivel de acompanhamento desejado: ${followUpLevel}.`,
    setupCategories.length ? `Categorias iniciais criadas/adaptadas: ${setupCategories.map((category) => category.name).slice(0, 30).join(", ")}.` : "",
    frequentEntries ? `Entradas comuns: ${frequentEntries}.` : "",
    frequentExpenses ? `Despesas comuns: ${frequentExpenses}.` : "",
    objectivesText ? `Objetivos de uso: ${objectivesText}.` : "",
    user.tenant.kind === "agro" && (agroCrops.length || agroOtherCrops) ? `Culturas/producao: ${[...agroCrops, agroOtherCrops].filter(Boolean).join(", ")}.` : "",
    user.tenant.kind === "agro" && agroArea ? `Area/estrutura produtiva: ${agroArea}.` : "",
    user.tenant.kind === "agro" && agroHarvestFrequency ? `Frequencia de colheita: ${agroHarvestFrequency}.` : "",
    user.tenant.kind === "agro" && agroBuyers.length ? `Canais/compradores: ${agroBuyers.join(", ")}.` : "",
    user.tenant.kind === "agro" && agroCosts.length ? `Custos rurais principais: ${agroCosts.join(", ")}.` : "",
    user.tenant.kind === "agro" && agroStockRoutine ? `Rotina de estoque/colheita: ${agroStockRoutine}.` : "",
    user.tenant.kind === "agro" && agroMainDifficulty ? `Maior dificuldade rural: ${agroMainDifficulty}.` : ""
  ].filter(Boolean).join("\n");

  const existingProfile = await prisma.assistantProfile.findFirst({ where: { tenantId: user.tenantId, userId: user.id } });
  const profileData = {
    tenantId: user.tenantId,
    userId: user.id,
    assistantName,
    ownerName: user.name,
    businessName,
    goalsText,
    preferences: [
      controlAreas.length ? `Areas: ${controlAreas.join(", ")}` : "",
      profession ? `Atividade: ${profession}` : "",
      monthlyIncomeCents > 0 ? `Renda/faturamento medio: R$ ${centsToMoney(monthlyIncomeCents).toFixed(2)}` : "",
      pocketNames.length ? `Cofrinhos: ${pocketNames.join(", ")}` : "",
      investmentGoal ? `Investimentos: ${investmentGoal}` : "",
      emergencyReserveGoalCents > 0 ? `Reserva desejada: R$ ${centsToMoney(emergencyReserveGoalCents).toFixed(2)}` : "",
      `Acompanhamento: ${followUpLevel}`,
      user.tenant.kind === "agro" && (agroCrops.length || agroOtherCrops) ? `Culturas: ${[...agroCrops, agroOtherCrops].filter(Boolean).join(", ")}` : "",
      user.tenant.kind === "agro" && agroBuyers.length ? `Compradores: ${agroBuyers.join(", ")}` : "",
      user.tenant.kind === "agro" && agroCosts.length ? `Custos: ${agroCosts.join(", ")}` : ""
    ].filter(Boolean).join("\n"),
    personality: user.tenant.kind === "agro"
      ? "Assistente rural financeira, direta e pratica. Deve ajudar com vendas, despesas, contas, estoque, plantio, colheita e custo por cultura. Deve explicar o que salvou, pedir confirmacao antes de alterar dados importantes e facilitar o uso para produtor rural."
      : "Assistente direta, pratica e segura. Deve explicar o que salvou, pedir confirmacao antes de alterar dados importantes e facilitar o uso para usuario leigo.",
    memoryText,
    onboardingStep: 6,
    onboardingCompleted: true
  };
  if (existingProfile) {
    await prisma.assistantProfile.update({ where: { id: existingProfile.id }, data: profileData });
  } else {
    await prisma.assistantProfile.create({ data: profileData });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "user_change_password",
    entity: "User",
    entityId: user.id,
    request,
    metadata: { firstAccess: user.mustChangePassword, controlAreas, accountNames, pocketNames, setupCategories: setupCategories.map((item) => `${item.type}:${item.name}`), agroCrops, agroOtherCrops, agroBuyers, agroCosts }
  });

  const response = NextResponse.redirect(publicUrl(request, redirectTo || "/"));
  response.cookies.set(authCookieName, createSessionToken(updated.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  response.cookies.delete("merli360_must_change_password");
  response.cookies.delete("merli360_first_setup");
  return response;
}
