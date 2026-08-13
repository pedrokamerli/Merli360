import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission, cents, dateOrNull } from "@/lib/graphic";
import { settleFinancialTitle } from "@/lib/financial-ledger";
import { addPaymentToReceivable, defaultGraphicPaymentAccount, defaultGraphicPaymentMethod, graphicPaymentIdempotencyKey, resolveReceivableStatus } from "@/lib/graphic-receivables";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "receivable:update");
    const body = await request.json();
    const id = String(body.id || "");
    const paymentCents = cents(body.amount);
    if (!id) return NextResponse.json({ error: "Informe o recebimento." }, { status: 400 });
    if (paymentCents <= 0) return NextResponse.json({ error: "Informe um valor recebido maior que zero." }, { status: 400 });
    const db = prisma as any;
    const existing = await db.graphicReceivable.findFirst({ where: { id, tenantId: user.tenantId }, include: { order: true } });
    if (!existing) return NextResponse.json({ error: "Recebimento nao encontrado." }, { status: 404 });
    if (existing.status === "PAID") return NextResponse.json({ error: "Recebimento ja quitado." }, { status: 400 });

    const paidAt = dateOrNull(body.paidAt) || new Date();
    const calc = addPaymentToReceivable(existing.amountCents, existing.receivedCents, paymentCents);
    const status = resolveReceivableStatus(existing.amountCents, calc.nextReceivedCents, new Date(), existing.dueDate);
    const accountName = defaultGraphicPaymentAccount(body.accountName || body.account);
    const method = defaultGraphicPaymentMethod(body.method);
    const result = await db.$transaction(async (tx: any) => {
      const payment = await tx.graphicPayment.create({
        data: {
          tenantId: user.tenantId,
          receivableId: existing.id,
          paidAt,
          amountCents: calc.paidNowCents,
          method,
          notes: String(body.notes || "") || null,
          createdById: user.id,
          updatedById: user.id
        }
      });
      const receivable = await tx.graphicReceivable.update({ where: { id: existing.id }, data: { receivedCents: calc.nextReceivedCents, status, updatedById: user.id } });
      const orderReceived = Math.min(existing.order.soldValueCents, existing.order.receivedValueCents + calc.paidNowCents);
      const order = await tx.graphicOrder.update({ where: { id: existing.orderId }, data: { receivedValueCents: orderReceived, updatedById: user.id } });
      return { payment, receivable, order, pendingCents: calc.pendingCents };
    });
    let settlement = null;
    if (existing.financialTitleId) {
      settlement = await settleFinancialTitle({
        tenantId: user.tenantId,
        titleId: existing.financialTitleId,
        effectiveDate: paidAt,
        accountName,
        paymentMethod: method,
        principalAmount: calc.paidNowCents / 100,
        notes: String(body.notes || `Recebimento grafica ${existing.order?.number || ""}`).trim(),
        idempotencyKey: graphicPaymentIdempotencyKey(result.payment.id)
      });
    }
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_register_payment", entity: "GraphicReceivable", entityId: id, request, metadata: { amountCents: calc.paidNowCents, status, settlementId: settlement?.id } });
    return NextResponse.json({ ...result, settlement });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite registrar recebimentos." : "Nao foi possivel registrar o recebimento.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
