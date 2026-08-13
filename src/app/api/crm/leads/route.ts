import { NextRequest, NextResponse } from "next/server";
import { requireApiModule } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { CRM_MODULE, ensureCrmDefaults, hasModuleAccess, normalizePhone } from "@/lib/crm";

export const dynamic = "force-dynamic";

const dateFields = new Set(["verifiedAt", "lastContactAt", "nextFollowUp", "expectedCloseDate", "closedAt"]);
const serverManagedFields = new Set(["lastActionByUserId", "lastActionByName", "lastActionAt", "contactLockedUntil"]);

function hasWhatsappPhone(lead: { normalizedPhone?: string | null; contact?: string | null }) {
  const source = [lead.normalizedPhone, lead.contact].filter(Boolean).join(" / ");
  const phones = source
    .split(/[\/,;|\n]+/)
    .flatMap((part) => {
      const matches = part.match(/(?:\+?55)?\s*\(?\d{2}\)?\s*9?\d{4,5}[-\s]?\d{4}/g) || [];
      return [part, ...matches];
    })
    .map((item) => item.replace(/\D/g, "").replace(/^55/, ""))
    .filter((item) => item.length === 10 || item.length === 11);
  return [...new Set(phones)].some((phone) => phone.length === 11 && phone[2] === "9");
}

function cleanData(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "id" || key === "tenantId" || key === "activities" || key === "createdAt" || key === "updatedAt" || serverManagedFields.has(key)) continue;
    if (dateFields.has(key)) out[key] = value ? new Date(String(value)) : null;
    else if (["proposedValue", "closeChance", "attempts"].includes(key)) out[key] = Number(value || 0);
    else if (["optOut", "doNotContact"].includes(key)) out[key] = Boolean(value);
    else out[key] = value === "" ? null : value;
  }
  if ("contact" in out) out.normalizedPhone = normalizePhone(String(out.contact || "")) || null;
  if (out.optOut || out.doNotContact) out.status = "Nao contatar";
  return out;
}

export async function GET(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  await ensureCrmDefaults(user.tenantId);
  const params = request.nextUrl.searchParams;
  const search = params.get("search")?.trim() || "";
  const status = params.get("status") || "";
  const city = params.get("city") || "";
  const segment = params.get("segment") || "";
  const type = params.get("type") || "";
  const ownerName = params.get("owner") || "";
  const temperature = params.get("temperature") || "";
  const priority = params.get("priority") || "";
  const origin = params.get("origin") || "";
  const owner = params.get("owner") || "";
  const noNext = params.get("noNext") === "true";
  const noOwner = params.get("noOwner") === "true";
  const followUp = params.get("followUp") || "";
  const channel = params.get("channel") || "";
  const page = Math.max(1, Number(params.get("page") || 1));
  const pageSize = Math.min(500, Math.max(10, Number(params.get("pageSize") || 25)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const where: any = {
    tenantId: user.tenantId,
    archivedAt: null,
    ...(status ? { status } : {}),
    ...(city ? { city } : {}),
    ...(segment ? { segment } : {}),
    ...(type ? { type } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(temperature ? { temperature } : {}),
    ...(priority ? { priority } : {}),
    ...(origin ? { origin } : {}),
    ...(owner ? { ownerName: owner } : {}),
    ...(noNext ? { nextFollowUp: null } : {}),
    ...(noOwner ? { ownerName: null } : {}),
    ...(search ? { OR: ["name", "companyName", "contact", "email", "city", "state", "website", "socialLink", "address", "notes"].map((field) => ({ [field]: { contains: search } })) } : {})
  };
  if (followUp === "overdue") where.nextFollowUp = { lt: today };
  if (followUp === "today") where.nextFollowUp = { gte: today, lt: tomorrow };
  if (followUp === "uncontacted") where.attempts = 0;

  const [rawItems, stages, templates, users, cityRows, segmentRows] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: [{ priority: "asc" }, { nextFollowUp: "asc" }, { createdAt: "desc" }], include: { activities: { orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true, username: true } } } } } }),
    prisma.crmPipelineStage.findMany({ where: { tenantId: user.tenantId }, orderBy: { position: "asc" } }),
    prisma.crmMessageTemplate.findMany({ where: { tenantId: user.tenantId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    prisma.user.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true, username: true, moduleAccess: true, role: true }, orderBy: { name: "asc" } }),
    prisma.lead.findMany({ where: { tenantId: user.tenantId, archivedAt: null, city: { not: null } }, select: { city: true }, distinct: ["city"], orderBy: { city: "asc" } }),
    prisma.lead.findMany({ where: { tenantId: user.tenantId, archivedAt: null, segment: { not: null } }, select: { segment: true }, distinct: ["segment"], orderBy: { segment: "asc" } })
  ]);
  const filteredItems = rawItems.filter((lead) => {
    if (channel === "whatsapp") return hasWhatsappPhone(lead);
    if (channel === "email") return Boolean(lead.email);
    if (channel === "phone") return Boolean(lead.normalizedPhone || lead.contact);
    if (channel === "no-contact") return !lead.normalizedPhone && !lead.contact && !lead.email;
    return true;
  });
  const items = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  return NextResponse.json({ items, total: filteredItems.length, page, pageSize, stages, templates, filters: { cities: cityRows.map((row) => row.city).filter(Boolean), segments: segmentRows.map((row) => row.segment).filter(Boolean) }, users: users.filter((item) => hasModuleAccess(item, CRM_MODULE)).map(({ moduleAccess, ...item }) => item), currentUserId: user.id, currentUserName: user.name });
}

export async function POST(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  const body = await request.json();
  const payload = cleanData(body.data || body);
  if (!String(payload.name || "").trim()) return NextResponse.json({ error: "Informe o nome do lead." }, { status: 400 });
  const duplicate = await prisma.lead.findFirst({ where: { tenantId: user.tenantId, archivedAt: null, OR: [...(payload.normalizedPhone ? [{ normalizedPhone: payload.normalizedPhone }] : []), ...(payload.email ? [{ email: payload.email }] : []), { name: String(payload.name), city: payload.city as string || null }] } });
  if (duplicate && !body.forceDuplicate) return NextResponse.json({ error: "Existe um lead semelhante. Revise antes de criar outro.", duplicate }, { status: 409 });
  const lead = await prisma.lead.create({ data: { ...payload, tenantId: user.tenantId } as any });
  await audit({ tenantId: user.tenantId, userId: user.id, action: "crm_create_lead", entity: "lead", entityId: lead.id, request });
  return NextResponse.json({ item: lead });
}

export async function PUT(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Lead obrigatorio." }, { status: 400 });
  const existing = await prisma.lead.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
  const clean = cleanData(body.data || {});
  const actionOwnerName = user.name || user.username;
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...clean,
      ownerName: clean.ownerName !== undefined ? clean.ownerName as any : actionOwnerName,
      lastActionByUserId: user.id,
      lastActionByName: actionOwnerName,
      lastActionAt: new Date()
    } as any
  });
  if (clean.status && clean.status !== existing.status) await prisma.crmActivity.create({ data: { tenantId: user.tenantId, leadId: id, userId: user.id, type: "Alteracao de etapa", channel: "Sistema", result: `Etapa alterada de ${existing.status} para ${clean.status}` } });
  await audit({ tenantId: user.tenantId, userId: user.id, action: "crm_update_lead", entity: "lead", entityId: id, request });
  return NextResponse.json({ item: lead });
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  const id = request.nextUrl.searchParams.get("id") || "";
  const existing = await prisma.lead.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
  await prisma.lead.update({ where: { id }, data: { archivedAt: new Date() } });
  await audit({ tenantId: user.tenantId, userId: user.id, action: "crm_archive_lead", entity: "lead", entityId: id, request });
  return NextResponse.json({ ok: true });
}
