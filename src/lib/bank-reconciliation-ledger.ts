import { Prisma } from "@prisma/client";

type PrismaTx = Prisma.TransactionClient;

function fallbackCategory(direction: string) {
  return direction === "IN" ? "Entrada a conferir" : "A conferir";
}

function statusForTransaction(status: "ACTIVE" | "REVERSED") {
  return status === "REVERSED" ? "cancelado" : "pago";
}

export async function ensureBankTransactionCashMovement(
  tx: PrismaTx,
  params: {
    tenantId: string;
    bankTransactionId: string;
    category?: string | null;
    costCenter?: string | null;
    paymentMethod?: string | null;
    status?: "ACTIVE" | "REVERSED";
  }
) {
  const bankTransaction = await tx.bankTransaction.findFirst({
    where: { id: params.bankTransactionId, tenantId: params.tenantId }
  });
  if (!bankTransaction) throw new Error("Lancamento bancario nao encontrado");

  const category = params.category || bankTransaction.categorySuggestion || fallbackCategory(bankTransaction.direction);
  const status = params.status || "ACTIVE";
  const paymentMethod = params.paymentMethod ?? bankTransaction.paymentMethod ?? "";
  let transactionImportHash = bankTransaction.transactionImportHash;

  if (status === "ACTIVE") {
    const transaction = await tx.transaction.upsert({
      where: { importHash: bankTransaction.fingerprint },
      update: {
        tenantId: params.tenantId,
        date: bankTransaction.date,
        description: bankTransaction.description,
        amount: bankTransaction.amountCents / 100,
        type: bankTransaction.direction === "IN" ? "entrada" : "saida",
        category,
        subcategory: "Importado",
        costCenter: params.costCenter ?? undefined,
        account: bankTransaction.accountName,
        status: statusForTransaction(status),
        paymentMethod,
        notes: "Sincronizado pela conciliacao bancaria.",
        source: "Importacao bancaria"
      },
      create: {
        tenantId: params.tenantId,
        date: bankTransaction.date,
        description: bankTransaction.description,
        amount: bankTransaction.amountCents / 100,
        type: bankTransaction.direction === "IN" ? "entrada" : "saida",
        category,
        subcategory: "Importado",
        costCenter: params.costCenter || null,
        account: bankTransaction.accountName,
        status: statusForTransaction(status),
        paymentMethod,
        notes: "Sincronizado pela conciliacao bancaria.",
        source: "Importacao bancaria",
        importHash: bankTransaction.fingerprint
      }
    });
    transactionImportHash = transaction.importHash;
  } else if (bankTransaction.transactionImportHash) {
    await tx.transaction.updateMany({
      where: { importHash: bankTransaction.transactionImportHash, tenantId: params.tenantId },
      data: { status: statusForTransaction(status) }
    });
  }

  const cashMovement = await tx.cashMovement.upsert({
    where: {
      tenantId_legacyModel_legacyId: {
        tenantId: params.tenantId,
        legacyModel: "BankTransaction",
        legacyId: bankTransaction.id
      }
    },
    update: {
      date: bankTransaction.date,
      direction: bankTransaction.direction,
      amountCents: bankTransaction.amountCents,
      accountName: bankTransaction.accountName,
      category,
      costCenter: params.costCenter ?? undefined,
      description: bankTransaction.description,
      status,
      source: "IMPORT"
    },
    create: {
      tenantId: params.tenantId,
      date: bankTransaction.date,
      direction: bankTransaction.direction,
      amountCents: bankTransaction.amountCents,
      accountName: bankTransaction.accountName,
      category,
      costCenter: params.costCenter || null,
      description: bankTransaction.description,
      status,
      source: "IMPORT",
      legacyModel: "BankTransaction",
      legacyId: bankTransaction.id
    }
  });

  await tx.bankTransaction.update({
    where: { id: bankTransaction.id },
    data: { cashMovementLegacyId: cashMovement.id, transactionImportHash }
  });

  return cashMovement;
}
