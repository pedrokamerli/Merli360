import { prisma } from "@/lib/prisma";

type PendingSeverity = "high" | "medium" | "low";

export type PendingCenterItem = {
  id: string;
  type: string;
  severity: PendingSeverity;
  title: string;
  description: string;
  amountCents?: number;
  date?: Date | null;
  href: string;
  source: string;
};

export type PendingCenterData = {
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
    overdue: number;
    reviewBankTransactions: number;
    pendingAiPlans: number;
    looseAttachments: number;
  };
  items: PendingCenterItem[];
};

function isOverdue(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function titleAmountOpenCents(title: { originalAmountCents: number; settlements: Array<{ effectiveAmountCents: number; writeOffCents: number }> }) {
  const settled = title.settlements.reduce((sum, settlement) => sum + settlement.effectiveAmountCents + settlement.writeOffCents, 0);
  return Math.max(0, title.originalAmountCents - settled);
}

export async function getPendingCenter(tenantId: string, options?: { userId?: string; tenantKind?: string }): Promise<PendingCenterData> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    bankTransactions,
    cashMovements,
    financialTitles,
    receivables,
    payables,
    attachments,
    assistantPlans,
    products,
    plantings,
    sales
  ] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { tenantId, status: "POSTED" },
      orderBy: { date: "desc" },
      take: 50
    }),
    prisma.cashMovement.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        OR: [
          { category: { contains: "conferir" } },
          { category: { contains: "Conferir" } },
          { category: { contains: "A conferir" } }
        ]
      },
      orderBy: { date: "desc" },
      take: 30
    }),
    prisma.financialTitle.findMany({
      where: {
        tenantId,
        status: { in: ["OPEN", "PARTIAL"] },
        dueDate: { lt: today }
      },
      include: { settlements: true },
      orderBy: { dueDate: "asc" },
      take: 50
    }),
    prisma.accountReceivable.findMany({
      where: {
        tenantId,
        status: { notIn: ["pago", "recebido", "cancelado"] },
        dueDate: { lt: today }
      },
      orderBy: { dueDate: "asc" },
      take: 30
    }),
    prisma.accountPayable.findMany({
      where: {
        tenantId,
        status: { notIn: ["pago", "recebido", "cancelado"] },
        dueDate: { lt: today }
      },
      orderBy: { dueDate: "asc" },
      take: 30
    }),
    prisma.attachment.findMany({
      where: { tenantId, linkedModel: null },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.assistantPlan.findMany({
      where: {
        tenantId,
        ...(options?.userId ? { userId: options.userId } : {}),
        status: { in: ["Draft", "AwaitingConfirmation", "MissingData", "Executing"] }
      },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    options?.tenantKind === "agro"
      ? prisma.product.findMany({
          where: { tenantId },
          orderBy: { name: "asc" },
          take: 100
        })
      : Promise.resolve([]),
    options?.tenantKind === "agro"
      ? prisma.planting.findMany({
          where: {
            tenantId,
            expectedHarvest: { lt: today },
            status: { notIn: ["colhido", "finalizado", "perdido", "cancelado"] }
          },
          include: { product: true },
          orderBy: { expectedHarvest: "asc" },
          take: 30
        })
      : Promise.resolve([]),
    options?.tenantKind === "agro"
      ? prisma.sale.findMany({
          where: {
            tenantId,
            status: { notIn: ["pago", "recebido", "cancelado"] },
            dueDate: { lt: today }
          },
          include: { buyer: true, product: true },
          orderBy: { dueDate: "asc" },
          take: 30
        })
      : Promise.resolve([])
  ]);

  const items = ([
    ...bankTransactions.map((item) => ({
      id: `bank:${item.id}`,
      type: "Extrato importado",
      severity: "medium" as const,
      title: item.description,
      description: `Movimentacao importada em ${item.accountName}. Categoria sugerida: ${item.categorySuggestion || "revisar"}.`,
      amountCents: item.amountCents,
      date: item.date,
      href: "/conciliacao",
      source: "bankTransaction"
    })),
    ...cashMovements.map((item) => ({
      id: `cash:${item.id}`,
      type: "Fluxo a conferir",
      severity: "medium" as const,
      title: item.description,
      description: `Lancamento no fluxo marcado para conferencia em ${item.accountName}.`,
      amountCents: item.direction === "entrada" || item.direction === "IN" ? item.amountCents : -item.amountCents,
      date: item.date,
      href: "/fluxo",
      source: "cashMovement"
    })),
    ...financialTitles.map((item) => {
      const openCents = titleAmountOpenCents(item);
      return {
        id: `title:${item.id}`,
        type: item.type === "RECEIVABLE" ? "Conta a receber vencida" : "Conta a pagar vencida",
        severity: "high" as const,
        title: item.description,
        description: item.type === "RECEIVABLE" ? "Recebimento em atraso. Precisa cobrar, baixar ou conciliar." : "Pagamento em atraso. Precisa pagar, baixar ou revisar.",
        amountCents: item.type === "RECEIVABLE" ? openCents : -openCents,
        date: item.dueDate,
        href: item.type === "RECEIVABLE" ? "/receber" : "/pagar",
        source: "financialTitle"
      };
    }),
    ...receivables.map((item) => ({
      id: `receivable:${item.id}`,
      type: "Conta a receber vencida",
      severity: "high" as const,
      title: item.description,
      description: "Registro antigo de contas a receber em atraso.",
      amountCents: Math.round(item.amount * 100),
      date: item.dueDate,
      href: "/receber",
      source: "accountReceivable"
    })),
    ...payables.map((item) => ({
      id: `payable:${item.id}`,
      type: "Conta a pagar vencida",
      severity: "high" as const,
      title: item.description,
      description: "Registro antigo de contas a pagar em atraso.",
      amountCents: -Math.round(item.amount * 100),
      date: item.dueDate,
      href: "/pagar",
      source: "accountPayable"
    })),
    ...attachments.map((item) => ({
      id: `attachment:${item.id}`,
      type: "Anexo sem vinculo",
      severity: "low" as const,
      title: item.originalName,
      description: "Arquivo enviado ainda nao esta ligado a uma movimentacao, conta ou comprovante.",
      date: item.createdAt,
      href: "/comprovantes",
      source: "attachment"
    })),
    ...assistantPlans.map((item) => ({
      id: `ai:${item.id}`,
      type: "IA aguardando acao",
      severity: item.status === "Executing" ? ("high" as const) : ("medium" as const),
      title: item.intent,
      description: `Plano ${item.status.toLowerCase()} para ${item.tool}.`,
      date: item.createdAt,
      href: "/ia",
      source: "assistantPlan"
    })),
    ...products
      .filter((item) => item.minStock > 0 && item.currentStock <= item.minStock)
      .map((item) => ({
        id: `product:${item.id}`,
        type: "Estoque baixo",
        severity: "medium" as const,
        title: item.name,
        description: `Estoque atual ${item.currentStock} ${item.unit}; minimo configurado ${item.minStock} ${item.unit}.`,
        date: null,
        href: "/estoque",
        source: "product"
      })),
    ...plantings.map((item) => ({
      id: `planting:${item.id}`,
      type: "Plantio atrasado",
      severity: "medium" as const,
      title: item.product.name,
      description: "Previsao de colheita passou e o plantio ainda nao foi finalizado.",
      amountCents: item.directCost ? Math.round(item.directCost * 100) : undefined,
      date: item.expectedHarvest,
      href: "/plantios",
      source: "planting"
    })),
    ...sales.map((item) => ({
      id: `sale:${item.id}`,
      type: "Venda rural vencida",
      severity: "high" as const,
      title: item.buyer?.name || item.product.name,
      description: `Venda de ${item.product.name} ainda sem baixa de recebimento.`,
      amountCents: Math.round(item.totalAmount * 100),
      date: item.dueDate,
      href: "/vendas",
      source: "sale"
    }))
  ] satisfies PendingCenterItem[]).sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff) return severityDiff;
    return Number(a.date || 0) - Number(b.date || 0);
  });

  const overdueItems = items.filter((item) => item.date && isOverdue(item.date) && item.severity === "high");

  return {
    summary: {
      total: items.length,
      high: items.filter((item) => item.severity === "high").length,
      medium: items.filter((item) => item.severity === "medium").length,
      low: items.filter((item) => item.severity === "low").length,
      overdue: overdueItems.length,
      reviewBankTransactions: bankTransactions.length,
      pendingAiPlans: assistantPlans.length,
      looseAttachments: attachments.length
    },
    items
  };
}
