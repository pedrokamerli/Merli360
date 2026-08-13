import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPayablePayment } from "@/lib/transaction-sync";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });
  if (!body.account) return NextResponse.json({ error: "Conta obrigatoria" }, { status: 400 });
  if (!body.paymentMethod) return NextResponse.json({ error: "Forma de pagamento obrigatoria" }, { status: 400 });

  const payable = await prisma.accountPayable.findFirst({ where: { id: body.id, tenantId: user.tenantId } });
  if (!payable) return NextResponse.json({ error: "Conta a pagar nao encontrada" }, { status: 404 });

  const item = await syncPayablePayment(payable, {
    account: body.account,
    paymentMethod: body.paymentMethod,
    paidDate: body.paidDate
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "mark_paid",
    entity: "payables",
    entityId: payable.id,
    request,
    metadata: { account: body.account, paymentMethod: body.paymentMethod, paidDate: body.paidDate }
  });

  return NextResponse.json({ item });
}
