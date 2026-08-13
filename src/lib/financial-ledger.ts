import { AccountPayable, AccountReceivable, FinancialTitle, Prisma, Settlement } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function cents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

function dateOnly(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

async function upsertCashMovement(data: {
  tenantId: string;
  settlementId?: string | null;
  date: Date;
  direction: "IN" | "OUT";
  amountCents: number;
  accountName: string;
  category: string;
  costCenter?: string | null;
  contactLegacyId?: string | null;
  description: string;
  source: string;
  legacyModel: string;
  legacyId: string;
}) {
  return prisma.cashMovement.upsert({
    where: {
      tenantId_legacyModel_legacyId: {
        tenantId: data.tenantId,
        legacyModel: data.legacyModel,
        legacyId: data.legacyId
      }
    },
    update: {
      settlementId: data.settlementId,
      date: data.date,
      direction: data.direction,
      amountCents: data.amountCents,
      accountName: data.accountName,
      category: data.category,
      costCenter: data.costCenter,
      contactLegacyId: data.contactLegacyId,
      description: data.description,
      status: "ACTIVE",
      source: data.source
    },
    create: {
      ...data,
      status: "ACTIVE"
    }
  });
}

export function financialTitleSettledCents(
  title: FinancialTitle & { settlements?: Settlement[] }
) {
  return (title.settlements ?? [])
    .filter((settlement) => settlement.status === "ACTIVE")
    .reduce(
      (sum, settlement) =>
        sum + settlement.principalAmountCents + settlement.discountCents + settlement.writeOffCents,
      0
    );
}

export function financialTitleOpenCents(title: FinancialTitle & { settlements?: Settlement[] }) {
  return Math.max(title.originalAmountCents - financialTitleSettledCents(title), 0);
}

function settlementEffectiveAmountCents(params: {
  type: string;
  principalAmountCents: number;
  interestCents: number;
  fineCents: number;
  discountCents: number;
  feeCents: number;
}) {
  const gross = params.principalAmountCents + params.interestCents + params.fineCents - params.discountCents;
  const withFee = params.type === "RECEIVABLE" ? gross - params.feeCents : gross + params.feeCents;
  return Math.max(withFee, 0);
}

async function recalcTitleStatusTx(tx: Prisma.TransactionClient, titleId: string) {
  const title = await tx.financialTitle.findUnique({
    where: { id: titleId },
    include: { settlements: true }
  });
  if (!title || title.status === "CANCELED" || title.status === "DRAFT") return title;
  const settled = financialTitleSettledCents(title);
  const nextStatus = settled <= 0 ? "OPEN" : settled >= title.originalAmountCents ? "PAID" : "PARTIAL";
  return tx.financialTitle.update({
    where: { id: title.id },
    data: { status: nextStatus }
  });
}

export async function settleFinancialTitle(input: {
  tenantId: string;
  titleId: string;
  effectiveDate?: string | Date | null;
  accountName: string;
  paymentMethod?: string | null;
  principalAmount: number;
  interestAmount?: number;
  fineAmount?: number;
  discountAmount?: number;
  feeAmount?: number;
  writeOffAmount?: number;
  notes?: string | null;
  idempotencyKey?: string | null;
}) {
  const principalAmountCents = cents(input.principalAmount);
  const interestCents = cents(input.interestAmount || 0);
  const fineCents = cents(input.fineAmount || 0);
  const discountCents = cents(input.discountAmount || 0);
  const feeCents = cents(input.feeAmount || 0);
  const writeOffCents = cents(input.writeOffAmount || 0);

  if (!input.accountName) throw new Error("Conta obrigatoria");
  if (principalAmountCents <= 0 && writeOffCents <= 0) throw new Error("Informe um valor de baixa ou abatimento");

  return prisma.$transaction(async (tx) => {
    const title = await tx.financialTitle.findFirst({
      where: { id: input.titleId, tenantId: input.tenantId },
      include: { settlements: true }
    });
    if (!title) throw new Error("Titulo nao encontrado");
    if (title.status === "CANCELED") throw new Error("Titulo cancelado nao pode receber baixa");

    const openCents = financialTitleOpenCents(title);
    const closingCents = principalAmountCents + discountCents + writeOffCents;
    if (closingCents > openCents) throw new Error("Baixa maior que o saldo aberto do titulo");

    const effectiveDate = dateOnly(input.effectiveDate);
    const legacyId = input.idempotencyKey || `manual-${title.id}-${effectiveDate.toISOString()}-${Date.now()}`;
    const effectiveAmountCents = settlementEffectiveAmountCents({
      type: title.type,
      principalAmountCents,
      interestCents,
      fineCents,
      discountCents,
      feeCents
    });

    const settlement = await tx.settlement.upsert({
      where: {
        tenantId_legacyModel_legacyId: {
          tenantId: input.tenantId,
          legacyModel: "ManualSettlement",
          legacyId
        }
      },
      update: {
        titleId: title.id,
        effectiveDate,
        accountName: input.accountName,
        principalAmountCents,
        effectiveAmountCents,
        interestCents,
        fineCents,
        discountCents,
        feeCents,
        writeOffCents,
        paymentMethod: input.paymentMethod,
        source: "MANUAL",
        status: "ACTIVE",
        notes: input.notes
      },
      create: {
        tenantId: input.tenantId,
        titleId: title.id,
        effectiveDate,
        accountName: input.accountName,
        principalAmountCents,
        effectiveAmountCents,
        interestCents,
        fineCents,
        discountCents,
        feeCents,
        writeOffCents,
        paymentMethod: input.paymentMethod,
        source: "MANUAL",
        status: "ACTIVE",
        notes: input.notes,
        legacyModel: "ManualSettlement",
        legacyId
      }
    });

    await tx.cashMovement.upsert({
      where: {
        tenantId_legacyModel_legacyId: {
          tenantId: input.tenantId,
          legacyModel: "ManualSettlementCashMovement",
          legacyId: settlement.id
        }
      },
      update: {
        settlementId: settlement.id,
        date: effectiveDate,
        direction: title.type === "RECEIVABLE" ? "IN" : "OUT",
        amountCents: effectiveAmountCents,
        accountName: input.accountName,
        category: title.category,
        costCenter: title.costCenter,
        contactLegacyId: title.contactLegacyId,
        description: `${title.type === "RECEIVABLE" ? "Recebimento" : "Pagamento"} - ${title.description}`,
        status: "ACTIVE",
        source: "SETTLEMENT"
      },
      create: {
        tenantId: input.tenantId,
        settlementId: settlement.id,
        date: effectiveDate,
        direction: title.type === "RECEIVABLE" ? "IN" : "OUT",
        amountCents: effectiveAmountCents,
        accountName: input.accountName,
        category: title.category,
        costCenter: title.costCenter,
        contactLegacyId: title.contactLegacyId,
        description: `${title.type === "RECEIVABLE" ? "Recebimento" : "Pagamento"} - ${title.description}`,
        status: "ACTIVE",
        source: "SETTLEMENT",
        legacyModel: "ManualSettlementCashMovement",
        legacyId: settlement.id
      }
    });

    await recalcTitleStatusTx(tx, title.id);
    return tx.settlement.findUnique({ where: { id: settlement.id }, include: { cashMovement: true, title: true } });
  });
}

export async function reverseSettlement(input: { tenantId: string; settlementId: string }) {
  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.findFirst({
      where: { id: input.settlementId, tenantId: input.tenantId },
      include: { title: true, cashMovement: true }
    });
    if (!settlement) throw new Error("Baixa nao encontrada");
    if (settlement.status === "REVERSED") return settlement;

    await tx.settlement.update({ where: { id: settlement.id }, data: { status: "REVERSED" } });
    if (settlement.cashMovement) {
      await tx.cashMovement.update({ where: { id: settlement.cashMovement.id }, data: { status: "REVERSED" } });
    }

    if (settlement.legacyModel === "AccountReceivableSettlement" && settlement.legacyId) {
      await tx.accountReceivable.updateMany({
        where: { id: settlement.legacyId, tenantId: input.tenantId },
        data: { status: "pendente", paidDate: null }
      });
      await tx.transaction.deleteMany({ where: { importHash: `receivable-paid-${settlement.legacyId}` } });
    }

    if (settlement.legacyModel === "AccountPayableSettlement" && settlement.legacyId) {
      await tx.accountPayable.updateMany({
        where: { id: settlement.legacyId, tenantId: input.tenantId },
        data: { status: "pendente", paidDate: null }
      });
      await tx.transaction.deleteMany({ where: { importHash: `payable-paid-${settlement.legacyId}` } });
    }

    await recalcTitleStatusTx(tx, settlement.titleId);
    return tx.settlement.findUnique({ where: { id: settlement.id }, include: { cashMovement: true, title: true } });
  });
}

export async function syncReceivableToLedger(
  receivable: AccountReceivable,
  options?: { account?: string | null; paymentMethod?: string | null; paidDate?: Date | string | null }
) {
  if (!receivable.tenantId) return null;
  const dueDate = dateOnly(receivable.dueDate);
  const title = await prisma.financialTitle.upsert({
    where: {
      tenantId_legacyModel_legacyId: {
        tenantId: receivable.tenantId,
        legacyModel: "AccountReceivable",
        legacyId: receivable.id
      }
    },
    update: {
      contactLegacyId: receivable.clientId,
      description: receivable.description,
      category: receivable.type || "Recebivel",
      costCenter: "Cliente",
      competenceDate: dueDate,
      dueDate,
      originalAmountCents: cents(receivable.amount),
      expectedAccount: options?.account || "PJ",
      expectedPaymentMethod: options?.paymentMethod,
      status: receivable.status === "cancelado" ? "CANCELED" : "OPEN",
      notes: receivable.notes
    },
    create: {
      tenantId: receivable.tenantId,
      type: "RECEIVABLE",
      origin: receivable.recurring ? "RECURRENCE" : "LEGACY",
      contactLegacyId: receivable.clientId,
      description: receivable.description,
      category: receivable.type || "Recebivel",
      costCenter: "Cliente",
      competenceDate: dueDate,
      dueDate,
      originalAmountCents: cents(receivable.amount),
      expectedAccount: options?.account || "PJ",
      expectedPaymentMethod: options?.paymentMethod,
      status: receivable.status === "cancelado" ? "CANCELED" : "OPEN",
      notes: receivable.notes,
      legacyModel: "AccountReceivable",
      legacyId: receivable.id
    }
  });

  if (receivable.status !== "pago" && !options?.paidDate) return title;
  const effectiveDate = dateOnly(options?.paidDate || receivable.paidDate);
  const settlement = await prisma.settlement.upsert({
    where: {
      tenantId_legacyModel_legacyId: {
        tenantId: receivable.tenantId,
        legacyModel: "AccountReceivableSettlement",
        legacyId: receivable.id
      }
    },
    update: {
      titleId: title.id,
      effectiveDate,
      accountName: options?.account || "PJ",
      principalAmountCents: cents(receivable.amount),
      effectiveAmountCents: cents(receivable.amount),
      paymentMethod: options?.paymentMethod,
      source: "LEGACY",
      status: "ACTIVE"
    },
    create: {
      tenantId: receivable.tenantId,
      titleId: title.id,
      effectiveDate,
      accountName: options?.account || "PJ",
      principalAmountCents: cents(receivable.amount),
      effectiveAmountCents: cents(receivable.amount),
      paymentMethod: options?.paymentMethod,
      source: "LEGACY",
      status: "ACTIVE",
      notes: "Baixa sincronizada a partir do contas a receber legado.",
      legacyModel: "AccountReceivableSettlement",
      legacyId: receivable.id
    }
  });

  await upsertCashMovement({
    tenantId: receivable.tenantId,
    settlementId: settlement.id,
    date: effectiveDate,
    direction: "IN",
    amountCents: cents(receivable.amount),
    accountName: options?.account || "PJ",
    category: receivable.type || "Recebivel",
    costCenter: "Cliente",
    contactLegacyId: receivable.clientId,
    description: `Recebimento - ${receivable.description}`,
    source: "SETTLEMENT",
    legacyModel: "AccountReceivableCashMovement",
    legacyId: receivable.id
  });

  return title;
}

export async function syncPayableToLedger(
  payable: AccountPayable,
  options?: { account?: string | null; paymentMethod?: string | null; paidDate?: Date | string | null }
) {
  if (!payable.tenantId) return null;
  const dueDate = dateOnly(payable.dueDate);
  const title = await prisma.financialTitle.upsert({
    where: {
      tenantId_legacyModel_legacyId: {
        tenantId: payable.tenantId,
        legacyModel: "AccountPayable",
        legacyId: payable.id
      }
    },
    update: {
      description: payable.description,
      category: payable.category,
      costCenter: "Contas a pagar",
      competenceDate: dueDate,
      dueDate,
      originalAmountCents: cents(payable.amount),
      expectedAccount: options?.account || "PJ",
      expectedPaymentMethod: options?.paymentMethod,
      status: payable.status === "cancelado" ? "CANCELED" : "OPEN",
      notes: payable.notes
    },
    create: {
      tenantId: payable.tenantId,
      type: "PAYABLE",
      origin: payable.recurring ? "RECURRENCE" : "LEGACY",
      description: payable.description,
      category: payable.category,
      costCenter: "Contas a pagar",
      competenceDate: dueDate,
      dueDate,
      originalAmountCents: cents(payable.amount),
      expectedAccount: options?.account || "PJ",
      expectedPaymentMethod: options?.paymentMethod,
      status: payable.status === "cancelado" ? "CANCELED" : "OPEN",
      notes: payable.notes,
      legacyModel: "AccountPayable",
      legacyId: payable.id
    }
  });

  if (payable.status !== "pago" && !options?.paidDate) return title;
  const effectiveDate = dateOnly(options?.paidDate || payable.paidDate);
  const settlement = await prisma.settlement.upsert({
    where: {
      tenantId_legacyModel_legacyId: {
        tenantId: payable.tenantId,
        legacyModel: "AccountPayableSettlement",
        legacyId: payable.id
      }
    },
    update: {
      titleId: title.id,
      effectiveDate,
      accountName: options?.account || "PJ",
      principalAmountCents: cents(payable.amount),
      effectiveAmountCents: cents(payable.amount),
      paymentMethod: options?.paymentMethod,
      source: "LEGACY",
      status: "ACTIVE"
    },
    create: {
      tenantId: payable.tenantId,
      titleId: title.id,
      effectiveDate,
      accountName: options?.account || "PJ",
      principalAmountCents: cents(payable.amount),
      effectiveAmountCents: cents(payable.amount),
      paymentMethod: options?.paymentMethod,
      source: "LEGACY",
      status: "ACTIVE",
      notes: "Baixa sincronizada a partir do contas a pagar legado.",
      legacyModel: "AccountPayableSettlement",
      legacyId: payable.id
    }
  });

  await upsertCashMovement({
    tenantId: payable.tenantId,
    settlementId: settlement.id,
    date: effectiveDate,
    direction: "OUT",
    amountCents: cents(payable.amount),
    accountName: options?.account || "PJ",
    category: payable.category,
    costCenter: "Contas a pagar",
    description: `Pagamento - ${payable.description}`,
    source: "SETTLEMENT",
    legacyModel: "AccountPayableCashMovement",
    legacyId: payable.id
  });

  return title;
}
