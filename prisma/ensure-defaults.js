const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function upsertTenant(slug, data) {
  return prisma.tenant.upsert({
    where: { slug },
    update: data,
    create: { slug, ...data }
  });
}

async function upsertUser(username, data) {
  return prisma.user.upsert({
    where: { username },
    update: data,
    create: { username, ...data }
  });
}

async function ensureCategory(tenantId, category) {
  const existing = await prisma.category.findFirst({ where: { tenantId, name: category.name, type: category.type } });
  if (!existing) await prisma.category.create({ data: { ...category, tenantId } });
}

async function ensureFinancialAccount(tenantId, account) {
  const existing = await prisma.financialAccount.findFirst({ where: { tenantId, name: account.name } });
  if (!existing) await prisma.financialAccount.create({ data: { ...account, tenantId } });
}

async function ensureCostCenter(tenantId, costCenter) {
  const existing = await prisma.costCenter.findFirst({ where: { tenantId, name: costCenter.name } });
  if (!existing) await prisma.costCenter.create({ data: { ...costCenter, tenantId } });
}

async function ensureNotificationRule(tenantId, rule) {
  await prisma.notificationRule.upsert({
    where: {
      tenantId_type_daysBefore_channel: {
        tenantId,
        type: rule.type,
        daysBefore: rule.daysBefore,
        channel: rule.channel || "push"
      }
    },
    update: { name: rule.name, enabled: rule.enabled ?? true },
    create: { ...rule, tenantId, channel: rule.channel || "push", enabled: rule.enabled ?? true }
  });
}

async function assignOldData(tenantId) {
  await prisma.client.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.transaction.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.category.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.invoice.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.adBudget.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.accountReceivable.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.accountPayable.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.goal.updateMany({ where: { tenantId: null }, data: { tenantId } });
  await prisma.lead.updateMany({ where: { tenantId: null }, data: { tenantId } });
}

async function main() {
  const merli = await upsertTenant("merli360", {
    name: "Pedro Merli",
    kind: "consultoria",
    brandName: "Merli360"
  });

  const agro = await upsertTenant("gestao-rural-360", {
    name: "Talles Simoes",
    kind: "agro",
    brandName: "Gestao Rural 360"
  });

  await upsertUser("pedro", {
    tenantId: merli.id,
    name: "Pedro Merli",
    role: "superadmin",
    passwordHash: hashPassword(process.env.ADMIN_PASSWORD || "pedro2026")
  });

  await upsertUser("tallessimoes", {
    tenantId: agro.id,
    name: "Talles Simoes",
    role: "user",
    passwordHash: hashPassword("talles2026agro")
  });

  await upsertUser("pedroagro", {
    tenantId: agro.id,
    name: "Pedro Merli",
    role: "admin",
    passwordHash: hashPassword(process.env.ADMIN_PASSWORD || "pedro2026")
  });

  await assignOldData(merli.id);

  const commonCategories = [
    { name: "Saldo inicial", type: "entrada", description: "Entrada manual para registrar saldo inicial de uma carteira." },
    { name: "Ajuste de saldo", type: "entrada", description: "Entrada manual para corrigir ou complementar saldo de uma carteira." },
    { name: "Venda de produtos", type: "entrada" },
    { name: "Venda de servicos", type: "entrada" },
    { name: "Mensalidade", type: "entrada" },
    { name: "Projeto avulso", type: "entrada" },
    { name: "Reembolso", type: "entrada" },
    { name: "Entrada a conferir", type: "entrada", description: "Entrada importada que precisa de classificacao final." },
    { name: "Outras receitas", type: "entrada" },
    { name: "Fornecedores", type: "saida" },
    { name: "Materia-prima/insumos", type: "saida" },
    { name: "Mercadorias para revenda", type: "saida" },
    { name: "Ferramentas e sistemas", type: "saida" },
    { name: "Impostos e taxas", type: "saida" },
    { name: "Marketing e anuncios", type: "saida" },
    { name: "Equipe e diarias", type: "saida" },
    { name: "Aluguel e moradia", type: "saida" },
    { name: "Energia", type: "saida" },
    { name: "Agua", type: "saida" },
    { name: "Internet e telefone", type: "saida" },
    { name: "Transporte e frete", type: "saida" },
    { name: "Combustivel", type: "saida" },
    { name: "Manutencao", type: "saida" },
    { name: "Equipamentos", type: "saida" },
    { name: "Alimentacao", type: "saida" },
    { name: "Saude", type: "saida" },
    { name: "Lazer", type: "saida" },
    { name: "Despesas compartilhadas", type: "saida" },
    { name: "Tarifas bancarias", type: "saida" },
    { name: "Saida a conferir", type: "saida", description: "Saida importada que precisa de classificacao final." },
    { name: "Transferencia propria", type: "neutro" },
    { name: "A conferir", type: "neutro" }
  ];

  const agroCategories = [
    { name: "Vendas de hortalicas", type: "entrada" },
    { name: "Vendas de legumes", type: "entrada" },
    { name: "Vendas para mercados", type: "entrada" },
    { name: "Vendas para distribuidoras", type: "entrada" },
    { name: "Vendas para restaurantes", type: "entrada" },
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
    { name: "Ferramentas", type: "saida" },
    { name: "Outros", type: "saida" }
  ];

  for (const category of commonCategories) {
    await ensureCategory(merli.id, category);
    await ensureCategory(agro.id, category);
  }

  for (const category of agroCategories) {
    await ensureCategory(agro.id, category);
  }

  const defaultAccounts = [
    { name: "PJ", type: "conta bancaria", currency: "BRL", includeInTotal: true, status: "ativa" },
    { name: "pessoal", type: "conta bancaria", currency: "BRL", includeInTotal: true, status: "ativa" },
    { name: "dinheiro", type: "dinheiro/caixa", currency: "BRL", includeInTotal: true, status: "ativa" },
    { name: "cartao", type: "cartao de credito", currency: "BRL", includeInTotal: false, status: "ativa" },
    { name: "outro", type: "outro", currency: "BRL", includeInTotal: true, status: "ativa" }
  ];

  const merliCostCenters = [
    { name: "Empresa" },
    { name: "Pessoal" },
    { name: "Compartilhado" },
    { name: "Cliente" },
    { name: "Contas a pagar" },
    { name: "A classificar" }
  ];

  const agroCostCenters = [
    { name: "Rural" },
    { name: "Plantio" },
    { name: "Colheita" },
    { name: "Estoque" },
    { name: "Vendas" },
    { name: "A classificar" }
  ];

  for (const account of defaultAccounts) {
    await ensureFinancialAccount(merli.id, account);
    await ensureFinancialAccount(agro.id, account);
  }

  for (const costCenter of merliCostCenters) await ensureCostCenter(merli.id, costCenter);
  for (const costCenter of agroCostCenters) await ensureCostCenter(agro.id, costCenter);

  const defaultRules = [
    { name: "Contas a receber vencendo amanha", type: "receivable_due", daysBefore: 1 },
    { name: "Contas a pagar vencendo amanha", type: "payable_due", daysBefore: 1 },
    { name: "Contas a receber vencendo hoje", type: "receivable_due", daysBefore: 0 },
    { name: "Contas a pagar vencendo hoje", type: "payable_due", daysBefore: 0 }
  ];

  for (const rule of defaultRules) {
    await ensureNotificationRule(merli.id, rule);
    await ensureNotificationRule(agro.id, rule);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
