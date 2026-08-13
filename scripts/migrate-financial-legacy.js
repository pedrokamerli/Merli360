const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

function titleStatus(status) {
  if (status === "cancelado") return "CANCELED";
  return "OPEN";
}

async function upsertTitle(data, report) {
  const where = {
    tenantId_legacyModel_legacyId: {
      tenantId: data.tenantId,
      legacyModel: data.legacyModel,
      legacyId: data.legacyId
    }
  };

  const existing = await prisma.financialTitle.findUnique({ where });
  if (dryRun) {
    report.titles[existing ? "wouldUpdate" : "wouldCreate"] += 1;
    return existing || { id: `dry-${data.legacyModel}-${data.legacyId}`, ...data };
  }

  const item = await prisma.financialTitle.upsert({
    where,
    update: data,
    create: data
  });
  report.titles[existing ? "updated" : "created"] += 1;
  return item;
}

async function upsertSettlement(data, report) {
  const where = {
    tenantId_legacyModel_legacyId: {
      tenantId: data.tenantId,
      legacyModel: data.legacyModel,
      legacyId: data.legacyId
    }
  };

  const existing = await prisma.settlement.findUnique({ where });
  if (dryRun) {
    report.settlements[existing ? "wouldUpdate" : "wouldCreate"] += 1;
    return existing || { id: `dry-${data.legacyModel}-${data.legacyId}`, ...data };
  }

  const item = await prisma.settlement.upsert({
    where,
    update: data,
    create: data
  });
  report.settlements[existing ? "updated" : "created"] += 1;
  return item;
}

async function upsertCashMovement(data, report) {
  const where = {
    tenantId_legacyModel_legacyId: {
      tenantId: data.tenantId,
      legacyModel: data.legacyModel,
      legacyId: data.legacyId
    }
  };

  const existing = await prisma.cashMovement.findUnique({ where });
  if (dryRun) {
    report.cashMovements[existing ? "wouldUpdate" : "wouldCreate"] += 1;
    return existing || { id: `dry-${data.legacyModel}-${data.legacyId}`, ...data };
  }

  const item = await prisma.cashMovement.upsert({
    where,
    update: data,
    create: data
  });
  report.cashMovements[existing ? "updated" : "created"] += 1;
  return item;
}

async function migrateReceivables(report) {
  const rows = await prisma.accountReceivable.findMany({ where: { tenantId: { not: null } } });
  for (const row of rows) {
    if (row.amount <= 0) {
      report.invalid.push({ model: "AccountReceivable", id: row.id, reason: "amount <= 0" });
      continue;
    }

    const title = await upsertTitle(
      {
        tenantId: row.tenantId,
        type: "RECEIVABLE",
        origin: row.notes?.includes("Gerado automaticamente") ? "LEGACY" : row.recurring ? "RECURRENCE" : "LEGACY",
        contactLegacyId: row.clientId,
        description: row.description,
        category: row.type || "Recebivel",
        costCenter: "Cliente",
        issueDate: null,
        competenceDate: dateOnly(row.dueDate),
        dueDate: dateOnly(row.dueDate),
        originalAmountCents: cents(row.amount),
        expectedAccount: "PJ",
        expectedPaymentMethod: null,
        status: titleStatus(row.status),
        notes: row.notes,
        legacyModel: "AccountReceivable",
        legacyId: row.id
      },
      report
    );

    if (row.status === "pago" && row.paidDate && !dryRun) {
      const settlement = await upsertSettlement(
        {
          tenantId: row.tenantId,
          titleId: title.id,
          effectiveDate: dateOnly(row.paidDate),
          accountName: "PJ",
          principalAmountCents: cents(row.amount),
          effectiveAmountCents: cents(row.amount),
          paymentMethod: null,
          source: "LEGACY",
          status: "ACTIVE",
          notes: "Baixa migrada de AccountReceivable legado.",
          legacyModel: "AccountReceivableSettlement",
          legacyId: row.id
        },
        report
      );
      await upsertCashMovement(
        {
          tenantId: row.tenantId,
          settlementId: settlement.id,
          date: dateOnly(row.paidDate),
          direction: "IN",
          amountCents: cents(row.amount),
          accountName: "PJ",
          category: row.type || "Recebivel",
          costCenter: "Cliente",
          contactLegacyId: row.clientId,
          description: `Recebimento - ${row.description}`,
          status: "ACTIVE",
          source: "LEGACY",
          legacyModel: "AccountReceivableCashMovement",
          legacyId: row.id
        },
        report
      );
    } else if (row.status === "pago" && dryRun) {
      report.settlements.wouldCreate += 1;
      report.cashMovements.wouldCreate += 1;
    }
  }
}

async function migratePayables(report) {
  const rows = await prisma.accountPayable.findMany({ where: { tenantId: { not: null } } });
  for (const row of rows) {
    if (row.amount <= 0) {
      report.invalid.push({ model: "AccountPayable", id: row.id, reason: "amount <= 0" });
      continue;
    }

    const title = await upsertTitle(
      {
        tenantId: row.tenantId,
        type: "PAYABLE",
        origin: row.recurring ? "RECURRENCE" : "LEGACY",
        contactLegacyId: null,
        description: row.description,
        category: row.category,
        costCenter: "Contas a pagar",
        issueDate: null,
        competenceDate: dateOnly(row.dueDate),
        dueDate: dateOnly(row.dueDate),
        originalAmountCents: cents(row.amount),
        expectedAccount: "PJ",
        expectedPaymentMethod: null,
        status: titleStatus(row.status),
        notes: row.notes,
        legacyModel: "AccountPayable",
        legacyId: row.id
      },
      report
    );

    if (row.status === "pago" && row.paidDate && !dryRun) {
      const settlement = await upsertSettlement(
        {
          tenantId: row.tenantId,
          titleId: title.id,
          effectiveDate: dateOnly(row.paidDate),
          accountName: "PJ",
          principalAmountCents: cents(row.amount),
          effectiveAmountCents: cents(row.amount),
          paymentMethod: null,
          source: "LEGACY",
          status: "ACTIVE",
          notes: "Baixa migrada de AccountPayable legado.",
          legacyModel: "AccountPayableSettlement",
          legacyId: row.id
        },
        report
      );
      await upsertCashMovement(
        {
          tenantId: row.tenantId,
          settlementId: settlement.id,
          date: dateOnly(row.paidDate),
          direction: "OUT",
          amountCents: cents(row.amount),
          accountName: "PJ",
          category: row.category,
          costCenter: "Contas a pagar",
          contactLegacyId: null,
          description: `Pagamento - ${row.description}`,
          status: "ACTIVE",
          source: "LEGACY",
          legacyModel: "AccountPayableCashMovement",
          legacyId: row.id
        },
        report
      );
    } else if (row.status === "pago" && dryRun) {
      report.settlements.wouldCreate += 1;
      report.cashMovements.wouldCreate += 1;
    }
  }
}

async function migrateDirectTransactions(report) {
  const rows = await prisma.transaction.findMany({ where: { tenantId: { not: null } } });
  for (const row of rows) {
    if (row.amount <= 0) {
      report.invalid.push({ model: "Transaction", id: row.id, reason: "amount <= 0" });
      continue;
    }
    const autoFromTitle = row.importHash?.startsWith("receivable-paid-") || row.importHash?.startsWith("payable-paid-");
    if (autoFromTitle) {
      report.skipped.push({ model: "Transaction", id: row.id, reason: "covered by payable/receivable settlement when settled" });
      continue;
    }
    if (row.importHash) {
      const bankTransaction = await prisma.bankTransaction.findFirst({
        where: {
          tenantId: row.tenantId,
          transactionImportHash: row.importHash
        },
        select: { id: true }
      });
      if (bankTransaction) {
        report.skipped.push({ model: "Transaction", id: row.id, reason: "covered by bank transaction import" });
        continue;
      }
    }
    if (row.status === "cancelado") {
      report.skipped.push({ model: "Transaction", id: row.id, reason: "canceled transaction" });
      continue;
    }

    await upsertCashMovement(
      {
        tenantId: row.tenantId,
        settlementId: null,
        date: dateOnly(row.date),
        direction: row.type === "entrada" ? "IN" : "OUT",
        amountCents: cents(row.amount),
        accountName: row.account || "PJ",
        category: row.category,
        costCenter: row.costCenter,
        contactLegacyId: row.clientId,
        description: row.description,
        status: ["pago", "realizado", "recebido"].includes(row.status) ? "ACTIVE" : "PENDING_REVIEW",
        source: "LEGACY",
        legacyModel: "Transaction",
        legacyId: row.id
      },
      report
    );
  }
}

async function main() {
  const report = {
    dryRun,
    generatedAt: new Date().toISOString(),
    titles: { created: 0, updated: 0, wouldCreate: 0, wouldUpdate: 0 },
    settlements: { created: 0, updated: 0, wouldCreate: 0, wouldUpdate: 0 },
    cashMovements: { created: 0, updated: 0, wouldCreate: 0, wouldUpdate: 0 },
    invalid: [],
    skipped: []
  };

  await migrateReceivables(report);
  await migratePayables(report);
  await migrateDirectTransactions(report);

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
