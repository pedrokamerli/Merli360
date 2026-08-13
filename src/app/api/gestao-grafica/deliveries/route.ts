import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission, dateOrNull } from "@/lib/graphic";
import { validateDeliveryStatusChange } from "@/lib/graphic-deliveries";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "production:update");
    const body = await request.json();
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!id || !status) return NextResponse.json({ error: "Informe a entrega e o status." }, { status: 400 });
    const db = prisma as any;
    const existing = await db.graphicDelivery.findFirst({ where: { id, tenantId: user.tenantId }, include: { order: true } });
    if (!existing) return NextResponse.json({ error: "Entrega nao encontrada." }, { status: 404 });
    const validation = validateDeliveryStatusChange({ status, note: body.note, proofAttachmentId: body.proofAttachmentId || existing.proofAttachmentId });
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });

    const item = await db.$transaction(async (tx: any) => {
      const deliveredAt = status === "DELIVERED" || status === "ACCEPTED" ? dateOrNull(body.deliveredAt) || new Date() : existing.deliveredAt;
      const updated = await tx.graphicDelivery.update({
        where: { id },
        data: {
          status,
          method: body.method ? String(body.method) : existing.method,
          expectedAt: body.expectedAt ? dateOrNull(body.expectedAt) : existing.expectedAt,
          deliveredAt,
          responsibleName: String(body.responsibleName || existing.responsibleName || "") || null,
          proofAttachmentId: body.proofAttachmentId ? String(body.proofAttachmentId) : existing.proofAttachmentId,
          acceptanceStatus: status === "ACCEPTED" ? "ACCEPTED" : existing.acceptanceStatus,
          complaint: status === "COMPLAINT" ? String(body.note || "") : existing.complaint,
          updatedById: user.id
        }
      });
      if (["DELIVERED", "ACCEPTED"].includes(status)) {
        const already = await tx.graphicPostSale.findFirst({ where: { tenantId: user.tenantId, orderId: existing.orderId, status: "OPEN" } });
        if (!already) {
          await tx.graphicPostSale.create({
            data: {
              tenantId: user.tenantId,
              orderId: existing.orderId,
              note: "Contato de pos-venda gerado automaticamente apos entrega.",
              status: "OPEN",
              createdById: user.id,
              updatedById: user.id
            }
          });
        }
      }
      return updated;
    });
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_delivery", entity: "GraphicDelivery", entityId: id, request, metadata: { status } });
    return NextResponse.json({ item });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite atualizar entregas." : "Nao foi possivel atualizar a entrega.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
