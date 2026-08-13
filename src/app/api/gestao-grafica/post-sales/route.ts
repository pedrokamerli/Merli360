import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission, cents, dateOrNull } from "@/lib/graphic";
import { buildPostSaleOpportunityTitle, shouldCreatePostSaleOpportunity, shouldCreatePostSaleTask, validateSatisfaction } from "@/lib/graphic-post-sales";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "post-sale:update");
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Informe o pos-venda." }, { status: 400 });
    const satisfaction = body.satisfaction === undefined || body.satisfaction === "" ? null : Number(body.satisfaction);
    const validation = validateSatisfaction(body.satisfaction);
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });
    const db = prisma as any;
    const existing = await db.graphicPostSale.findFirst({ where: { id, tenantId: user.tenantId }, include: { order: true } });
    if (!existing) return NextResponse.json({ error: "Pos-venda nao encontrado." }, { status: 404 });
    const note = String(body.note || existing.note || "") || null;
    const complaint = String(body.complaint || "").trim();
    const nextAction = String(body.nextAction || "").trim();
    const nextFollowUp = dateOrNull(body.nextFollowUp);

    const result = await db.$transaction(async (tx: any) => {
      let newOpportunity = null;
      if (shouldCreatePostSaleOpportunity({ satisfaction, createOpportunity: Boolean(body.createOpportunity), complaint })) {
        const title = buildPostSaleOpportunityTitle({ orderNumber: existing.order?.number, complaint });
        newOpportunity = await tx.graphicOpportunity.create({
          data: {
            tenantId: user.tenantId,
            clientId: existing.order?.clientId || null,
            ownerId: user.id,
            title,
            source: "Pos-venda",
            productInterest: complaint ? "Retrabalho/atendimento" : "Recorrencia",
            estimatedValueCents: cents(body.estimatedValue),
            nextAction: nextAction || (complaint ? "Resolver reclamacao do cliente" : "Apresentar nova oferta"),
            nextFollowUp: nextFollowUp || new Date(),
            qualityAlert: null,
            createdById: user.id,
            updatedById: user.id
          }
        });
        await tx.graphicActivity.create({
          data: {
            tenantId: user.tenantId,
            opportunityId: newOpportunity.id,
            userId: user.id,
            type: complaint ? "COMPLAINT" : "POST_SALE",
            channel: "Pos-venda",
            note: note || complaint || "Oportunidade criada a partir do pos-venda.",
            result: complaint ? "Reclamacao transformada em oportunidade de resolucao" : "Nova oportunidade criada a partir do pos-venda",
            createdById: user.id,
            updatedById: user.id
          }
        });
      }
      if (shouldCreatePostSaleTask({ nextAction, nextFollowUp })) {
        await tx.graphicTask.create({
          data: {
            tenantId: user.tenantId,
            opportunityId: newOpportunity?.id || null,
            assignedToId: user.id,
            title: nextAction,
            dueDate: nextFollowUp,
            createdById: user.id,
            updatedById: user.id
          }
        });
      }
      const item = await tx.graphicPostSale.update({
        where: { id },
        data: {
          satisfaction,
          note,
          newOpportunityId: newOpportunity?.id || existing.newOpportunityId,
          status: String(body.status || "DONE"),
          updatedById: user.id
        }
      });
      return { item, newOpportunity };
    });
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_post_sale", entity: "GraphicPostSale", entityId: id, request, metadata: { satisfaction, status: result.item.status, newOpportunityId: result.newOpportunity?.id } });
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite atualizar pos-venda." : "Nao foi possivel atualizar o pos-venda.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
