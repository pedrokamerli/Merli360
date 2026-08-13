import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicAccess, cents, ensureGraphicDefaults } from "@/lib/graphic";
import { catalogValidationStatus, isGraphicCatalogType, normalizeSettingValue, validatePercent } from "@/lib/graphic-catalog";

export const dynamic = "force-dynamic";

function modelFor(db: any, type: string) {
  if (type === "product") return db.graphicProduct;
  if (type === "material") return db.graphicMaterial;
  if (type === "process") return db.graphicProcess;
  if (type === "setting") return db.graphicSetting;
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    assertGraphicAccess(user);
    await ensureGraphicDefaults(user.tenantId);
    const db = prisma as any;
    const [products, materials, processes, settings] = await Promise.all([
      db.graphicProduct.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
      db.graphicMaterial.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
      db.graphicProcess.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
      db.graphicSetting.findMany({ where: { tenantId: user.tenantId }, orderBy: { key: "asc" } })
    ]);
    return NextResponse.json({ products, materials, processes, settings });
  } catch (error: any) {
    return NextResponse.json({ error: "Nao foi possivel carregar o catalogo grafico.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status: error?.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    assertGraphicAccess(user);
    await ensureGraphicDefaults(user.tenantId);
    const body = await request.json();
    const type = String(body.type || "");
    if (!isGraphicCatalogType(type)) return NextResponse.json({ error: "Tipo de cadastro invalido." }, { status: 400 });
    const db = prisma as any;
    let item: any;

    if (type === "product") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Informe o produto." }, { status: 400 });
      item = await db.graphicProduct.create({
        data: {
          tenantId: user.tenantId,
          name,
          category: String(body.category || "Impressos"),
          unit: String(body.unit || "unidade"),
          description: String(body.description || "") || null,
          status: "ACTIVE",
          validationStatus: "PENDING_VALIDATION",
          createdById: user.id,
          updatedById: user.id
        }
      });
    }

    if (type === "material") {
      const name = String(body.name || "").trim();
      const wastePercent = Number(body.wastePercent || 0);
      validatePercent(wastePercent, "Perda prevista");
      if (!name) return NextResponse.json({ error: "Informe o material." }, { status: 400 });
      const costCents = cents(body.currentCost);
      item = await db.$transaction(async (tx: any) => {
        const material = await tx.graphicMaterial.create({
          data: {
            tenantId: user.tenantId,
            name,
            unit: String(body.unit || "m2"),
            currentCostCents: costCents,
            wastePercent,
            supplier: String(body.supplier || "") || null,
            status: "ACTIVE",
            validationStatus: catalogValidationStatus(costCents > 0),
            createdById: user.id,
            updatedById: user.id
          }
        });
        await tx.graphicMaterialCostHistory.create({
          data: {
            tenantId: user.tenantId,
            materialId: material.id,
            costCents,
            source: "MANUAL",
            status: catalogValidationStatus(costCents > 0),
            createdById: user.id,
            updatedById: user.id
          }
        });
        return material;
      });
    }

    if (type === "process") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Informe o processo." }, { status: 400 });
      const costCents = cents(body.cost);
      item = await db.graphicProcess.create({
        data: {
          tenantId: user.tenantId,
          name,
          type: String(body.processType || "INTERNAL"),
          unit: String(body.unit || "hora"),
          costCents,
          setupCostCents: cents(body.setupCost),
          status: "ACTIVE",
          validationStatus: catalogValidationStatus(costCents > 0),
          createdById: user.id,
          updatedById: user.id
        }
      });
    }

    if (type === "setting") {
      const key = String(body.key || "").trim();
      if (!key) return NextResponse.json({ error: "Informe a chave da configuracao." }, { status: 400 });
      item = await db.graphicSetting.upsert({
        where: { tenantId_key: { tenantId: user.tenantId, key } },
        update: { value: normalizeSettingValue(body.value), updatedById: user.id },
        create: { tenantId: user.tenantId, key, value: normalizeSettingValue(body.value), createdById: user.id, updatedById: user.id }
      });
    }

    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_create_catalog", entity: type, entityId: item?.id, request });
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: "Nao foi possivel salvar o cadastro grafico.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    assertGraphicAccess(user);
    const body = await request.json();
    const type = String(body.type || "");
    const id = String(body.id || "");
    if (!isGraphicCatalogType(type) || !id) return NextResponse.json({ error: "Informe o cadastro para atualizar." }, { status: 400 });
    const db = prisma as any;
    const model = modelFor(db, type);
    const existing = await model.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return NextResponse.json({ error: "Cadastro nao encontrado." }, { status: 404 });
    let item: any;

    if (type === "material") {
      const costCents = body.currentCost === undefined ? existing.currentCostCents : cents(body.currentCost);
      const wastePercent = body.wastePercent === undefined ? existing.wastePercent : Number(body.wastePercent || 0);
      validatePercent(wastePercent, "Perda prevista");
      item = await db.$transaction(async (tx: any) => {
        const material = await tx.graphicMaterial.update({
          where: { id },
          data: {
            name: body.name === undefined ? existing.name : String(body.name || existing.name),
            unit: body.unit === undefined ? existing.unit : String(body.unit || existing.unit),
            currentCostCents: costCents,
            wastePercent,
            supplier: body.supplier === undefined ? existing.supplier : String(body.supplier || "") || null,
            validationStatus: catalogValidationStatus(costCents > 0),
            status: String(body.status || existing.status),
            updatedById: user.id
          }
        });
        if (costCents !== existing.currentCostCents) {
          await tx.graphicMaterialCostHistory.create({
            data: {
              tenantId: user.tenantId,
              materialId: id,
              costCents,
              source: "MANUAL",
              status: catalogValidationStatus(costCents > 0),
              createdById: user.id,
              updatedById: user.id
            }
          });
        }
        return material;
      });
    } else if (type === "product") {
      item = await db.graphicProduct.update({
        where: { id },
        data: {
          name: body.name === undefined ? existing.name : String(body.name || existing.name),
          category: body.category === undefined ? existing.category : String(body.category || existing.category),
          unit: body.unit === undefined ? existing.unit : String(body.unit || existing.unit),
          description: body.description === undefined ? existing.description : String(body.description || "") || null,
          status: String(body.status || existing.status),
          validationStatus: String(body.validationStatus || existing.validationStatus),
          updatedById: user.id
        }
      });
    } else if (type === "process") {
      const costCents = body.cost === undefined ? existing.costCents : cents(body.cost);
      item = await db.graphicProcess.update({
        where: { id },
        data: {
          name: body.name === undefined ? existing.name : String(body.name || existing.name),
          type: body.processType === undefined ? existing.type : String(body.processType || existing.type),
          unit: body.unit === undefined ? existing.unit : String(body.unit || existing.unit),
          costCents,
          setupCostCents: body.setupCost === undefined ? existing.setupCostCents : cents(body.setupCost),
          status: String(body.status || existing.status),
          validationStatus: catalogValidationStatus(costCents > 0),
          updatedById: user.id
        }
      });
    } else {
      item = await db.graphicSetting.update({
        where: { id },
        data: { value: normalizeSettingValue(body.value), status: String(body.status || existing.status), updatedById: user.id }
      });
    }

    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_catalog", entity: type, entityId: id, request });
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: "Nao foi possivel atualizar o cadastro grafico.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status: 500 });
  }
}
