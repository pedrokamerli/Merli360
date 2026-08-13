import { NextRequest, NextResponse } from "next/server";
import { requireApiSuperAdmin, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function ensureDefaults(tenantId: string, kind: string) {
  const categories = [
    ["Entrada a conferir", "entrada"],
    ["Venda de produtos", "entrada"],
    ["Venda de servicos", "entrada"],
    ["Outras receitas", "entrada"],
    ["Alimentacao", "saida"],
    ["Transporte e frete", "saida"],
    ["Combustivel", "saida"],
    ["Ferramentas e sistemas", "saida"],
    ["Impostos e taxas", "saida"],
    ["Tarifas bancarias", "saida"],
    ["A conferir", "neutro"],
    ...(kind === "agro"
      ? [
          ["Vendas de hortalicas", "entrada"],
          ["Vendas de legumes", "entrada"],
          ["Sementes/mudas", "saida"],
          ["Adubo/fertilizante", "saida"],
          ["Defensivos", "saida"],
          ["Irrigacao", "saida"],
          ["Embalagens", "saida"]
        ]
      : [])
  ];
  for (const [name, type] of categories) {
    const existing = await prisma.category.findFirst({ where: { tenantId, name, type } });
    if (!existing) await prisma.category.create({ data: { tenantId, name, type } });
  }

  for (const account of ["PJ", "pessoal", "dinheiro", "cartao", "outro"]) {
    await prisma.financialAccount.upsert({
      where: { tenantId_name: { tenantId, name: account } },
      update: {},
      create: { tenantId, name: account, type: account === "dinheiro" ? "dinheiro/caixa" : account === "cartao" ? "cartao de credito" : "conta bancaria", includeInTotal: account !== "cartao" }
    });
  }
}

export async function GET() {
  await requireApiSuperAdmin();
  const [users, tenants] = await Promise.all([
    prisma.user.findMany({ include: { tenant: true }, orderBy: { createdAt: "desc" } }),
    prisma.tenant.findMany({ orderBy: { createdAt: "desc" } })
  ]);
  const logs = await prisma.auditLog.findMany({
    where: {},
    include: { user: { select: { id: true, name: true, username: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 150
  });
  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant.brandName,
      tenantKind: user.tenant.kind,
      mustChangePassword: user.mustChangePassword,
      moduleAccess: user.moduleAccess,
      createdAt: user.createdAt
    })),
    tenants,
    logs
  });
}

export async function POST(request: NextRequest) {
  const currentUser = await requireApiSuperAdmin();
  const body = await request.json();
  const tenantMode = String(body.tenantMode || "new");
  const tenantId = String(body.tenantId || "");
  const brandName = String(body.brandName || body.tenantName || "").trim();
  const tenantName = String(body.tenantName || brandName || "").trim();
  const kind = String(body.kind || "consultoria");
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || username).trim();
  const role = String(body.role || "admin");
  const moduleAccess = Array.isArray(body.moduleAccess) && body.moduleAccess.length ? JSON.stringify(body.moduleAccess) : "all";

  if (!username || !password || !name) return NextResponse.json({ error: "Nome, usuario e senha sao obrigatorios." }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Senha precisa ter pelo menos 6 caracteres." }, { status: 400 });

  const tenant =
    tenantMode === "existing" && tenantId
      ? await prisma.tenant.findUnique({ where: { id: tenantId } })
      : await prisma.tenant.create({
          data: {
            name: tenantName || name,
            brandName: brandName || tenantName || name,
            kind,
            slug: `${slugify(brandName || tenantName || username)}-${Date.now().toString(36)}`
          }
        });

  if (!tenant) return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });

  let user;
  try {
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        name,
        role,
        moduleAccess
      },
      include: { tenant: true }
    });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Esse usuario ja existe." }, { status: 409 });
    throw error;
  }

  await ensureDefaults(tenant.id, tenant.kind);

  await audit({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    action: "superadmin_create_user",
    entity: "users",
    entityId: user.id,
    request,
    metadata: { username, tenantId: tenant.id, role, moduleAccess }
  });

  return NextResponse.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role, tenantName: user.tenant.brandName } });
}

export async function PUT(request: NextRequest) {
  const currentUser = await requireApiSuperAdmin();
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "ID obrigatorio." }, { status: 400 });
  const username = String(body.username || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const role = String(body.role || "user");
  const tenantId = String(body.tenantId || "");
  const moduleAccess = Array.isArray(body.moduleAccess) && body.moduleAccess.length ? JSON.stringify(body.moduleAccess) : "all";
  if (!username || !name) return NextResponse.json({ error: "Nome e usuario sao obrigatorios." }, { status: 400 });
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
  }
  const data: any = {
    username,
    name,
    role,
    moduleAccess,
    ...(tenantId ? { tenantId } : {})
  };
  if (body.password) data.passwordHash = hashPassword(String(body.password));
  if (body.password) data.mustChangePassword = true;
  if (body.mustChangePassword !== undefined) data.mustChangePassword = Boolean(body.mustChangePassword);
  let user;
  try {
    user = await prisma.user.update({ where: { id }, data, include: { tenant: true } });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Esse usuario ja existe." }, { status: 409 });
    throw error;
  }
  await prisma.assistantProfile.updateMany({ where: { userId: id }, data: { ownerName: name } });
  await audit({ tenantId: currentUser.tenantId, userId: currentUser.id, action: "superadmin_update_user", entity: "users", entityId: user.id, request });
  return NextResponse.json({ user });
}

export async function DELETE(request: NextRequest) {
  const currentUser = await requireApiSuperAdmin();
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "ID obrigatorio." }, { status: 400 });
  if (id === currentUser.id) return NextResponse.json({ error: "Voce nao pode excluir seu proprio usuario." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  if (user.role === "superadmin") {
    const superadmins = await prisma.user.count({ where: { role: "superadmin" } });
    if (superadmins <= 1) return NextResponse.json({ error: "Mantenha pelo menos um super usuario ativo." }, { status: 400 });
  }
  await prisma.user.delete({ where: { id } });
  await audit({ tenantId: currentUser.tenantId, userId: currentUser.id, action: "superadmin_delete_user", entity: "users", entityId: id, request, metadata: { username: user.username } });
  return NextResponse.json({ ok: true });
}
