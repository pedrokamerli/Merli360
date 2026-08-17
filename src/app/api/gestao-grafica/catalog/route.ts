import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { GRAPHIC_CATALOG_TOKEN_KEY, newGraphicCatalogToken, slugifyCatalogName } from "@/lib/graphic-catalog";
import { assertGraphicCommercialAccess, getGraphicRole, hasGraphicAccess, hasGraphicPermission } from "@/lib/graphic";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  const message = String((error as Error)?.message || error);
  if (message === "UNAUTHORIZED") return 401;
  if (["FORBIDDEN_MODULE", "FORBIDDEN_GRAPHIC_PERMISSION"].includes(message)) return 403;
  if (message.startsWith("CATALOG_")) return 400;
  return 500;
}

function publicItem(item: any, includeCosts: boolean) {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    category: item.category,
    description: item.description,
    imageUrl: item.imageUrl,
    imagePosition: item.imagePosition,
    status: item.status,
    featured: item.featured,
    sortOrder: item.sortOrder,
    source: item.source,
    variants: (item.variants || []).map((variant: any) => ({
      id: variant.id,
      label: variant.label,
      sku: variant.sku,
      option1Name: variant.option1Name,
      option1Value: variant.option1Value,
      option2Name: variant.option2Name,
      option2Value: variant.option2Value,
      option3Name: variant.option3Name,
      option3Value: variant.option3Value,
      widthMm: variant.widthMm,
      heightMm: variant.heightMm,
      quantity: variant.quantity,
      priceCents: variant.priceCents,
      costCents: includeCosts ? variant.costCents : undefined,
      sourcePriceCents: includeCosts ? variant.sourcePriceCents : undefined,
      validationStatus: includeCosts ? variant.validationStatus : undefined,
      status: variant.status,
      productId: variant.productId,
      productName: variant.product?.name || null
    }))
  };
}

async function context() {
  const user = await requireApiUser();
  assertGraphicCommercialAccess(user);
  const role = await getGraphicRole(user);
  const canManage = hasGraphicAccess(user) && hasGraphicPermission(role, "catalog:manage");
  return { user, role, canManage, db: prisma as any };
}

async function tokenForTenant(db: any, tenantId: string, userId: string) {
  return db.graphicSetting.upsert({
    where: { tenantId_key: { tenantId, key: GRAPHIC_CATALOG_TOKEN_KEY } },
    update: { status: "ACTIVE" },
    create: {
      tenantId,
      key: GRAPHIC_CATALOG_TOKEN_KEY,
      value: newGraphicCatalogToken(),
      status: "ACTIVE",
      createdById: userId,
      updatedById: userId
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const { user, role, canManage, db } = await context();
    const showInactive = canManage && request.nextUrl.searchParams.get("all") === "1";
    const [items, token] = await Promise.all([
      db.graphicCatalogItem.findMany({
        where: { tenantId: user.tenantId, ...(showInactive ? {} : { status: "ACTIVE" }) },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          variants: {
            where: showInactive ? {} : { status: "ACTIVE" },
            orderBy: [{ quantity: "asc" }, { widthMm: "asc" }, { heightMm: "asc" }, { label: "asc" }],
            include: { product: { select: { id: true, name: true } } }
          }
        }
      }),
      tokenForTenant(db, user.tenantId, user.id)
    ]);
    return NextResponse.json({
      role,
      canManage,
      token: token.value,
      publicPath: `/public/catalogo/${token.value}`,
      items: items.map((item: any) => publicItem(item, canManage))
    });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 401 ? "Autenticacao obrigatoria." : status === 403 ? "Seu perfil nao acessa o catalogo." : "Nao foi possivel carregar o catalogo." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, canManage, db } = await context();
    if (!canManage) throw new Error("FORBIDDEN_GRAPHIC_PERMISSION");
    const body = await request.json();
    const action = String(body.action || "create-item");

    if (action === "rotate-link") {
      const value = newGraphicCatalogToken();
      await db.graphicSetting.upsert({
        where: { tenantId_key: { tenantId: user.tenantId, key: GRAPHIC_CATALOG_TOKEN_KEY } },
        update: { value, status: "ACTIVE", updatedById: user.id },
        create: { tenantId: user.tenantId, key: GRAPHIC_CATALOG_TOKEN_KEY, value, status: "ACTIVE", createdById: user.id, updatedById: user.id }
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_rotate_catalog_link", entity: "GraphicSetting", request });
      return NextResponse.json({ token: value, publicPath: `/public/catalogo/${value}` });
    }

    if (action === "create-variant") {
      const item = await db.graphicCatalogItem.findFirst({ where: { id: String(body.catalogItemId || ""), tenantId: user.tenantId } });
      if (!item) throw new Error("CATALOG_ITEM_NOT_FOUND");
      if (!String(body.label || "").trim()) throw new Error("CATALOG_VARIANT_LABEL_REQUIRED");
      const variant = await db.graphicCatalogVariant.create({
        data: {
          tenantId: user.tenantId,
          catalogItemId: item.id,
          productId: body.productId ? String(body.productId) : null,
          label: String(body.label).trim(),
          sku: String(body.sku || "").trim() || null,
          widthMm: body.widthMm ? Math.round(Number(body.widthMm)) : null,
          heightMm: body.heightMm ? Math.round(Number(body.heightMm)) : null,
          quantity: Math.max(1, Math.round(Number(body.quantity || 1))),
          priceCents: Math.max(0, Math.round(Number(body.priceCents || 0))),
          costCents: Math.max(0, Math.round(Number(body.costCents || 0))),
          sourcePriceCents: Math.max(0, Math.round(Number(body.priceCents || 0))),
          validationStatus: "MANUAL",
          status: "ACTIVE",
          createdById: user.id,
          updatedById: user.id
        }
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_create_catalog_variant", entity: "GraphicCatalogVariant", entityId: variant.id, request });
      return NextResponse.json({ item: variant });
    }

    const name = String(body.name || "").trim();
    if (!name) throw new Error("CATALOG_NAME_REQUIRED");
    const baseSlug = slugifyCatalogName(name);
    const existing = await db.graphicCatalogItem.findFirst({ where: { tenantId: user.tenantId, slug: baseSlug }, select: { id: true } });
    const slug = existing ? `${baseSlug}-${Date.now().toString().slice(-6)}` : baseSlug;
    const item = await db.graphicCatalogItem.create({
      data: {
        tenantId: user.tenantId,
        slug,
        name,
        category: String(body.category || "Catalogo").trim() || "Catalogo",
        description: String(body.description || "").trim() || null,
        imageUrl: String(body.imageUrl || "").trim() || null,
        imagePosition: String(body.imagePosition || "center").trim() || "center",
        status: "ACTIVE",
        featured: Boolean(body.featured),
        sortOrder: Math.max(0, Math.round(Number(body.sortOrder || 0))),
        source: "MANUAL",
        createdById: user.id,
        updatedById: user.id
      }
    });
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_create_catalog_item", entity: "GraphicCatalogItem", entityId: item.id, request });
    return NextResponse.json({ item });
  } catch (error) {
    const status = statusFor(error);
    const message = String((error as Error)?.message || error);
    const errors: Record<string, string> = {
      CATALOG_NAME_REQUIRED: "Informe o nome do produto.",
      CATALOG_ITEM_NOT_FOUND: "Produto do catalogo nao encontrado.",
      CATALOG_VARIANT_LABEL_REQUIRED: "Informe o nome da opcao ou kit."
    };
    return NextResponse.json({ error: status === 403 ? "Somente a administracao pode alterar o catalogo." : errors[message] || "Nao foi possivel cadastrar no catalogo." }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, canManage, db } = await context();
    if (!canManage) throw new Error("FORBIDDEN_GRAPHIC_PERMISSION");
    const body = await request.json();
    const action = String(body.action || "update-item");

    if (action === "update-variant") {
      const variant = await db.graphicCatalogVariant.findFirst({ where: { id: String(body.id || ""), tenantId: user.tenantId } });
      if (!variant) throw new Error("CATALOG_VARIANT_NOT_FOUND");
      const updated = await db.graphicCatalogVariant.update({
        where: { id: variant.id },
        data: {
          label: String(body.label ?? variant.label).trim() || variant.label,
          sku: body.sku === undefined ? variant.sku : String(body.sku || "").trim() || null,
          widthMm: body.widthMm === undefined ? variant.widthMm : body.widthMm ? Math.round(Number(body.widthMm)) : null,
          heightMm: body.heightMm === undefined ? variant.heightMm : body.heightMm ? Math.round(Number(body.heightMm)) : null,
          quantity: body.quantity === undefined ? variant.quantity : Math.max(1, Math.round(Number(body.quantity || 1))),
          priceCents: body.priceCents === undefined ? variant.priceCents : Math.max(0, Math.round(Number(body.priceCents || 0))),
          costCents: body.costCents === undefined ? variant.costCents : Math.max(0, Math.round(Number(body.costCents || 0))),
          status: body.status === undefined ? variant.status : String(body.status) === "INACTIVE" ? "INACTIVE" : "ACTIVE",
          validationStatus: "MANUAL_REVIEWED",
          updatedById: user.id
        }
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_catalog_variant", entity: "GraphicCatalogVariant", entityId: updated.id, request });
      return NextResponse.json({ item: updated });
    }

    const item = await db.graphicCatalogItem.findFirst({ where: { id: String(body.id || ""), tenantId: user.tenantId } });
    if (!item) throw new Error("CATALOG_ITEM_NOT_FOUND");
    const updated = await db.graphicCatalogItem.update({
      where: { id: item.id },
      data: {
        name: String(body.name ?? item.name).trim() || item.name,
        category: String(body.category ?? item.category).trim() || item.category,
        description: body.description === undefined ? item.description : String(body.description || "").trim() || null,
        imageUrl: body.imageUrl === undefined ? item.imageUrl : String(body.imageUrl || "").trim() || null,
        imagePosition: body.imagePosition === undefined ? item.imagePosition : String(body.imagePosition || "").trim() || "center",
        status: body.status === undefined ? item.status : String(body.status) === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        featured: body.featured === undefined ? item.featured : Boolean(body.featured),
        sortOrder: body.sortOrder === undefined ? item.sortOrder : Math.max(0, Math.round(Number(body.sortOrder || 0))),
        updatedById: user.id
      }
    });
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_catalog_item", entity: "GraphicCatalogItem", entityId: updated.id, request });
    return NextResponse.json({ item: updated });
  } catch (error) {
    const status = statusFor(error);
    const message = String((error as Error)?.message || error);
    const errors: Record<string, string> = {
      CATALOG_ITEM_NOT_FOUND: "Produto do catalogo nao encontrado.",
      CATALOG_VARIANT_NOT_FOUND: "Opcao do catalogo nao encontrada."
    };
    return NextResponse.json({ error: status === 403 ? "Somente a administracao pode alterar o catalogo." : errors[message] || "Nao foi possivel atualizar o catalogo." }, { status });
  }
}
