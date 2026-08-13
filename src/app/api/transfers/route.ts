import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createTransfer, reverseTransfer } from "@/lib/transfers";

export const dynamic = "force-dynamic";

function apiError(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Nao foi possivel processar a transferencia" },
    { status: 400 }
  );
}

export async function GET() {
  const user = await requireApiUser();
  const items = await prisma.transfer.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { date: "desc" }
  });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();

  try {
    const body = await request.json();
    const item = await createTransfer({
      tenantId: user.tenantId,
      date: body.date,
      fromAccountName: String(body.fromAccountName || ""),
      toAccountName: String(body.toAccountName || ""),
      amount: Number(body.amount || 0),
      description: body.description ? String(body.description) : null,
      paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
      notes: body.notes ? String(body.notes) : null,
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : null
    });

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "create_transfer",
      entity: "transfers",
      entityId: item.id,
      request,
      metadata: body
    });

    return NextResponse.json({ item });
  } catch (error) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "create_transfer",
      entity: "transfers",
      status: "error",
      message: error instanceof Error ? error.message : "Erro ao criar transferencia",
      request
    });
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser();
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });

  try {
    const item = await reverseTransfer({ tenantId: user.tenantId, transferId: id });
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "reverse_transfer",
      entity: "transfers",
      entityId: id,
      request
    });
    return NextResponse.json({ item });
  } catch (error) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "reverse_transfer",
      entity: "transfers",
      entityId: id,
      status: "error",
      message: error instanceof Error ? error.message : "Erro ao estornar transferencia",
      request
    });
    return apiError(error);
  }
}
