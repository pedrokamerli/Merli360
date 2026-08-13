import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/format";
import { financialTitleOpenCents } from "@/lib/financial-ledger";
import { getWalletBalances } from "@/lib/wallets";

export const financialMetricCatalog = {
  realizedRevenue: {
    name: "Receita realizada",
    definition: "Entradas efetivamente registradas no fluxo de caixa no periodo.",
    formula: "Soma de CashMovement.direction = IN com status ACTIVE, excluindo transferencias.",
    source: "CashMovement; fallback legado em Transaction quando nao houver ledger moderno.",
    unit: "BRL",
    rounding: "Centavos convertidos para reais com duas casas.",
    pendingTreatment: "Titulos previstos nao entram.",
    canceledTreatment: "Movimentos cancelados, revertidos ou transferencias nao entram."
  },
  expectedRevenue: {
    name: "Receita prevista",
    definition: "Valor aberto em contas a receber/titulos de recebimento.",
    formula: "Soma do saldo aberto de FinancialTitle RECEIVABLE OPEN/PARTIAL e legados nao sincronizados.",
    source: "FinancialTitle, Settlement, AccountReceivable.",
    unit: "BRL",
    rounding: "Centavos convertidos para reais com duas casas.",
    pendingTreatment: "Somente saldo aberto.",
    canceledTreatment: "Cancelados e pagos nao entram."
  },
  realizedExpense: {
    name: "Despesa realizada",
    definition: "Saidas efetivamente registradas no fluxo de caixa no periodo.",
    formula: "Soma de CashMovement.direction = OUT com status ACTIVE, excluindo transferencias.",
    source: "CashMovement; fallback legado em Transaction quando nao houver ledger moderno.",
    unit: "BRL",
    rounding: "Centavos convertidos para reais com duas casas.",
    pendingTreatment: "Titulos previstos nao entram.",
    canceledTreatment: "Movimentos cancelados, revertidos ou transferencias nao entram."
  },
  expectedExpense: {
    name: "Despesa prevista",
    definition: "Valor aberto em contas a pagar/titulos de pagamento.",
    formula: "Soma do saldo aberto de FinancialTitle PAYABLE OPEN/PARTIAL e legados nao sincronizados.",
    source: "FinancialTitle, Settlement, AccountPayable.",
    unit: "BRL",
    rounding: "Centavos convertidos para reais com duas casas.",
    pendingTreatment: "Somente saldo aberto.",
    canceledTreatment: "Cancelados e pagos nao entram."
  },
  result: {
    name: "Resultado",
    definition: "Resultado realizado do periodo.",
    formula: "Receita realizada - despesa realizada.",
    source: "Snapshot semantico financeiro.",
    unit: "BRL",
    rounding: "Duas casas.",
    pendingTreatment: "Nao considera previsto.",
    canceledTreatment: "Segue tratamento das receitas/despesas realizadas."
  },
  consolidatedBalance: {
    name: "Saldo consolidado",
    definition: "Saldo atual das carteiras marcadas para compor o total.",
    formula: "Saldo inicial das FinancialAccounts + CashMovements ativos por conta.",
    source: "FinancialAccount e CashMovement via getWalletBalances.",
    unit: "BRL",
    rounding: "Duas casas.",
    pendingTreatment: "Nao considera previsoes.",
    canceledTreatment: "Movimentos revertidos nao entram."
  },
  projectedBalance: {
    name: "Saldo projetado",
    definition: "Estimativa simples considerando saldo atual, valores a receber e valores a pagar em aberto.",
    formula: "Saldo consolidado + receita prevista - despesa prevista.",
    source: "Wallets, FinancialTitle e legados nao sincronizados.",
    unit: "BRL",
    rounding: "Duas casas.",
    pendingTreatment: "Inclui titulos em aberto como previsao, nao como realizado.",
    canceledTreatment: "Cancelados nao entram."
  },
  overdue: {
    name: "Vencidos",
    definition: "Valores abertos com vencimento menor que hoje.",
    formula: "Soma de titulos/contas abertas vencidas a receber e a pagar.",
    source: "FinancialTitle, AccountReceivable, AccountPayable.",
    unit: "BRL",
    rounding: "Duas casas.",
    pendingTreatment: "Somente aberto vencido.",
    canceledTreatment: "Cancelados e pagos nao entram."
  }
} as const;

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolvePeriod(month?: string | null) {
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  return { month: targetMonth, ...monthBounds(targetMonth) };
}

function openLegacyStatus(status?: string | null) {
  const value = normalizeText(status || "");
  return !["pago", "recebido", "cancelado", "cancelada"].includes(value);
}

export async function getFinancialSemanticSnapshot(input: { tenantId: string; month?: string | null; category?: string | null }) {
  const { month, start, end } = resolvePeriod(input.month);
  const categoryFilter = normalizeText(input.category || "");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    wallets,
    cashMovements,
    transactions,
    titles,
    legacyReceivables,
    legacyPayables,
    budgets,
    bankTransactions,
    categories,
    accounts
  ] = await Promise.all([
    getWalletBalances(input.tenantId),
    prisma.cashMovement.findMany({
      where: {
        tenantId: input.tenantId,
        date: { gte: start, lt: end },
        status: "ACTIVE",
        source: { not: "TRANSFER" }
      },
      orderBy: { date: "desc" },
      take: 1000
    }),
    prisma.transaction.findMany({
      where: { tenantId: input.tenantId, date: { gte: start, lt: end } },
      include: { client: true },
      orderBy: { date: "desc" },
      take: 1000
    }),
    prisma.financialTitle.findMany({
      where: { tenantId: input.tenantId, status: { in: ["OPEN", "PARTIAL"] } },
      include: { settlements: true },
      orderBy: { dueDate: "asc" },
      take: 500
    }),
    prisma.accountReceivable.findMany({ where: { tenantId: input.tenantId }, include: { client: true }, orderBy: { dueDate: "asc" }, take: 500 }),
    prisma.accountPayable.findMany({ where: { tenantId: input.tenantId }, orderBy: { dueDate: "asc" }, take: 500 }),
    prisma.budget.findMany({ where: { tenantId: input.tenantId, month }, include: { lines: true }, take: 8 }),
    prisma.bankTransaction.findMany({ where: { tenantId: input.tenantId, status: "POSTED" }, orderBy: { date: "desc" }, take: 100 }),
    prisma.category.findMany({ where: { tenantId: input.tenantId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.financialAccount.findMany({ where: { tenantId: input.tenantId, status: "ativa" }, orderBy: { name: "asc" } })
  ]);

  const ledgerSource = cashMovements.length
    ? cashMovements.map((item) => ({
        id: item.id,
        date: item.date,
        direction: item.direction as "IN" | "OUT",
        amount: item.amountCents / 100,
        amountCents: item.amountCents,
        account: item.accountName,
        category: item.category || "A conferir",
        costCenter: item.costCenter || "",
        description: item.description,
        contact: "",
        source: item.source,
        status: item.status
      }))
    : transactions.map((item) => ({
        id: item.id,
        date: item.date,
        direction: item.type === "entrada" ? "IN" as const : "OUT" as const,
        amount: Number(item.amount || 0),
        amountCents: Math.round(Number(item.amount || 0) * 100),
        account: item.account || "outro",
        category: item.category || "A conferir",
        costCenter: item.costCenter || "",
        description: item.description,
        contact: item.client?.name || "",
        source: item.source || "Transaction",
        status: item.status
      }));

  const ledger = categoryFilter
    ? ledgerSource.filter((item) => normalizeText(item.category).includes(categoryFilter) || normalizeText(item.description).includes(categoryFilter))
    : ledgerSource;

  const totals = {
    realizedRevenue: ledger.filter((item) => item.direction === "IN").reduce((sum, item) => sum + item.amount, 0),
    realizedExpense: ledger.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + item.amount, 0),
    entries: ledger.length,
    consolidatedBalance: wallets.reduce((sum, item) => sum + item.balance, 0)
  };

  const budgetByKey = new Map<string, number>();
  for (const line of budgets.flatMap((budget) => budget.lines)) {
    const key = `${line.type}|${normalizeText(line.category || "A conferir")}`;
    budgetByKey.set(key, (budgetByKey.get(key) || 0) + line.budgetedCents / 100);
  }

  const byCategoryMap = new Map<string, {
    category: string;
    inputs: number;
    outputs: number;
    net: number;
    entries: number;
    budgeted: number;
    variance: number;
    share: number;
    directionLabel: string;
  }>();

  for (const item of ledger) {
    const category = item.category || "A conferir";
    const current = byCategoryMap.get(category) ?? {
      category,
      inputs: 0,
      outputs: 0,
      net: 0,
      entries: 0,
      budgeted: 0,
      variance: 0,
      share: 0,
      directionLabel: "Misto"
    };
    if (item.direction === "IN") current.inputs += item.amount;
    if (item.direction === "OUT") current.outputs += item.amount;
    current.net = current.inputs - current.outputs;
    current.entries += 1;
    current.directionLabel = current.inputs >= current.outputs ? "Entrada" : "Saida";
    byCategoryMap.set(category, current);
  }

  const outputTotal = totals.realizedExpense || 1;
  const byCategory = Array.from(byCategoryMap.values()).map((row) => {
    const outBudget = budgetByKey.get(`saida|${normalizeText(row.category)}`) || 0;
    const inBudget = budgetByKey.get(`entrada|${normalizeText(row.category)}`) || 0;
    const budgeted = outBudget || inBudget;
    return {
      ...row,
      budgeted,
      variance: budgeted ? budgeted - (outBudget ? row.outputs : row.inputs) : 0,
      share: row.outputs ? (row.outputs / outputTotal) * 100 : 0
    };
  }).sort((a, b) => Math.max(b.outputs, b.inputs) - Math.max(a.outputs, a.inputs));

  const groupBy = <T extends { inputs: number; outputs: number; net: number; entries: number }>(map: Map<string, T>, key: string, item: (typeof ledger)[number], make: () => T) => {
    const row = map.get(key) ?? make();
    if (item.direction === "IN") row.inputs += item.amount;
    if (item.direction === "OUT") row.outputs += item.amount;
    row.net = row.inputs - row.outputs;
    row.entries += 1;
    map.set(key, row);
  };

  const byAccountMap = new Map<string, { account: string; inputs: number; outputs: number; net: number; entries: number }>();
  const byCostCenterMap = new Map<string, { costCenter: string; inputs: number; outputs: number; net: number; entries: number }>();
  for (const item of ledger) {
    const account = item.account || "Sem conta";
    groupBy(byAccountMap, account, item, () => ({ account, inputs: 0, outputs: 0, net: 0, entries: 0 }));
    const costCenter = item.costCenter || "Sem centro de custo";
    groupBy(byCostCenterMap, costCenter, item, () => ({ costCenter, inputs: 0, outputs: 0, net: 0, entries: 0 }));
  }

  const openAmount = (item: any) => financialTitleOpenCents(item) / 100;
  const receivableTitles = titles.filter((item) => item.type === "RECEIVABLE").map((item) => ({
    id: item.id,
    legacyId: item.legacyId,
    description: item.description,
    category: item.category,
    dueDate: item.dueDate,
    amount: openAmount(item),
    overdue: item.dueDate < today,
    source: "titulo"
  }));
  const payableTitles = titles.filter((item) => item.type === "PAYABLE").map((item) => ({
    id: item.id,
    legacyId: item.legacyId,
    description: item.description,
    category: item.category,
    dueDate: item.dueDate,
    amount: openAmount(item),
    overdue: item.dueDate < today,
    source: "titulo"
  }));
  const syncedReceivableIds = new Set(receivableTitles.map((item) => item.legacyId).filter(Boolean));
  const syncedPayableIds = new Set(payableTitles.map((item) => item.legacyId).filter(Boolean));
  const receivables = [
    ...receivableTitles,
    ...legacyReceivables.filter((item) => openLegacyStatus(item.status) && !syncedReceivableIds.has(item.id)).map((item) => ({
      id: item.id,
      description: item.description,
      category: item.type,
      dueDate: item.dueDate,
      amount: Number(item.amount || 0),
      overdue: item.dueDate < today,
      source: "legado"
    }))
  ];
  const payables = [
    ...payableTitles,
    ...legacyPayables.filter((item) => openLegacyStatus(item.status) && !syncedPayableIds.has(item.id)).map((item) => ({
      id: item.id,
      description: item.description,
      category: item.category,
      dueDate: item.dueDate,
      amount: Number(item.amount || 0),
      overdue: item.dueDate < today,
      source: "legado"
    }))
  ];

  const pending = {
    receivableOpen: receivables.reduce((sum, item) => sum + item.amount, 0),
    payableOpen: payables.reduce((sum, item) => sum + item.amount, 0),
    overdueReceivable: receivables.filter((item) => item.overdue).reduce((sum, item) => sum + item.amount, 0),
    overduePayable: payables.filter((item) => item.overdue).reduce((sum, item) => sum + item.amount, 0),
    receivables: receivables.slice(0, 20),
    payables: payables.slice(0, 20)
  };

  const dataQuality = {
    uncategorizedCount: ledger.filter((item) => normalizeText(item.category).includes("conferir")).length,
    uncategorizedAmount: ledger.filter((item) => normalizeText(item.category).includes("conferir")).reduce((sum, item) => sum + item.amount, 0),
    missingAccountCount: ledger.filter((item) => !item.account).length,
    unreconciledBankTransactions: bankTransactions.length
  };
  const qualityIssues = [
    dataQuality.uncategorizedCount ? `${dataQuality.uncategorizedCount} lancamento(s) em A conferir` : "",
    dataQuality.missingAccountCount ? `${dataQuality.missingAccountCount} lancamento(s) sem conta` : "",
    dataQuality.unreconciledBankTransactions ? `${dataQuality.unreconciledBankTransactions} item(ns) de extrato aguardando revisao` : ""
  ].filter(Boolean);

  const alerts = [
    pending.overdueReceivable > 0 ? `Existe R$ ${pending.overdueReceivable.toFixed(2)} a receber vencido.` : "",
    pending.overduePayable > 0 ? `Existe R$ ${pending.overduePayable.toFixed(2)} a pagar vencido.` : "",
    totals.realizedRevenue - totals.realizedExpense < 0 ? `O resultado do periodo esta negativo em R$ ${Math.abs(totals.realizedRevenue - totals.realizedExpense).toFixed(2)}.` : "",
    ...qualityIssues
  ].filter(Boolean);

  return {
    month,
    period: { start, end },
    definitions: financialMetricCatalog,
    filters: { category: input.category || "" },
    metrics: {
      realizedRevenue: totals.realizedRevenue,
      expectedRevenue: pending.receivableOpen,
      realizedExpense: totals.realizedExpense,
      expectedExpense: pending.payableOpen,
      result: totals.realizedRevenue - totals.realizedExpense,
      consolidatedBalance: totals.consolidatedBalance,
      projectedBalance: totals.consolidatedBalance + pending.receivableOpen - pending.payableOpen,
      overdueReceivable: pending.overdueReceivable,
      overduePayable: pending.overduePayable,
      entries: totals.entries
    },
    totals: {
      inputs: totals.realizedRevenue,
      outputs: totals.realizedExpense,
      entries: totals.entries,
      walletTotal: totals.consolidatedBalance,
      result: totals.realizedRevenue - totals.realizedExpense,
      projectedBalance: totals.consolidatedBalance + pending.receivableOpen - pending.payableOpen
    },
    wallets,
    accounts,
    categories,
    byCategory,
    byAccount: Array.from(byAccountMap.values()).sort((a, b) => Math.max(b.outputs, b.inputs) - Math.max(a.outputs, a.inputs)),
    byCostCenter: Array.from(byCostCenterMap.values()).sort((a, b) => Math.max(b.outputs, b.inputs) - Math.max(a.outputs, a.inputs)),
    topMovements: [...ledger].sort((a, b) => b.amount - a.amount).slice(0, 20),
    pending,
    dataQuality: {
      ...dataQuality,
      level: qualityIssues.length >= 3 ? "baixa" : qualityIssues.length ? "media" : "alta",
      issues: qualityIssues
    },
    alerts
  };
}

export type FinancialSemanticSnapshot = Awaited<ReturnType<typeof getFinancialSemanticSnapshot>>;
