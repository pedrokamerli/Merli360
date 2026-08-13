import { prisma } from "@/lib/prisma";
import { formatDate, money, monthBounds } from "@/lib/format";
import { financialTitleOpenCents } from "@/lib/financial-ledger";
import { getWalletBalances } from "@/lib/wallets";
import { getFinancialSemanticSnapshot } from "@/lib/semantic-finance";

export type ReportModel = keyof typeof reportConfigs;

export const reportConfigs = {
  cashMovements: {
    title: "Fluxo Realizado",
    filename: "fluxo-realizado",
    columns: [
      ["date", "Data"],
      ["directionLabel", "Tipo"],
      ["description", "Descricao"],
      ["accountName", "Conta"],
      ["category", "Categoria"],
      ["costCenter", "Centro de custo"],
      ["amount", "Valor"],
      ["source", "Origem"],
      ["status", "Status"]
    ]
  },
  financialTitles: {
    title: "Titulos Financeiros",
    filename: "titulos-financeiros",
    columns: [
      ["typeLabel", "Tipo"],
      ["description", "Descricao"],
      ["contactName", "Contato"],
      ["category", "Categoria"],
      ["dueDate", "Vencimento"],
      ["originalAmount", "Valor original"],
      ["openAmount", "Saldo aberto"],
      ["status", "Status"]
    ]
  },
  bankTransactions: {
    title: "Extrato Bancario Importado",
    filename: "extrato-bancario-importado",
    columns: [
      ["date", "Data"],
      ["directionLabel", "Tipo"],
      ["description", "Descricao"],
      ["accountName", "Conta"],
      ["categorySuggestion", "Categoria sugerida"],
      ["amount", "Valor"],
      ["status", "Status"]
    ]
  },
  transfers: {
    title: "Transferencias",
    filename: "transferencias",
    columns: [
      ["date", "Data"],
      ["fromAccountName", "Origem"],
      ["toAccountName", "Destino"],
      ["amount", "Valor"],
      ["description", "Descricao"],
      ["status", "Status"]
    ]
  },
  budgetVariance: {
    title: "Orcado versus Realizado",
    filename: "orcado-versus-realizado",
    columns: [
      ["category", "Categoria"],
      ["type", "Tipo"],
      ["budgeted", "Orcado"],
      ["realized", "Realizado"],
      ["variance", "Diferenca"]
    ]
  },
  categorySummary: {
    title: "Resumo por Categoria",
    filename: "resumo-por-categoria",
    columns: [
      ["category", "Categoria"],
      ["directionLabel", "Tipo principal"],
      ["inputs", "Entradas"],
      ["outputs", "Saidas"],
      ["net", "Resultado"],
      ["entries", "Lancamentos"],
      ["share", "% das saidas"],
      ["budgeted", "Orcado"],
      ["variance", "Diferenca"]
    ]
  },
  transactions: {
    title: "Fluxo Legado",
    filename: "fluxo-legado",
    columns: [
      ["date", "Data"],
      ["description", "Descricao"],
      ["type", "Tipo"],
      ["category", "Categoria"],
      ["subcategory", "Subcategoria"],
      ["clientName", "Contato"],
      ["amount", "Valor"],
      ["status", "Status"],
      ["account", "Conta"],
      ["paymentMethod", "Forma de pagamento"]
    ]
  },
  clients: {
    title: "Contatos",
    filename: "contatos",
    columns: [
      ["name", "Contato"],
      ["type", "Modelo"],
      ["monthlyValue", "Valor recorrente"],
      ["dueDay", "Dia de vencimento"],
      ["status", "Status"],
      ["services", "Descricao"],
      ["mainChannel", "Origem"],
      ["startDate", "Data de inicio"],
      ["growthPotential", "Potencial de aumento"],
      ["perceivedProfit", "Rentabilidade"]
    ]
  },
  receivables: {
    title: "Contas a Receber",
    filename: "contas-a-receber",
    columns: [
      ["clientName", "Contato"],
      ["description", "Descricao"],
      ["amount", "Valor"],
      ["dueDate", "Vencimento"],
      ["paidDate", "Recebimento"],
      ["status", "Status"],
      ["type", "Tipo"]
    ]
  },
  payables: {
    title: "Contas a Pagar",
    filename: "contas-a-pagar",
    columns: [
      ["description", "Descricao"],
      ["category", "Categoria"],
      ["amount", "Valor"],
      ["dueDate", "Vencimento"],
      ["paidDate", "Pagamento"],
      ["status", "Status"],
      ["recurring", "Recorrente"]
    ]
  },
  invoices: {
    title: "Notas Fiscais",
    filename: "notas-fiscais",
    columns: [
      ["clientName", "Contato"],
      ["referenceMonth", "Mes"],
      ["serviceDescription", "Servico"],
      ["amount", "Valor"],
      ["expectedIssueDate", "Previsao de emissao"],
      ["issueDate", "Emissao"],
      ["invoiceNumber", "Numero"],
      ["status", "Status"]
    ]
  }
} as const;

const moneyKeys = new Set([
  "amount",
  "monthlyValue",
  "growthPotential",
  "originalAmount",
  "openAmount",
  "budgeted",
  "realized",
  "variance",
  "inputs",
  "outputs",
  "net"
]);

const dateKeys = new Set(["date", "startDate", "dueDate", "paidDate", "expectedIssueDate", "issueDate"]);

function isOverdue(row: Record<string, unknown>) {
  if (row.status === "pago" || row.status === "PAID") return false;
  if (!row.dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(String(row.dueDate));
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function directionLabel(direction: string) {
  return direction === "IN" ? "Entrada" : "Saida";
}

function normalizeStatus(row: Record<string, unknown>) {
  return isOverdue(row) ? "atrasado" : row.status;
}

function plainMoney(value: number) {
  return money.format(Number(value || 0));
}

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

export type FinancialReportData = Awaited<ReturnType<typeof getFinancialReportData>>;

export async function getFinancialReportData(input: { tenantId: string; month?: string | null; category?: string | null }) {
  return getFinancialSemanticSnapshot(input);

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
    inputs: ledger.filter((item) => item.direction === "IN").reduce((sum, item) => sum + item.amount, 0),
    outputs: ledger.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + item.amount, 0),
    entries: ledger.length,
    walletTotal: wallets.reduce((sum, item) => sum + item.balance, 0)
  };
  const outputTotal = totals.outputs || 1;

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

  const byAccountMap = new Map<string, { account: string; inputs: number; outputs: number; net: number; entries: number }>();
  const byCostCenterMap = new Map<string, { costCenter: string; inputs: number; outputs: number; net: number; entries: number }>();
  for (const item of ledger) {
    const account = item.account || "Sem conta";
    const accountRow = byAccountMap.get(account) ?? { account, inputs: 0, outputs: 0, net: 0, entries: 0 };
    if (item.direction === "IN") accountRow.inputs += item.amount;
    if (item.direction === "OUT") accountRow.outputs += item.amount;
    accountRow.net = accountRow.inputs - accountRow.outputs;
    accountRow.entries += 1;
    byAccountMap.set(account, accountRow);

    const costCenter = item.costCenter || "Sem centro de custo";
    const costRow = byCostCenterMap.get(costCenter) ?? { costCenter, inputs: 0, outputs: 0, net: 0, entries: 0 };
    if (item.direction === "IN") costRow.inputs += item.amount;
    if (item.direction === "OUT") costRow.outputs += item.amount;
    costRow.net = costRow.inputs - costRow.outputs;
    costRow.entries += 1;
    byCostCenterMap.set(costCenter, costRow);
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
    ...legacyReceivables.filter((item) => item.status !== "pago" && !syncedReceivableIds.has(item.id)).map((item) => ({
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
    ...legacyPayables.filter((item) => item.status !== "pago" && !syncedPayableIds.has(item.id)).map((item) => ({
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

  const alerts = [
    pending.overdueReceivable > 0 ? `Existe ${plainMoney(pending.overdueReceivable)} a receber vencido.` : "",
    pending.overduePayable > 0 ? `Existe ${plainMoney(pending.overduePayable)} a pagar vencido.` : "",
    totals.inputs - totals.outputs < 0 ? `O resultado do periodo esta negativo em ${plainMoney(Math.abs(totals.inputs - totals.outputs))}.` : "",
    bankTransactions.length ? `${bankTransactions.length} item(ns) de extrato ainda precisam de revisao.` : "",
    byCategory.some((item) => normalizeText(item.category).includes("conferir")) ? "Ha lancamentos em A conferir; isso reduz a precisao dos relatorios por categoria." : ""
  ].filter(Boolean);

  return {
    month,
    period: { start, end },
    filters: { category: input.category || "" },
    totals: {
      ...totals,
      result: totals.inputs - totals.outputs,
      projectedBalance: totals.walletTotal + pending.receivableOpen - pending.payableOpen
    },
    wallets,
    accounts,
    categories,
    byCategory,
    byAccount: Array.from(byAccountMap.values()).sort((a, b) => Math.max(b.outputs, b.inputs) - Math.max(a.outputs, a.inputs)),
    byCostCenter: Array.from(byCostCenterMap.values()).sort((a, b) => Math.max(b.outputs, b.inputs) - Math.max(a.outputs, a.inputs)),
    topMovements: [...ledger].sort((a, b) => b.amount - a.amount).slice(0, 20),
    pending,
    alerts
  };
}

export function financialReportFallbackText(report: FinancialReportData, reportType = "financeiro") {
  const categoryLines = report.byCategory.slice(0, 10).map((item) =>
    `- ${item.category}: entradas ${plainMoney(item.inputs)}, saidas ${plainMoney(item.outputs)}, resultado ${plainMoney(item.net)}${item.outputs ? `, ${item.share.toFixed(1)}% das saidas` : ""}`
  );
  const movementLines = report.topMovements.slice(0, 8).map((item) =>
    `- ${formatDate(item.date)} - ${item.direction === "IN" ? "Entrada" : "Saida"} - ${item.description}: ${plainMoney(item.amount)} (${item.category}, ${item.account})`
  );
  return [
    `Relatorio ${reportType} de ${report.month}`,
    "",
    "Resumo:",
    `Entradas: ${plainMoney(report.totals.inputs)}`,
    `Saidas: ${plainMoney(report.totals.outputs)}`,
    `Resultado: ${plainMoney(report.totals.result)}`,
    `Saldo consolidado das carteiras: ${plainMoney(report.totals.walletTotal)}`,
    `Saldo projetado com contas abertas: ${plainMoney(report.totals.projectedBalance)}`,
    "",
    "Categorias:",
    categoryLines.length ? categoryLines.join("\n") : "Nenhuma movimentacao encontrada no periodo.",
    "",
    "Pendencias:",
    `A receber aberto: ${plainMoney(report.pending.receivableOpen)} (${plainMoney(report.pending.overdueReceivable)} vencido)`,
    `A pagar aberto: ${plainMoney(report.pending.payableOpen)} (${plainMoney(report.pending.overduePayable)} vencido)`,
    "",
    report.alerts.length ? `Alertas:\n${report.alerts.map((item) => `- ${item}`).join("\n")}` : "Alertas: nenhum ponto critico encontrado.",
    movementLines.length ? `\nMaiores lancamentos:\n${movementLines.join("\n")}` : "",
    "",
    "Proxima acao sugerida: revise categorias em aberto, resolva vencidos e mantenha os lancamentos conciliados para o proximo relatorio ficar mais preciso."
  ].filter(Boolean).join("\n");
}

export function formatReportValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  if (moneyKeys.has(key) && typeof value === "number") return money.format(value);
  if (key === "share" && typeof value === "number") return `${value.toFixed(1)}%`;
  if (dateKeys.has(key)) return formatDate(value as string | Date);
  return String(value);
}

export async function getReportRows(model: string, tenantId: string, month?: string | null) {
  if (!(model in reportConfigs)) return null;
  const tenantWhere = { tenantId };

  if (model === "cashMovements") {
    const rows = await prisma.cashMovement.findMany({ where: tenantWhere, orderBy: { date: "desc" } });
    return rows.map((row) => ({
      ...row,
      directionLabel: directionLabel(row.direction),
      amount: row.amountCents / 100
    }));
  }

  if (model === "financialTitles") {
    const rows = await prisma.financialTitle.findMany({
      where: tenantWhere,
      include: { settlements: true },
      orderBy: { dueDate: "desc" }
    });
    const clients = await prisma.client.findMany({ where: tenantWhere, select: { id: true, name: true } });
    return rows.map((row) => ({
      ...row,
      typeLabel: row.type === "RECEIVABLE" ? "A receber" : "A pagar",
      contactName: clients.find((client) => client.id === row.contactLegacyId)?.name ?? "",
      originalAmount: row.originalAmountCents / 100,
      openAmount: financialTitleOpenCents(row) / 100,
      status: normalizeStatus(row)
    }));
  }

  if (model === "bankTransactions") {
    const rows = await prisma.bankTransaction.findMany({ where: tenantWhere, orderBy: { date: "desc" } });
    return rows.map((row) => ({
      ...row,
      directionLabel: directionLabel(row.direction),
      amount: row.amountCents / 100
    }));
  }

  if (model === "transfers") {
    const rows = await prisma.transfer.findMany({ where: tenantWhere, orderBy: { date: "desc" } });
    return rows.map((row) => ({ ...row, amount: row.amountCents / 100 }));
  }

  if (model === "budgetVariance") {
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const { start, end } = monthBounds(targetMonth);
    const [budgets, movements] = await Promise.all([
      prisma.budget.findMany({ where: { tenantId, month: targetMonth }, include: { lines: true } }),
      prisma.cashMovement.findMany({
        where: { tenantId, date: { gte: start, lt: end }, status: "ACTIVE", source: { not: "TRANSFER" } }
      })
    ]);
    const rows = new Map<string, { category: string; type: string; budgeted: number; realized: number; variance: number }>();
    for (const line of budgets.flatMap((budget) => budget.lines)) {
      const key = `${line.type}|${line.category}`;
      const current = rows.get(key) ?? { category: line.category, type: line.type, budgeted: 0, realized: 0, variance: 0 };
      current.budgeted += line.budgetedCents / 100;
      rows.set(key, current);
    }
    for (const movement of movements) {
      const type = movement.direction === "IN" ? "entrada" : "saida";
      const key = `${type}|${movement.category}`;
      const current = rows.get(key) ?? { category: movement.category, type, budgeted: 0, realized: 0, variance: 0 };
      current.realized += movement.amountCents / 100;
      rows.set(key, current);
    }
    return Array.from(rows.values()).map((row) => ({ ...row, variance: row.budgeted - row.realized }));
  }

  if (model === "categorySummary") {
    const report = await getFinancialReportData({ tenantId, month });
    return report.byCategory;
  }

  if (model === "transactions") {
    const rows = await prisma.transaction.findMany({ where: tenantWhere, include: { client: true }, orderBy: { date: "desc" } });
    return rows.map((row) => ({ ...row, clientName: row.client?.name ?? "" }));
  }

  if (model === "clients") return prisma.client.findMany({ where: tenantWhere, orderBy: { name: "asc" } });

  if (model === "receivables") {
    const rows = await prisma.accountReceivable.findMany({ where: tenantWhere, include: { client: true }, orderBy: { dueDate: "desc" } });
    return rows.map((row) => ({ ...row, clientName: row.client?.name ?? "", status: normalizeStatus(row) }));
  }

  if (model === "payables") {
    const rows = await prisma.accountPayable.findMany({ where: tenantWhere, orderBy: { dueDate: "desc" } });
    return rows.map((row) => ({ ...row, status: normalizeStatus(row) }));
  }

  if (model === "invoices") {
    const rows = await prisma.invoice.findMany({ where: tenantWhere, include: { client: true }, orderBy: { expectedIssueDate: "desc" } });
    return rows.map((row) => ({ ...row, clientName: row.client?.name ?? "" }));
  }

  return [];
}

export function getSelectedColumns(model: string, selected?: string | null) {
  const config = reportConfigs[model as ReportModel];
  if (!config) return [];
  const columns = config.columns as readonly (readonly [string, string])[];
  const allowed = new Set(columns.map(([key]) => key));
  const selectedKeys = selected ? selected.split(",").filter((key) => allowed.has(key)) : [];
  const keys = selectedKeys.length ? selectedKeys : columns.map(([key]) => key);
  return keys.map((key) => columns.find(([columnKey]) => columnKey === key)!);
}
