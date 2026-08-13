import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { reverseSettlement } from "@/lib/financial-ledger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const body = await request.json();
  if (!body.settlementId) return NextResponse.json({ error: "Baixa obrigatoria" }, { status: 400 });

  try {
    const settlement = await reverseSettlement({
      tenantId: user.tenantId,
      settlementId: String(body.settlementId)
    });

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "reverse_settlement",
      entity: "settlements",
      entityId: String(body.settlementId),
      request
    });

    return NextResponse.json({ item: settlement });
  } catch (error) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "reverse_settlement",
      entity: "settlements",
      entityId: String(body.settlementId),
      status: "error",
      message: error instanceof Error ? error.message : "Erro ao estornar baixa",
      request
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel estornar a baixa" },
      { status: 400 }
    );
  }
}
