import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveBankClassificationLearning } from "@/lib/bank-classification";
import { ensureBankTransactionCashMovement } from "@/lib/bank-reconciliation-ledger";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const body = await request.json();
  const id = String(body.id || "");
  const category = clean(body.category);
  const paymentMethod = clean(body.paymentMethod);
  const costCenter = clean(body.costCenter);
  const markReviewed = body.markReviewed !== false;

  if (!id) return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });
  if (!category) return NextResponse.json({ error: "Categoria obrigatoria" }, { status: 400 });

  const bankTransaction = await prisma.bankTransaction.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!bankTransaction) return NextResponse.json({ error: "Lancamento bancario nao encontrado" }, { status: 404 });
  if (bankTransaction.status === "REVERSED") return NextResponse.json({ error: "Nao e possivel categorizar um lancamento estornado." }, { status: 400 });

  const item = await prisma.$transaction(async (tx) => {
    await ensureBankTransactionCashMovement(tx, {
      tenantId: user.tenantId,
      bankTransactionId: bankTransaction.id,
      category,
      costCenter,
      paymentMethod,
      status: "ACTIVE"
    });

    if (bankTransaction.transactionImportHash) {
      await tx.transaction.updateMany({
        where: { importHash: bankTransaction.transactionImportHash, tenantId: user.tenantId },
        data: {
          category,
          costCenter,
          paymentMethod,
          status: markReviewed ? "pago" : "conferencia",
          notes: "Categoria revisada pela conciliacao bancaria."
        }
      });
    }

    return tx.bankTransaction.update({
      where: { id: bankTransaction.id },
      data: {
        categorySuggestion: category,
        categorySuggestionSource: "Correcao manual + aprendizado",
        suggestionConfidence: 0.98,
        paymentMethod,
        status: markReviewed ? "REVIEWED" : bankTransaction.status,
        notes: "Categoria revisada pela conciliacao bancaria. Aprendizado salvo para proximas importacoes."
      }
    });
  });

  const learning = await saveBankClassificationLearning({
    tenantId: user.tenantId,
    userId: user.id,
    description: bankTransaction.description,
    direction: bankTransaction.direction as "IN" | "OUT",
    category,
    paymentMethod,
    costCenter,
    counterpartyName: bankTransaction.counterpartyName,
    counterpartyDocument: bankTransaction.counterpartyDocument
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "categorize_bank_transaction",
    entity: "bankTransactions",
    entityId: id,
    request,
    metadata: { category, paymentMethod, costCenter, markReviewed, learningRuleId: learning.id }
  });

  return NextResponse.json({ item, learning });
}
