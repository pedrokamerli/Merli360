import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission, cents, dateOrNull, ensureGraphicDefaults } from "@/lib/graphic";
import { opportunityQualityAlert, shouldCreateFollowUpTask, validateOpportunityUpdate } from "@/lib/graphic-opportunities";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "opportunity:write");
    await ensureGraphicDefaults(user.tenantId);
    const body = await request.json();
    const db = prisma as any;
    const clientName = String(body.clientName || "").trim();
    const title = String(body.title || clientName || "").trim();
    if (!clientName) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Informe a oportunidade." }, { status: 400 });
    if (!body.nextAction && !body.nextFollowUp) return NextResponse.json({ error: "Informe o proximo passo ou a data de retorno." }, { status: 400 });
    const allowedStages = await db.graphicPipelineStage.findMany({ where: { tenantId: user.tenantId, active: true, status: "ACTIVE" }, select: { name: true } });
    const initialStatus = String(body.status || "OPEN");
    if (!allowedStages.map((stage: any) => stage.name).includes(initialStatus)) return NextResponse.json({ error: "Etapa de oportunidade invalida." }, { status: 400 });

    const { client, opportunity } = await db.$transaction(async (tx: any) => {
      const requestedClientId = String(body.clientId || "").trim();
      const client = requestedClientId
        ? await tx.client.findFirst({ where: { id: requestedClientId, tenantId: user.tenantId } })
        : await tx.client.create({
            data: {
              tenantId: user.tenantId,
              name: clientName,
              type: "grafica",
              phone: String(body.phone || "") || null,
              email: String(body.email || "") || null,
              city: String(body.city || "") || null,
              state: String(body.state || "") || null,
              segment: "Grafica"
            }
          });
      if (!client) throw new Error("CLIENT_NOT_FOUND");
      const opportunity = await tx.graphicOpportunity.create({
        data: {
          tenantId: user.tenantId,
          clientId: client.id,
          ownerId: user.id,
          title,
          source: String(body.source || "Atendimento") || null,
          productInterest: String(body.productInterest || "") || null,
          estimatedValueCents: cents(body.estimatedValue),
          status: initialStatus,
          nextAction: String(body.nextAction || "") || null,
          nextFollowUp: dateOrNull(body.nextFollowUp),
          qualityAlert: opportunityQualityAlert({ status: "OPEN", nextAction: body.nextAction, nextFollowUp: body.nextFollowUp }),
          createdById: user.id,
          updatedById: user.id
        }
      });
      await tx.graphicActivity.create({
        data: { tenantId: user.tenantId, opportunityId: opportunity.id, userId: user.id, type: "CREATED", channel: "CRM", result: "Atendimento criado", createdById: user.id, updatedById: user.id }
      });
      if (shouldCreateFollowUpTask({ nextAction: opportunity.nextAction, nextFollowUp: opportunity.nextFollowUp })) {
        await tx.graphicTask.create({
          data: { tenantId: user.tenantId, opportunityId: opportunity.id, assignedToId: user.id, title: opportunity.nextAction, dueDate: opportunity.nextFollowUp, createdById: user.id, updatedById: user.id }
        });
      }
      return { client, opportunity };
    });

    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_create_opportunity", entity: "GraphicOpportunity", entityId: opportunity.id, request });
    return NextResponse.json({ item: opportunity, client });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : error?.message === "CLIENT_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite criar oportunidades." : status === 404 ? "Cliente nao encontrado neste ambiente." : "Nao foi possivel criar a oportunidade.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "opportunity:write");
    await ensureGraphicDefaults(user.tenantId);
    const body = await request.json();
    const db = prisma as any;
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Oportunidade obrigatoria." }, { status: 400 });
    const existing = await db.graphicOpportunity.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return NextResponse.json({ error: "Oportunidade nao encontrada." }, { status: 404 });
    const allowedStages = await db.graphicPipelineStage.findMany({ where: { tenantId: user.tenantId, active: true, status: "ACTIVE" }, select: { name: true } });
    const allowedStatuses = allowedStages.map((stage: any) => stage.name);

    const nextStatus = String(body.status || existing.status);
    const nextAction = body.nextAction !== undefined ? String(body.nextAction || "").trim() || null : existing.nextAction;
    const nextFollowUp = body.nextFollowUp !== undefined ? dateOrNull(body.nextFollowUp) : existing.nextFollowUp;
    const lossReason = body.lossReason !== undefined ? String(body.lossReason || "").trim() : existing.lossReason;
    const validation = validateOpportunityUpdate({ currentStatus: existing.status, nextStatus, lossReason, nextAction, nextFollowUp, allowedStatuses });
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });

    const item = await db.$transaction(async (tx: any) => {
      const updated = await tx.graphicOpportunity.update({
        where: { id },
        data: {
          status: nextStatus,
          nextAction,
          nextFollowUp,
          lossReason: nextStatus === "LOST" ? lossReason : null,
          qualityAlert: opportunityQualityAlert({ status: nextStatus, nextAction, nextFollowUp }),
          updatedById: user.id
        }
      });
      const note = String(body.note || "").trim();
      if (note || body.channel || body.result || existing.status !== nextStatus) {
        await tx.graphicActivity.create({
          data: {
            tenantId: user.tenantId,
            opportunityId: id,
            userId: user.id,
            type: nextStatus === "LOST" ? "LOSS" : "INTERACTION",
            channel: String(body.channel || "Painel") || null,
            note: note || null,
            result: String(body.result || (existing.status !== nextStatus ? `Status alterado para ${nextStatus}` : "")) || null,
            createdById: user.id,
            updatedById: user.id
          }
        });
      }
      if (shouldCreateFollowUpTask({ nextAction, nextFollowUp })) {
        await tx.graphicTask.create({
          data: { tenantId: user.tenantId, opportunityId: id, assignedToId: user.id, title: nextAction, dueDate: nextFollowUp, createdById: user.id, updatedById: user.id }
        });
      }
      return updated;
    });

    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_opportunity", entity: "GraphicOpportunity", entityId: id, request, metadata: { status: nextStatus } });
    return NextResponse.json({ item });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite alterar oportunidades." : "Nao foi possivel alterar a oportunidade.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
