import { prisma } from "@/lib/prisma";
import { currentMonth, monthBounds } from "@/lib/format";
import { financialTitleOpenCents } from "@/lib/financial-ledger";
import { getDueNotifications } from "@/lib/notifications";
import { getWalletBalances } from "@/lib/wallets";
import { getOrCreateAssistantProfile } from "@/lib/assistant-profile";
import { financialMetricCatalog } from "@/lib/semantic-finance";

export type AssistantTenantKind = "consultoria" | "agro" | "pessoal" | string;

export type AssistantUserLike = {
  id: string;
  tenantId: string;
  name: string;
  role?: string | null;
  tenant: { kind: AssistantTenantKind; brandName: string; name?: string | null };
};

function normalize(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function openLegacyStatus(status?: string | null) {
  const value = normalize(status || "");
  return !["pago", "recebido", "cancelado", "cancelada"].includes(value);
}

function safeJson<T>(value?: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function tenantBehavior(kind: AssistantTenantKind) {
  if (kind === "agro") {
    return {
      mode: "agro",
      assistantName: "Assistente Rural 360",
      modules: ["vendas", "compradores", "contas", "fluxo", "plantios", "colheitas", "estoque", "produtos/culturas", "agenda", "relatorios"],
      priorities: [
        "controlar caixa rural e pessoal sem misturar tenants",
        "relacionar vendas com comprador, produto/cultura, entrega, recebimento e estoque",
        "relacionar plantio, colheita, perdas, custo direto e estoque",
        "classificar custos rurais como sementes, mudas, adubo, defensivos, irrigacao, energia, agua, combustivel, frete, diarias, embalagens e manutencao"
      ],
      examples: ["Plantei alface hoje", "Vendi 20 caixas para mercado", "Quanto tenho em estoque?", "Quanto gastei com adubo?"]
    };
  }
  if (kind === "pessoal") {
    return {
      mode: "pessoal",
      assistantName: "Assistente Financeira 360",
      modules: ["fluxo", "contas", "carteiras", "categorias", "orcamento", "metas", "relatorios"],
      priorities: ["controlar dinheiro pessoal", "separar cartoes e carteiras", "avisar vencimentos", "acompanhar metas e reservas"],
      examples: ["Gastei R$ 15 no lanche", "Quanto posso gastar?", "Mostre minhas contas vencidas"]
    };
  }
  return {
    mode: "consultoria",
    assistantName: "Assistente Merli360",
    modules: ["clientes", "contratos", "fluxo", "contas", "ads", "notas", "crm", "relatorios", "metas"],
    priorities: [
      "separar empresa, pessoal, anuncios, reembolsos e transferencias",
      "relacionar recebimentos com clientes/contratos",
      "controlar contas a pagar, receber, notas e verba de ads",
      "acompanhar metas comerciais e recorrencia"
    ],
    examples: ["Recebi mensalidade do cliente", "Quanto tenho a receber?", "Como esta meu caixa?", "Relatorio dos gastos"]
  };
}

export function assistantToolMap(kind: AssistantTenantKind) {
  const common = {
    consultas: [
      "obter_resumo_financeiro",
      "consultar_saldo",
      "consultar_fluxo_caixa",
      "consultar_contas_receber",
      "consultar_contas_pagar",
      "consultar_titulos_unificados",
      "consultar_conciliacao",
      "consultar_categorias",
      "consultar_contatos",
      "consultar_metas_orcamentos",
      "consultar_notificacoes"
    ],
    criacoes: [
      "criar_movimentacao",
      "criar_conta_pagar",
      "criar_conta_receber",
      "criar_contato",
      "criar_categoria",
      "criar_carteira",
      "criar_meta",
      "criar_evento_agenda"
    ],
    atualizacoes: [
      "marcar_como_pago",
      "marcar_como_recebido",
      "categorizar_movimentacao",
      "atualizar_saldo_inicial",
      "atualizar_cadastro",
      "conciliar_movimentacao",
      "desfazer_ultima_acao_ia"
    ],
    analises: [
      "analisar_gastos",
      "analisar_receitas",
      "identificar_atrasos",
      "identificar_recorrencias",
      "identificar_duplicidades",
      "gerar_relatorio",
      "projetar_saldo"
    ]
  };
  if (kind !== "agro") return common;
  return {
    ...common,
    agro: [
      "consultar_produtos_culturas",
      "consultar_estoque",
      "consultar_plantios",
      "consultar_colheitas",
      "consultar_vendas_rurais",
      "consultar_compradores",
      "registrar_venda_rural",
      "registrar_plantio",
      "registrar_colheita",
      "registrar_movimento_estoque",
      "analisar_custo_por_cultura",
      "analisar_rentabilidade_rural"
    ]
  };
}

export function parseStructuredMemory(profile: any) {
  const parsed = safeJson<Record<string, any>>(profile?.preferences);
  const base = parsed?.structuredMemory && typeof parsed.structuredMemory === "object" ? parsed.structuredMemory : {};
  return {
    ownerName: profile?.ownerName || "",
    businessName: profile?.businessName || "",
    goalsText: profile?.goalsText || "",
    memoryText: profile?.memoryText || "",
    rawPreferences: profile?.preferences || "",
    structured: base
  };
}

export async function updateStructuredMemory(input: {
  tenantId: string;
  userId: string;
  patch: Record<string, any>;
  textAppend?: string;
}) {
  const profile = await prisma.assistantProfile.findFirst({ where: { tenantId: input.tenantId, userId: input.userId } });
  if (!profile) return null;
  const parsed = safeJson<Record<string, any>>(profile.preferences) || {};
  if (!parsed.legacyPreferences && profile.preferences && !safeJson(profile.preferences)) {
    parsed.legacyPreferences = profile.preferences;
  }
  const structuredMemory = { ...(parsed.structuredMemory || {}), ...input.patch };
  return prisma.assistantProfile.update({
    where: { id: profile.id },
    data: {
      preferences: JSON.stringify({ ...parsed, structuredMemory }),
      memoryText: input.textAppend ? [profile.memoryText, input.textAppend].filter(Boolean).join("\n\n").slice(-9000) : profile.memoryText
    }
  });
}

export async function getUnifiedAssistantContext(user: AssistantUserLike, month = currentMonth()) {
  const tenantId = user.tenantId;
  const { start, end } = monthBounds(month);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    tenant,
    profile,
    wallets,
    cashMovements,
    transactions,
    titles,
    legacyReceivables,
    legacyPayables,
    categories,
    costCenters,
    goals,
    budgets,
    clients,
    buyers,
    bankTransactions,
    learningRules,
    dueNotifications,
    products,
    plantings,
    harvests,
    sales,
    agendaEvents
  ] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    getOrCreateAssistantProfile(user as any),
    getWalletBalances(tenantId),
    prisma.cashMovement.findMany({ where: { tenantId, date: { gte: start, lt: end }, status: "ACTIVE" }, orderBy: { date: "desc" }, take: 250 }),
    prisma.transaction.findMany({ where: { tenantId, date: { gte: start, lt: end } }, orderBy: { date: "desc" }, take: 250 }),
    prisma.financialTitle.findMany({ where: { tenantId, status: { in: ["OPEN", "PARTIAL"] } }, include: { settlements: true }, orderBy: { dueDate: "asc" }, take: 250 }),
    prisma.accountReceivable.findMany({ where: { tenantId }, orderBy: { dueDate: "asc" }, take: 250 }),
    prisma.accountPayable.findMany({ where: { tenantId }, orderBy: { dueDate: "asc" }, take: 250 }),
    prisma.category.findMany({ where: { tenantId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.costCenter.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.goal.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.budget.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { month: "desc" }, take: 12 }),
    prisma.client.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 120 }),
    prisma.buyer.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 120 }),
    prisma.bankTransaction.findMany({ where: { tenantId }, orderBy: { date: "desc" }, take: 200 }),
    prisma.aiLearningRule.findMany({ where: { tenantId, OR: [{ userId: user.id }, { userId: null }] }, orderBy: [{ correctionCount: "desc" }, { updatedAt: "desc" }], take: 120 }),
    getDueNotifications(tenantId, 14),
    user.tenant.kind === "agro" ? prisma.product.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 120 }) : Promise.resolve([]),
    user.tenant.kind === "agro" ? prisma.planting.findMany({ where: { tenantId }, include: { product: true }, orderBy: { plantingDate: "desc" }, take: 120 }) : Promise.resolve([]),
    user.tenant.kind === "agro" ? prisma.harvest.findMany({ where: { tenantId }, include: { product: true }, orderBy: { harvestDate: "desc" }, take: 120 }) : Promise.resolve([]),
    user.tenant.kind === "agro" ? prisma.sale.findMany({ where: { tenantId }, include: { product: true, buyer: true }, orderBy: { saleDate: "desc" }, take: 120 }) : Promise.resolve([]),
    user.tenant.kind === "agro" ? prisma.agendaEvent.findMany({ where: { tenantId }, orderBy: { date: "asc" }, take: 120 }) : Promise.resolve([])
  ]);

  const receivableTitles = titles.filter((item) => item.type === "RECEIVABLE");
  const payableTitles = titles.filter((item) => item.type === "PAYABLE");
  const syncedReceivableIds = new Set(receivableTitles.map((item) => item.legacyModel === "AccountReceivable" ? item.legacyId : "").filter(Boolean));
  const syncedPayableIds = new Set(payableTitles.map((item) => item.legacyModel === "AccountPayable" ? item.legacyId : "").filter(Boolean));

  const unifiedReceivables = [
    ...receivableTitles.map((item) => ({
      id: item.id,
      source: "FinancialTitle",
      legacyId: item.legacyId,
      description: item.description,
      category: item.category,
      dueDate: item.dueDate,
      amount: financialTitleOpenCents(item) / 100,
      status: item.status,
      overdue: item.dueDate < today
    })),
    ...legacyReceivables
      .filter((item) => openLegacyStatus(item.status) && !syncedReceivableIds.has(item.id))
      .map((item) => ({
        id: item.id,
        source: "AccountReceivable",
        description: item.description,
        category: item.type,
        dueDate: item.dueDate,
        amount: item.amount,
        status: item.status,
        overdue: item.dueDate < today
      }))
  ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const unifiedPayables = [
    ...payableTitles.map((item) => ({
      id: item.id,
      source: "FinancialTitle",
      legacyId: item.legacyId,
      description: item.description,
      category: item.category,
      dueDate: item.dueDate,
      amount: financialTitleOpenCents(item) / 100,
      status: item.status,
      overdue: item.dueDate < today
    })),
    ...legacyPayables
      .filter((item) => openLegacyStatus(item.status) && !syncedPayableIds.has(item.id))
      .map((item) => ({
        id: item.id,
        source: "AccountPayable",
        description: item.description,
        category: item.category,
        dueDate: item.dueDate,
        amount: item.amount,
        status: item.status,
        overdue: item.dueDate < today
      }))
  ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const ledger = cashMovements.length
    ? cashMovements.map((item) => ({
        id: item.id,
        source: item.source,
        date: item.date,
        direction: item.direction,
        amount: item.amountCents / 100,
        amountCents: item.amountCents,
        description: item.description,
        category: item.category,
        costCenter: item.costCenter,
        account: item.accountName,
        status: item.status
      }))
    : transactions.map((item) => ({
        id: item.id,
        source: item.source || "Transaction",
        date: item.date,
        direction: item.type === "entrada" ? "IN" : "OUT",
        amount: item.amount,
        amountCents: Math.round(item.amount * 100),
        description: item.description,
        category: item.category,
        costCenter: item.costCenter,
        account: item.account,
        status: item.status
      }));

  const inputs = ledger.filter((item) => item.direction === "IN").reduce((sum, item) => sum + item.amount, 0);
  const outputs = ledger.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + item.amount, 0);
  const receivableOpen = unifiedReceivables.reduce((sum, item) => sum + item.amount, 0);
  const payableOpen = unifiedPayables.reduce((sum, item) => sum + item.amount, 0);
  const walletTotal = wallets.reduce((sum, item) => sum + item.balance, 0);

  return {
    tenant: { id: tenantId, name: tenant?.name, brandName: tenant?.brandName, kind: tenant?.kind || user.tenant.kind },
    behavior: tenantBehavior(user.tenant.kind),
    toolMap: assistantToolMap(user.tenant.kind),
    metricDefinitions: financialMetricCatalog,
    profile,
    memory: parseStructuredMemory(profile),
    month,
    dashboard: {
      walletTotal,
      inputs,
      outputs,
      result: inputs - outputs,
      receivableOpen,
      payableOpen,
      overdueReceivables: unifiedReceivables.filter((item) => item.overdue).reduce((sum, item) => sum + item.amount, 0),
      overduePayables: unifiedPayables.filter((item) => item.overdue).reduce((sum, item) => sum + item.amount, 0),
      projectedBalance: walletTotal + receivableOpen - payableOpen
    },
    wallets,
    ledger,
    receivables: unifiedReceivables,
    payables: unifiedPayables,
    titles,
    categories,
    costCenters,
    goals,
    budgets,
    contacts: { clients, buyers },
    imports: {
      toReview: bankTransactions.filter((item) => item.status === "POSTED").length,
      recent: bankTransactions.slice(0, 30)
    },
    learningRules,
    dueNotifications,
    rural: {
      products,
      plantings,
      harvests,
      sales,
      agendaEvents,
      stockValue: products.reduce((sum: number, item: any) => sum + Number(item.currentStock || 0) * Number(item.averageCost || 0), 0),
      salesTotal: sales.reduce((sum: number, item: any) => sum + Number(item.totalAmount || 0), 0),
      pendingSales: sales.filter((item: any) => item.status !== "recebido")
    }
  };
}

export function compactForPrompt(context: any) {
  return {
    tenant: context.tenant,
    behavior: context.behavior,
    toolMap: context.toolMap,
    metricDefinitions: context.metricDefinitions,
    memory: context.memory,
    month: context.month,
    dashboard: context.dashboard,
    wallets: context.wallets.slice(0, 20),
    recentMovements: context.ledger.slice(0, 30),
    payables: context.payables.slice(0, 30),
    receivables: context.receivables.slice(0, 30),
    categories: context.categories.map((item: any) => ({ name: item.name, type: item.type })).slice(0, 80),
    costCenters: context.costCenters.map((item: any) => item.name).slice(0, 40),
    contacts: {
      clients: context.contacts.clients.map((item: any) => ({ id: item.id, name: item.name, status: item.status, type: item.type })).slice(0, 50),
      buyers: context.contacts.buyers.map((item: any) => ({ id: item.id, name: item.name, type: item.type })).slice(0, 50)
    },
    goals: context.goals.slice(0, 30),
    imports: { toReview: context.imports.toReview, recent: context.imports.recent.slice(0, 20) },
    learningRules: context.learningRules.map((item: any) => ({
      pattern: item.pattern,
      direction: item.direction,
      category: item.category,
      paymentMethod: item.paymentMethod,
      costCenter: item.costCenter,
      confidence: item.confidence
    })).slice(0, 40),
    rural: context.tenant.kind === "agro" ? {
      products: context.rural.products.slice(0, 60),
      plantings: context.rural.plantings.slice(0, 30),
      harvests: context.rural.harvests.slice(0, 30),
      sales: context.rural.sales.slice(0, 30),
      stockValue: context.rural.stockValue,
      salesTotal: context.rural.salesTotal,
      pendingSales: context.rural.pendingSales.slice(0, 20)
    } : undefined
  };
}
