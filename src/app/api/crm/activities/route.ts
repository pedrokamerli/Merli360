import { NextRequest, NextResponse } from "next/server";
import { requireApiModule } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { CRM_MODULE } from "@/lib/crm";

export async function POST(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  const body = await request.json();
  const leadId = String(body.leadId || "");
  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId: user.tenantId } });
  if (!lead) return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
  const type = String(body.type || "Follow-up");
  const channel = String(body.channel || "Outro");
  const isExternalContact = ["whatsapp", "ligacao", "email", "instagram"].includes(channel.toLowerCase());
  const now = new Date();
  if (isExternalContact && lead.contactLockedUntil && lead.contactLockedUntil > now && lead.lastActionByUserId !== user.id) {
    return NextResponse.json({
      error: `${lead.lastActionByName || "Outro usuario"} ja iniciou uma abordagem neste lead. Aguarde ou registre o proximo passo no historico.`,
      lockedUntil: lead.contactLockedUntil,
      actionBy: lead.lastActionByName
    }, { status: 409 });
  }
  const nextActionDate = body.nextActionDate ? new Date(String(body.nextActionDate)) : null;
  const leadStatus = body.leadStatus ? String(body.leadStatus) : null;
  const actionOwnerName = user.name || user.username;
  const activity = await prisma.crmActivity.create({
    data: {
      tenantId: user.tenantId,
      leadId,
      userId: user.id,
      type,
      channel,
      result: body.result ? String(body.result) : null,
      note: body.note ? String(body.note) : null,
      nextAction: body.nextAction ? String(body.nextAction) : null,
      nextActionDate,
      status: String(body.status || "concluida")
    },
    include: { user: { select: { name: true, username: true } } }
  });
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      lastContactAt: now,
      lastActionByUserId: user.id,
      lastActionByName: user.name || user.username,
      lastActionAt: now,
      ...(isExternalContact ? { contactLockedUntil: new Date(now.getTime() + 30 * 60 * 1000) } : {}),
      lastContactResult: body.result ? String(body.result) : null,
      nextAction: body.nextAction ? String(body.nextAction) : null,
      nextFollowUp: nextActionDate,
      ...(leadStatus ? { status: leadStatus } : {}),
      ownerName: actionOwnerName,
      ...(body.proposedValue !== undefined ? { proposedValue: Number(body.proposedValue || 0), hasOpportunity: Number(body.proposedValue || 0) > 0 || lead.hasOpportunity } : {}),
      ...(body.closeChance !== undefined ? { closeChance: Number(body.closeChance || 0), probabilityManual: true } : {}),
      attempts: { increment: type === "WhatsApp aberto" ? 0 : 1 },
      ...(type === "Opt-out" ? { optOut: true, doNotContact: true, status: "Nao contatar", blockReason: body.note ? String(body.note) : "Opt-out solicitado" } : {})
    }
  });
  await audit({ tenantId: user.tenantId, userId: user.id, action: "crm_activity", entity: "lead", entityId: leadId, request, metadata: { type, channel } });
  return NextResponse.json({ item: activity });
}
