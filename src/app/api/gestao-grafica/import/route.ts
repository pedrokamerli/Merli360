import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission, ensureGraphicDefaults } from "@/lib/graphic";
import { parseGraphicWorkbook } from "@/lib/graphic-import";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "catalog:manage");
    await ensureGraphicDefaults(user.tenantId);

    const form = await request.formData();
    const file = form.get("file");
    const confirm = form.get("confirm") === "true";
    if (!(file instanceof File)) return NextResponse.json({ error: "Envie uma planilha XLSX ou XLS." }, { status: 400 });
    if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "Use um arquivo Excel .xlsx ou .xls." }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "A planilha deve ter ate 8 MB." }, { status: 400 });

    const preview = parseGraphicWorkbook(Buffer.from(await file.arrayBuffer()));
    if (preview.errors.length) return NextResponse.json({ ...preview, error: preview.errors[0] }, { status: 400 });
    if (!confirm) return NextResponse.json({ ...preview, items: preview.items.slice(0, 50), total: preview.items.length, fileName: file.name });

    const db = prisma as any;
    const result = await db.$transaction(async (tx: any) => {
      const counters = { productsInserted: 0, productsUpdated: 0, materialsInserted: 0, materialsUpdated: 0, processesInserted: 0, processesUpdated: 0, settingsUpdated: 0 };
      const materialsByImportKey = new Map<string, any>();
      const processesByImportKey = new Map<string, any>();

      for (const item of preview.items) {
        if (item.type === "material") {
          const existing = await tx.graphicMaterial.findFirst({ where: { tenantId: user.tenantId, name: item.name } });
          let material: any;
          if (existing) {
            material = await tx.graphicMaterial.update({ where: { id: existing.id }, data: { unit: item.unit || existing.unit, currentCostCents: item.costCents || 0, wastePercent: item.wastePercent || 0, validationStatus: "PENDING_VALIDATION", updatedById: user.id } });
            await tx.graphicMaterialCostHistory.create({ data: { tenantId: user.tenantId, materialId: existing.id, costCents: item.costCents || 0, source: `IMPORT:${file.name}:${item.sheet}:${item.rowNumber}`, status: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id } });
            counters.materialsUpdated++;
          } else {
            material = await tx.graphicMaterial.create({ data: { tenantId: user.tenantId, name: item.name, unit: item.unit || "unidade", currentCostCents: item.costCents || 0, wastePercent: item.wastePercent || 0, status: "ACTIVE", validationStatus: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id } });
            await tx.graphicMaterialCostHistory.create({ data: { tenantId: user.tenantId, materialId: material.id, costCents: item.costCents || 0, source: `IMPORT:${file.name}:${item.sheet}:${item.rowNumber}`, status: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id } });
            counters.materialsInserted++;
          }
          materialsByImportKey.set(item.key, material);
          if (item.code) materialsByImportKey.set(item.code, material);
          if (item.name) materialsByImportKey.set(item.name, material);
        }

        if (item.type === "process") {
          const existing = await tx.graphicProcess.findFirst({ where: { tenantId: user.tenantId, name: item.name } });
          let process: any;
          if (existing) {
            process = await tx.graphicProcess.update({ where: { id: existing.id }, data: { type: item.processType || existing.type, unit: item.unit || existing.unit, costCents: item.costCents || 0, validationStatus: "PENDING_VALIDATION", updatedById: user.id } });
            counters.processesUpdated++;
          } else {
            process = await tx.graphicProcess.create({ data: { tenantId: user.tenantId, name: item.name, type: item.processType || "INTERNAL", unit: item.unit || "hora", costCents: item.costCents || 0, status: "ACTIVE", validationStatus: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id } });
            counters.processesInserted++;
          }
          processesByImportKey.set(item.key, process);
          if (item.code) processesByImportKey.set(item.code, process);
          if (item.name) processesByImportKey.set(item.name, process);
        }

        if (item.type === "setting") {
          await tx.graphicSetting.upsert({
            where: { tenantId_key: { tenantId: user.tenantId, key: item.key } },
            update: { value: item.value || "", updatedById: user.id },
            create: { tenantId: user.tenantId, key: item.key, value: item.value || "", status: "ACTIVE", createdById: user.id, updatedById: user.id }
          });
          counters.settingsUpdated++;
        }
      }

      for (const item of preview.items.filter((row) => row.type === "product")) {
        const existing = await tx.graphicProduct.findFirst({ where: { tenantId: user.tenantId, name: item.name } });
        let product: any;
        const description = [item.description, item.code ? `Codigo planilha: ${item.code}` : ""].filter(Boolean).join(" | ") || null;
        if (existing) {
          product = await tx.graphicProduct.update({ where: { id: existing.id }, data: { category: item.category, unit: item.unit, description: description || existing.description, validationStatus: "PENDING_VALIDATION", updatedById: user.id } });
          counters.productsUpdated++;
        } else {
          product = await tx.graphicProduct.create({ data: { tenantId: user.tenantId, name: item.name, category: item.category || "Grafica", unit: item.unit || "unidade", description, status: "ACTIVE", validationStatus: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id } });
          counters.productsInserted++;
        }

        await tx.graphicProductComponent.deleteMany({ where: { tenantId: user.tenantId, productId: product.id } });
        await tx.graphicProductProcess.deleteMany({ where: { tenantId: user.tenantId, productId: product.id } });
        const material = item.materialCode ? materialsByImportKey.get(item.materialCode) : null;
        const process = item.processCode ? processesByImportKey.get(item.processCode) : null;
        if (material) {
          await tx.graphicProductComponent.create({ data: { tenantId: user.tenantId, productId: product.id, materialId: material.id, quantity: 1, wastePercent: item.wastePercent || material.wastePercent || 0, createdById: user.id, updatedById: user.id } });
        }
        if (process) {
          await tx.graphicProductProcess.create({ data: { tenantId: user.tenantId, productId: product.id, processId: process.id, quantity: Math.max(1, item.laborHours || 1), createdById: user.id, updatedById: user.id } });
        }
        await tx.graphicProductVersion.create({ data: { tenantId: user.tenantId, productId: product.id, snapshot: JSON.stringify(item), createdById: user.id, updatedById: user.id } }).catch(() => null);
      }

      return counters;
    });

    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_import_spreadsheet", entity: "GraphicImport", request, metadata: { file: file.name, ...result, warnings: preview.warnings } });
    return NextResponse.json({ ...result, total: preview.items.length, warnings: preview.warnings, fileName: file.name });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite importar a base da grafica." : "Nao foi possivel importar a planilha da grafica.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
