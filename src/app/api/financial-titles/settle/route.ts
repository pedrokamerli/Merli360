import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { settleFinancialTitle } from "@/lib/financial-ledger";

export const dynamic = "force-dynamic";

function apiError(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Nao foi possivel baixar o titulo" },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const body = await request.json();

  try {
    if (!body.titleId) return NextResponse.json({ error: "Titulo obrigatorio" }, { status: 400 });
    if (!body.accountName) return NextResponse.json({ error: "Conta obrigatoria" }, { status: 400 });

    const settlement = await settleFinancialTitle({
      tenantId: user.tenantId,
      titleId: String(body.titleId),
      effectiveDate: body.effectiveDate,
      accountName: String(body.accountName),
      paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
      principalAmount: Number(body.principalAmount || 0),
      interestAmount: Number(body.interestAmount || 0),
      fineAmount: Number(body.fineAmount || 0),
      discountAmount: Number(body.discountAmount || 0),
      feeAmount: Number(body.feeAmount || 0),
      writeOffAmount: Number(body.writeOffAmount || 0),
      notes: body.notes ? String(body.notes) : null,
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : null
    });

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "settle_title",
      entity: "financialTitles",
      entityId: String(body.titleId),
      request,
      metadata: body
    });

    return NextResponse.json({ item: settlement });
  } catch (error) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "settle_title",
      entity: "financialTitles",
      entityId: body.titleId ? String(body.titleId) : null,
      status: "error",
      message: error instanceof Error ? error.message : "Erro ao baixar titulo",
      request
    });
    return apiError(error);
  }
}
