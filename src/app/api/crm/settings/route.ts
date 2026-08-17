import { NextRequest, NextResponse } from "next/server";
import { requireApiModule } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { canManageCrmSettings, CRM_MODULE, ensureCrmDefaults } from "@/lib/crm";

export async function GET() {
  const user = await requireApiModule(CRM_MODULE);
  await ensureCrmDefaults(user.tenantId);
  const [stages, templates] = await Promise.all([
    prisma.crmPipelineStage.findMany({ where: { tenantId: user.tenantId }, orderBy: { position: "asc" } }),
    prisma.crmMessageTemplate.findMany({ where: { tenantId: user.tenantId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] })
  ]);
  return NextResponse.json({ stages, templates, canManage: canManageCrmSettings(user) });
}

export async function POST(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  if (!canManageCrmSettings(user)) return NextResponse.json({ error: "Seu perfil nao permite alterar a configuracao do CRM." }, { status: 403 });
  const body = await request.json();
  const kind = String(body.kind || "");
  const data = body.data || {};
  if (kind === "stage") {
    const item = await prisma.crmPipelineStage.create({ data: { tenantId: user.tenantId, name: String(data.name || "").trim(), color: String(data.color || "violet"), kind: String(data.kind || "active"), position: Number(data.position || 0), defaultProbability: Number(data.defaultProbability || 0), active: data.active !== false } });
    return NextResponse.json({ item });
  }
  if (kind === "template") {
    if (data.isDefault) await prisma.crmMessageTemplate.updateMany({ where: { tenantId: user.tenantId }, data: { isDefault: false } });
    const item = await prisma.crmMessageTemplate.create({ data: { tenantId: user.tenantId, name: String(data.name || "Mensagem pronta").trim(), content: String(data.content || "").trim(), isDefault: Boolean(data.isDefault) } });
    return NextResponse.json({ item });
  }
  return NextResponse.json({ error: "Configuracao invalida." }, { status: 400 });
}

export async function PUT(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  if (!canManageCrmSettings(user)) return NextResponse.json({ error: "Seu perfil nao permite alterar a configuracao do CRM." }, { status: 403 });
  const body = await request.json();
  const kind = String(body.kind || "");
  const id = String(body.id || "");
  if (kind === "stage") {
    const exists = await prisma.crmPipelineStage.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!exists) return NextResponse.json({ error: "Etapa nao encontrada." }, { status: 404 });
    const item = await prisma.crmPipelineStage.update({ where: { id }, data: { name: String(body.data?.name || exists.name), color: String(body.data?.color || exists.color), kind: String(body.data?.kind || exists.kind), position: Number(body.data?.position ?? exists.position), defaultProbability: Number(body.data?.defaultProbability ?? exists.defaultProbability), active: body.data?.active !== undefined ? Boolean(body.data.active) : exists.active } });
    return NextResponse.json({ item });
  }
  if (kind === "template") {
    const exists = await prisma.crmMessageTemplate.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!exists) return NextResponse.json({ error: "Mensagem nao encontrada." }, { status: 404 });
    if (body.data?.isDefault) await prisma.crmMessageTemplate.updateMany({ where: { tenantId: user.tenantId }, data: { isDefault: false } });
    const item = await prisma.crmMessageTemplate.update({ where: { id }, data: { name: String(body.data?.name || exists.name), content: String(body.data?.content || exists.content), isDefault: Boolean(body.data?.isDefault) } });
    await audit({ tenantId: user.tenantId, userId: user.id, action: "crm_update_settings", entity: kind, entityId: id, request });
    return NextResponse.json({ item });
  }
  return NextResponse.json({ error: "Configuracao invalida." }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  if (!canManageCrmSettings(user)) return NextResponse.json({ error: "Seu perfil nao permite alterar a configuracao do CRM." }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id") || "";
  const kind = request.nextUrl.searchParams.get("kind") || "";
  if (kind === "stage") await prisma.crmPipelineStage.deleteMany({ where: { id, tenantId: user.tenantId } });
  if (kind === "template") await prisma.crmMessageTemplate.deleteMany({ where: { id, tenantId: user.tenantId } });
  return NextResponse.json({ ok: true });
}
