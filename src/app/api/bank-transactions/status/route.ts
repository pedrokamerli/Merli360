import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ensureBankTransactionCashMovement } from "@/lib/bank-reconciliation-ledger";

export const dynamic = "force-dynamic";

const allowed = new Set(["POSTED", "REVIEWED", "REVERSED"]);

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const body = await request.json();
  const id = String(body.id || "");
  const status = String(body.status || "");

  if (!id) return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });
  if (!allowed.has(status)) return NextResponse.json({ error: "Status invalido" }, { status: 400 });

  const bankTransaction = await prisma.bankTransaction.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!bankTransaction) return NextResponse.json({ error: "Lancamento bancario nao encontrado" }, { status: 404 });

  const item = await prisma.$transaction(async (tx) => {
    if (status === "REVERSED") {
      await ensureBankTransactionCashMovement(tx, {
        tenantId: user.tenantId,
        bankTransactionId: bankTransaction.id,
        status: "REVERSED"
      });
      if (bankTransaction.transactionImportHash) {
        await tx.transaction.updateMany({
          where: { importHash: bankTransaction.transactionImportHash, tenantId: user.tenantId },
          data: { status: "cancelado" }
        });
      }
    }

    if (status === "REVIEWED") {
      await ensureBankTransactionCashMovement(tx, {
        tenantId: user.tenantId,
        bankTransactionId: bankTransaction.id,
        status: "ACTIVE"
      });
      if (bankTransaction.transactionImportHash) {
        await tx.transaction.updateMany({
          where: { importHash: bankTransaction.transactionImportHash, tenantId: user.tenantId },
          data: { status: "pago" }
        });
      }
    }

    return tx.bankTransaction.update({ where: { id: bankTransaction.id }, data: { status } });
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "update_bank_transaction_status",
    entity: "bankTransactions",
    entityId: id,
    request,
    metadata: { status }
  });

  return NextResponse.json({ item });
}
