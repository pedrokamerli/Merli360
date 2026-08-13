import { NextRequest, NextResponse } from "next/server";
import { requireApiModule } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { CRM_MODULE } from "@/lib/crm";

export async function POST(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  const body = await request.json();
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const action = String(body.action || "");
  if (!ids.length) return NextResponse.json({ error: "Selecione ao menos um lead." }, { status: 400 });
  const where = { tenantId: user.tenantId, id: { in: ids } };
  const now = new Date();
  const actionOwnerName = user.name || user.username;
  const baseActionData = { ownerName: actionOwnerName, lastActionByUserId: user.id, lastActionByName: actionOwnerName, lastActionAt: now };
  const data: any = action === "archive" ? { archivedAt: now, ...baseActionData } : action === "doNotContact" ? { doNotContact: true, status: "Nao contatar", ...baseActionData } : { ...(body.data || {}), ...baseActionData };
  if (!Object.keys(data).length) return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  const result = await prisma.lead.updateMany({ where, data });
  if (action === "stage" && data.status) await prisma.crmActivity.createMany({ data: ids.map((leadId: string) => ({ tenantId: user.tenantId, leadId, userId: user.id, type: "Alteracao de etapa", channel: "Sistema", result: `Etapa alterada para ${data.status}` })) });
  await audit({ tenantId: user.tenantId, userId: user.id, action: "crm_bulk_update", entity: "lead", request, metadata: { action, count: result.count } });
  return NextResponse.json({ count: result.count });
}
