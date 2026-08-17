import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission, cents } from "@/lib/graphic";
import { isProductionStepStatus, mergeChecklist, positiveNumber, validateProductionCompletion, validateProductionStatusChange, validateRework } from "@/lib/graphic-production";
import { refreshGraphicMaterialNeeds, registerGraphicProductionConsumption } from "@/lib/graphic-inventory";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "production:update");
    const body = await request.json();
    const id = String(body.id || "");
    const action = String(body.action || "status");
    const status = String(body.status || "");
    const note = String(body.note || "");
    if (!id) return NextResponse.json({ error: "Informe a ordem de producao." }, { status: 400 });
    const db = prisma as any;
    const existing = await db.graphicProductionOrder.findFirst({ where: { id, tenantId: user.tenantId }, include: { steps: true } });
    if (!existing) return NextResponse.json({ error: "Ordem de producao nao encontrada." }, { status: 404 });

    if (action === "checklist") {
      const checklist = mergeChecklist(existing.checklist, body.checklist || body);
      const item = await db.$transaction(async (tx: any) => {
        const updated = await tx.graphicProductionOrder.update({ where: { id }, data: { checklist: JSON.stringify(checklist), updatedById: user.id } });
        await tx.graphicProductionEvent.create({ data: { tenantId: user.tenantId, productionOrderId: id, userId: user.id, action: "CHECKLIST_UPDATED", note: note || null, createdById: user.id, updatedById: user.id } });
        return updated;
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_production_checklist", entity: "GraphicProductionOrder", entityId: id, request });
      return NextResponse.json({ item, checklist });
    }

    if (action === "step") {
      const stepId = String(body.stepId || "");
      const stepStatus = String(body.stepStatus || "");
      const minutes = Number(body.minutes || 0);
      if (!stepId || !isProductionStepStatus(stepStatus)) return NextResponse.json({ error: "Informe etapa e status validos." }, { status: 400 });
      const step = existing.steps.find((item: any) => item.id === stepId);
      if (!step) return NextResponse.json({ error: "Etapa nao encontrada." }, { status: 404 });
      const previous = existing.steps.filter((item: any) => item.position < step.position).sort((a: any, b: any) => b.position - a.position)[0];
      if (stepStatus === "IN_PROGRESS" && previous && previous.status !== "COMPLETED" && previous.status !== "SKIPPED") return NextResponse.json({ error: `Conclua a etapa ${previous.name} antes de iniciar ${step.name}.` }, { status: 400 });
      if (stepStatus === "COMPLETED" && !step.startedAt) return NextResponse.json({ error: "Inicie a etapa antes de conclui-la." }, { status: 400 });
      const elapsedMinutes = step.startedAt ? Math.max(1, Math.ceil((Date.now() - new Date(step.startedAt).getTime()) / 60000)) : 0;
      const completedMinutes = Math.max(step.actualMinutes || 0, minutes || elapsedMinutes);
      const item = await db.$transaction(async (tx: any) => {
        const updated = await tx.graphicProductionStep.update({
          where: { id: stepId },
          data: {
            status: stepStatus,
            actualMinutes: stepStatus === "COMPLETED" ? completedMinutes : step.actualMinutes,
            startedAt: stepStatus === "IN_PROGRESS" && !step.startedAt ? new Date() : step.startedAt,
            completedAt: stepStatus === "COMPLETED" ? new Date() : step.completedAt,
            updatedById: user.id
          }
        });
        await tx.graphicProductionEvent.create({ data: { tenantId: user.tenantId, productionOrderId: id, userId: user.id, stepName: step.name, action: `STEP_${stepStatus}`, minutes: stepStatus === "COMPLETED" ? completedMinutes : null, note: note || null, createdById: user.id, updatedById: user.id } });
        return updated;
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_production_step", entity: "GraphicProductionStep", entityId: stepId, request, metadata: { stepStatus } });
      return NextResponse.json({ item });
    }

    if (action === "consumption") {
      const description = String(body.description || "").trim();
      const quantity = positiveNumber(body.quantity);
      const wasteQuantity = Number(String(body.wasteQuantity || "0").replace(",", ".")) || 0;
      if (!description) return NextResponse.json({ error: "Informe o material consumido." }, { status: 400 });
      if (quantity <= 0) return NextResponse.json({ error: "Informe uma quantidade consumida maior que zero." }, { status: 400 });
      if (wasteQuantity < 0) return NextResponse.json({ error: "Perda nao pode ser negativa." }, { status: 400 });
      const materialId = body.materialId ? String(body.materialId) : null;
      if (materialId) {
        const material = await db.graphicMaterial.findFirst({ where: { id: materialId, tenantId: user.tenantId } });
        if (!material) return NextResponse.json({ error: "Material nao encontrado." }, { status: 404 });
      }
      const item = await registerGraphicProductionConsumption({ tenantId: user.tenantId, userId: user.id, productionOrderId: id, materialId, description, quantity, wasteQuantity, costCents: cents(body.cost) });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_register_material_consumption", entity: "GraphicMaterialConsumption", entityId: item.id, request });
      return NextResponse.json({ item });
    }

    if (action === "rework") {
      const reason = String(body.reason || "");
      const impact = String(body.impact || "");
      const correctiveAction = String(body.correctiveAction || "");
      const validation = validateRework(reason, impact, correctiveAction);
      if (validation) return NextResponse.json({ error: validation }, { status: 400 });
      const item = await db.$transaction(async (tx: any) => {
        const rework = await tx.graphicReworkRecord.create({ data: { tenantId: user.tenantId, productionOrderId: id, reason, impact, correctiveAction, costCents: cents(body.cost), createdById: user.id, updatedById: user.id } });
        await tx.graphicProductionEvent.create({ data: { tenantId: user.tenantId, productionOrderId: id, userId: user.id, action: "REWORK_REGISTERED", note: reason, createdById: user.id, updatedById: user.id } });
        return rework;
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_register_rework", entity: "GraphicReworkRecord", entityId: item.id, request });
      return NextResponse.json({ item });
    }

    if (action === "issue") {
      const category = String(body.category || "").trim();
      const issueNote = String(body.note || "").trim();
      if (!category || !issueNote) return NextResponse.json({ error: "Informe categoria e descricao do problema." }, { status: 400 });
      const item = await db.$transaction(async (tx: any) => {
        return tx.graphicProductionEvent.create({ data: { tenantId: user.tenantId, productionOrderId: id, userId: user.id, action: "ISSUE_RECORDED", note: `[${category}] ${issueNote}`, createdById: user.id, updatedById: user.id } });
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_register_production_issue", entity: "GraphicProductionOrder", entityId: id, request, metadata: { category } });
      return NextResponse.json({ item });
    }

    if (!status) return NextResponse.json({ error: "Informe o novo status." }, { status: 400 });
    if (["BLOCKED", "CANCELLED"].includes(status) && !note) return NextResponse.json({ error: "Informe o motivo." }, { status: 400 });
    const checklist = mergeChecklist(existing.checklist, {});
    const statusError = validateProductionStatusChange(existing.status, status, checklist);
    if (statusError) return NextResponse.json({ error: statusError }, { status: 400 });
    if (status === "COMPLETED") {
      const completionError = validateProductionCompletion(existing.steps);
      if (completionError) return NextResponse.json({ error: completionError }, { status: 400 });
    }
    const item = await db.$transaction(async (tx: any) => {
      const updated = await tx.graphicProductionOrder.update({ where: { id }, data: { status, blockedReason: status === "BLOCKED" ? note : existing.blockedReason, updatedById: user.id } });
      await tx.graphicProductionEvent.create({ data: { tenantId: user.tenantId, productionOrderId: id, userId: user.id, action: `STATUS_${status}`, note: note || null, createdById: user.id, updatedById: user.id } });
      return updated;
    });
    const materialNeeds = status === "RELEASED" ? await refreshGraphicMaterialNeeds({ tenantId: user.tenantId, userId: user.id, productionOrderId: id }) : null;
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_production", entity: "GraphicProductionOrder", entityId: id, request, metadata: { status } });
    return NextResponse.json({ item, materialNeeds });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite atualizar producao." : "Nao foi possivel atualizar a producao.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
