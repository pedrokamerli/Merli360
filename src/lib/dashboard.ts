import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/format";
import { getWalletBalances } from "@/lib/wallets";
import { financialTitleOpenCents } from "@/lib/financial-ledger";
import { unstable_noStore as noStore } from "next/cache";
import { requireUser } from "@/lib/auth";

const paidLike = ["pago", "realizado", "recebido"];

export async function getDashboard(month: string) {
  noStore();
  const user = await requireUser();
  const { start, end } = monthBounds(month);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = (days: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + days);
    return date;
  };
  const [clients, recurringClients, transactions, cashMovements, financialTitles, invoices, receivables, payables, futureReceivables, futurePayables, adBudgets, goals, leads, wallets, sales, products, plantings] = await Promise.all([
    prisma.client.findMany({ where: { tenantId: user.tenantId, status: "ativo" } }),
    prisma.client.findMany({ where: { tenantId: user.tenantId, status: "ativo", type: "recorrente" } }),
    prisma.transaction.findMany({ where: { tenantId: user.tenantId, date: { gte: start, lt: end } } }),
    prisma.cashMovement.findMany({
      where: { tenantId: user.tenantId, date: { gte: start, lt: end }, status: "ACTIVE", source: { not: "TRANSFER" } }
    }),
    prisma.financialTitle.findMany({
      where: { tenantId: user.tenantId, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lte: horizon(90) } },
      include: { settlements: true }
    }),
    prisma.invoice.findMany({ where: { tenantId: user.tenantId, referenceMonth: month } }),
    prisma.accountReceivable.findMany({ where: { tenantId: user.tenantId, dueDate: { gte: start, lt: end } } }),
    prisma.accountPayable.findMany({ where: { tenantId: user.tenantId, dueDate: { gte: start, lt: end } } }),
    prisma.accountReceivable.findMany({ where: { tenantId: user.tenantId, status: { not: "pago" }, dueDate: { lte: horizon(90) } } }),
    prisma.accountPayable.findMany({ where: { tenantId: user.tenantId, status: { not: "pago" }, dueDate: { lte: horizon(90) } } }),
    prisma.adBudget.findMany({ where: { tenantId: user.tenantId, referenceMonth: month } }),
    prisma.goal.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.lead.findMany({ where: { tenantId: user.tenantId } }),
    getWalletBalances(user.tenantId),
    prisma.sale.findMany({ where: { tenantId: user.tenantId, saleDate: { gte: start, lt: end } } }),
    prisma.product.findMany({ where: { tenantId: user.tenantId } }),
    prisma.planting.findMany({ where: { tenantId: user.tenantId } })
  ]);

  const activeMrr = recurringClients.reduce((sum, client) => sum + client.monthlyValue, 0);
  const useLedger = cashMovements.length > 0 || financialTitles.length > 0;
  const monthInputs = useLedger
    ? cashMovements.filter((item) => item.direction === "IN").reduce((sum, item) => sum + item.amountCents / 100, 0)
    : transactions.filter((item) => item.type === "entrada").reduce((sum, item) => sum + item.amount, 0);
  const monthOutputs = useLedger
    ? cashMovements.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + item.amountCents / 100, 0)
    : transactions.filter((item) => item.type === "saida").reduce((sum, item) => sum + item.amount, 0);
  const monthBalance = monthInputs - monthOutputs;
  const recurringReceived = transactions
    .filter((item) => item.type === "entrada" && item.category.toLowerCase().includes("recorrente"))
    .reduce((sum, item) => sum + item.amount, 0);
  const oneTimeRevenue = transactions
    .filter((item) => item.type === "entrada" && item.category.toLowerCase().includes("avulso"))
    .reduce((sum, item) => sum + item.amount, 0);
  const companyExpenses = transactions
    .filter((item) => item.type === "saida" && (item.costCenter ?? "").toLowerCase() === "empresa")
    .reduce((sum, item) => sum + item.amount, 0);
  const personalExpenses = transactions
    .filter((item) => item.type === "saida" && (item.costCenter ?? "").toLowerCase() === "pessoal")
    .reduce((sum, item) => sum + item.amount, 0);
  const sharedExpenses = transactions
    .filter((item) => item.type === "saida" && (item.costCenter ?? "").toLowerCase().includes("compartilh"))
    .reduce((sum, item) => sum + item.amount, 0);
  const adSpend = adBudgets.reduce((sum, item) => sum + item.spentAmount, 0);
  const pendingReimbursements = adBudgets.reduce((sum, item) => sum + item.reimbursementDue, 0);
  const ledgerReceivables = financialTitles.filter((item) => item.type === "RECEIVABLE");
  const ledgerPayables = financialTitles.filter((item) => item.type === "PAYABLE");
  const receivableOpen = useLedger ? ledgerReceivables.reduce((sum, item) => sum + financialTitleOpenCents(item) / 100, 0) : receivables.filter((item) => item.status !== "pago").reduce((sum, item) => sum + item.amount, 0);
  const receivablePaid = receivables.filter((item) => item.status === "pago").reduce((sum, item) => sum + item.amount, 0);
  const receivableExpected = useLedger ? ledgerReceivables.reduce((sum, item) => sum + financialTitleOpenCents(item) / 100, 0) : receivables.reduce((sum, item) => sum + item.amount, 0);
  const payableOpen = useLedger ? ledgerPayables.reduce((sum, item) => sum + financialTitleOpenCents(item) / 100, 0) : payables.filter((item) => item.status !== "pago").reduce((sum, item) => sum + item.amount, 0);
  const payablePaid = payables.filter((item) => item.status === "pago").reduce((sum, item) => sum + item.amount, 0);
  const payableExpected = useLedger ? ledgerPayables.reduce((sum, item) => sum + financialTitleOpenCents(item) / 100, 0) : payables.reduce((sum, item) => sum + item.amount, 0);
  const currentBalance = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
  const openReceivableUntil = (date: Date) => useLedger ? ledgerReceivables.filter((item) => item.dueDate <= date).reduce((sum, item) => sum + financialTitleOpenCents(item) / 100, 0) : futureReceivables.filter((item) => item.dueDate <= date).reduce((sum, item) => sum + item.amount, 0);
  const openPayableUntil = (date: Date) => useLedger ? ledgerPayables.filter((item) => item.dueDate <= date).reduce((sum, item) => sum + financialTitleOpenCents(item) / 100, 0) : futurePayables.filter((item) => item.dueDate <= date).reduce((sum, item) => sum + item.amount, 0);
  const overdueReceivables = useLedger ? ledgerReceivables.filter((item) => item.dueDate < today).reduce((sum, item) => sum + financialTitleOpenCents(item) / 100, 0) : futureReceivables.filter((item) => item.dueDate < today).reduce((sum, item) => sum + item.amount, 0);
  const overduePayables = useLedger ? ledgerPayables.filter((item) => item.dueDate < today).reduce((sum, item) => sum + financialTitleOpenCents(item) / 100, 0) : futurePayables.filter((item) => item.dueDate < today).reduce((sum, item) => sum + item.amount, 0);
  const invoicesToIssue = invoices.filter((item) => ["emitir", "pendente"].includes(item.status.toLowerCase()));
  const invoicesIssued = invoices.filter((item) => paidLike.includes(item.status.toLowerCase()) || item.status.toLowerCase() === "emitida");
  const potentialValue = leads
    .filter((lead) => !["Fechado", "Perdido"].includes(lead.status))
    .reduce((sum, lead) => sum + lead.proposedValue * lead.closeChance, 0);
  const salesTotal = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const stockQuantity = products.reduce((sum, product) => sum + product.currentStock, 0);
  const upcomingHarvests = plantings.filter((planting) => {
    if (!planting.expectedHarvest || ["colhido", "perdido"].includes(planting.status)) return false;
    return planting.expectedHarvest >= start && planting.expectedHarvest < end;
  }).length;

  return {
    month,
    activeMrr,
    activeClients: clients.length,
    recurringClients: recurringClients.length,
    oneTimeRevenue,
    recurringReceived,
    totalRevenue: monthInputs,
    expectedRevenue: receivableExpected,
    expectedExpenses: payableExpected,
    monthInputs,
    monthOutputs,
    companyExpenses,
    personalExpenses,
    sharedExpenses,
    adSpend,
    pendingReimbursements,
    estimatedNetProfit: monthBalance,
    monthBalance,
    receivableOpen,
    receivablePaid,
    payableOpen,
    payablePaid,
    invoicesToIssue: invoicesToIssue.length,
    invoicesIssued: invoicesIssued.length,
    invoicesIssuedValue: invoicesIssued.reduce((sum, item) => sum + item.amount, 0),
    ads: {
      received: adBudgets.reduce((sum, item) => sum + item.receivedAmount, 0),
      spent: adSpend,
      balance: adBudgets.reduce((sum, item) => sum + item.balance, 0),
      pendingReimbursements,
      activeCampaigns: adBudgets.filter((item) => item.status === "ativo").length,
      toReview: adBudgets.filter((item) => item.status === "conferir").length
    },
    wallets,
    currentBalance,
    projection: {
      days30: currentBalance + openReceivableUntil(horizon(30)) - openPayableUntil(horizon(30)),
      days60: currentBalance + openReceivableUntil(horizon(60)) - openPayableUntil(horizon(60)),
      days90: currentBalance + openReceivableUntil(horizon(90)) - openPayableUntil(horizon(90)),
      overdueReceivables,
      overduePayables
    },
    tenantKind: user.tenant.kind,
    rural: {
      salesCount: sales.length,
      salesTotal,
      productsCount: products.length,
      stockQuantity,
      upcomingHarvests,
      pendingSales: sales.filter((sale) => sale.status !== "recebido" && sale.status !== "pago").length,
      deliveries: sales.filter((sale) => sale.deliveryDate && sale.deliveryDate >= start && sale.deliveryDate < end).length
    },
    commercial: {
      activeLeads: leads.filter((lead) => !["Fechado", "Perdido"].includes(lead.status)).length,
      proposals: leads.filter((lead) => lead.status === "Proposta enviada").length,
      potentialValue,
      closedThisMonth: leads.filter((lead) => lead.status === "Fechado").length,
      conversionRate: leads.length ? leads.filter((lead) => lead.status === "Fechado").length / leads.length : 0
    },
    goals,
    chart: [
      { label: "Entradas", value: monthInputs },
      { label: "Saidas", value: monthOutputs },
      { label: "Saldo", value: monthBalance },
      { label: "A receber", value: receivableOpen },
      { label: "A pagar", value: payableOpen },
      { label: "Ads", value: adSpend }
    ]
  };
}
