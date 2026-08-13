import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission } from "@/lib/graphic";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "production:update");
    const body = await request.json();
    const id = String(body.id || "");
    const status = String(body.status || "");
    const note = String(body.note || "");
    if (!id || !status) return NextResponse.json({ error: "Informe a ordem e o novo status." }, { status: 400 });
    const allowed = ["PENDING", "RELEASED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"];
    if (!allowed.includes(status)) return NextResponse.json({ error: "Status de producao invalido." }, { status: 400 });
    if (["BLOCKED", "CANCELLED"].includes(status) && !note) return NextResponse.json({ error: "Informe o motivo." }, { status: 400 });
    const db = prisma as any;
    const existing = await db.graphicProductionOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return NextResponse.json({ error: "Ordem de producao nao encontrada." }, { status: 404 });
    const item = await db.$transaction(async (tx: any) => {
      const updated = await tx.graphicProductionOrder.update({ where: { id }, data: { status, blockedReason: status === "BLOCKED" ? note : existing.blockedReason, updatedById: user.id } });
      await tx.graphicProductionEvent.create({ data: { tenantId: user.tenantId, productionOrderId: id, userId: user.id, action: `STATUS_${status}`, note: note || null, createdById: user.id, updatedById: user.id } });
      return updated;
    });
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_production", entity: "GraphicProductionOrder", entityId: id, request, metadata: { status } });
    return NextResponse.json({ item });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite atualizar producao." : "Nao foi possivel atualizar a producao.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
