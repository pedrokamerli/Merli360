import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseGraphicWorkbook } from "../src/lib/graphic-import";

const prisma = new PrismaClient();

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Informe o caminho da planilha.");
  const fullPath = path.resolve(filePath);
  const preview = parseGraphicWorkbook(fs.readFileSync(fullPath));
  if (preview.errors.length) throw new Error(preview.errors[0]);

  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) throw new Error("Nenhum tenant encontrado.");
  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
  const userId = user?.id || null;
  const db = prisma as any;

  const result = await db.$transaction(async (tx: any) => {
    const counters = { productsInserted: 0, productsUpdated: 0, materialsInserted: 0, materialsUpdated: 0, processesInserted: 0, processesUpdated: 0, settingsUpdated: 0 };
    const materialsByImportKey = new Map<string, any>();
    const processesByImportKey = new Map<string, any>();

    for (const item of preview.items) {
      if (item.type === "material") {
        const existing = await tx.graphicMaterial.findFirst({ where: { tenantId: tenant.id, name: item.name } });
        const material = existing
          ? await tx.graphicMaterial.update({ where: { id: existing.id }, data: { unit: item.unit || existing.unit, currentCostCents: item.costCents || 0, wastePercent: item.wastePercent || 0, validationStatus: "PENDING_VALIDATION", updatedById: userId } })
          : await tx.graphicMaterial.create({ data: { tenantId: tenant.id, name: item.name, unit: item.unit || "unidade", currentCostCents: item.costCents || 0, wastePercent: item.wastePercent || 0, status: "ACTIVE", validationStatus: "PENDING_VALIDATION", createdById: userId, updatedById: userId } });
        await tx.graphicMaterialCostHistory.create({ data: { tenantId: tenant.id, materialId: material.id, costCents: item.costCents || 0, source: `IMPORT:${path.basename(fullPath)}:${item.sheet}:${item.rowNumber}`, status: "PENDING_VALIDATION", createdById: userId, updatedById: userId } });
        existing ? counters.materialsUpdated++ : counters.materialsInserted++;
        materialsByImportKey.set(item.key, material);
        if (item.code) materialsByImportKey.set(item.code, material);
        if (item.name) materialsByImportKey.set(item.name, material);
      }

      if (item.type === "process") {
        const existing = await tx.graphicProcess.findFirst({ where: { tenantId: tenant.id, name: item.name } });
        const process = existing
          ? await tx.graphicProcess.update({ where: { id: existing.id }, data: { type: item.processType || existing.type, unit: item.unit || existing.unit, costCents: item.costCents || 0, validationStatus: "PENDING_VALIDATION", updatedById: userId } })
          : await tx.graphicProcess.create({ data: { tenantId: tenant.id, name: item.name, type: item.processType || "INTERNAL", unit: item.unit || "hora", costCents: item.costCents || 0, status: "ACTIVE", validationStatus: "PENDING_VALIDATION", createdById: userId, updatedById: userId } });
        existing ? counters.processesUpdated++ : counters.processesInserted++;
        processesByImportKey.set(item.key, process);
        if (item.code) processesByImportKey.set(item.code, process);
        if (item.name) processesByImportKey.set(item.name, process);
      }

      if (item.type === "setting") {
        await tx.graphicSetting.upsert({
          where: { tenantId_key: { tenantId: tenant.id, key: item.key } },
          update: { value: item.value || "", updatedById: userId },
          create: { tenantId: tenant.id, key: item.key, value: item.value || "", status: "ACTIVE", createdById: userId, updatedById: userId }
        });
        counters.settingsUpdated++;
      }
    }

    for (const item of preview.items.filter((row) => row.type === "product")) {
      const existing = await tx.graphicProduct.findFirst({ where: { tenantId: tenant.id, name: item.name } });
      const description = [item.description, item.code ? `Codigo planilha: ${item.code}` : ""].filter(Boolean).join(" | ") || null;
      const product = existing
        ? await tx.graphicProduct.update({ where: { id: existing.id }, data: { category: item.category, unit: item.unit, description: description || existing.description, validationStatus: "PENDING_VALIDATION", updatedById: userId } })
        : await tx.graphicProduct.create({ data: { tenantId: tenant.id, name: item.name, category: item.category || "Grafica", unit: item.unit || "unidade", description, status: "ACTIVE", validationStatus: "PENDING_VALIDATION", createdById: userId, updatedById: userId } });
      existing ? counters.productsUpdated++ : counters.productsInserted++;
      await tx.graphicProductComponent.deleteMany({ where: { tenantId: tenant.id, productId: product.id } });
      await tx.graphicProductProcess.deleteMany({ where: { tenantId: tenant.id, productId: product.id } });
      const material = item.materialCode ? materialsByImportKey.get(item.materialCode) : null;
      const process = item.processCode ? processesByImportKey.get(item.processCode) : null;
      if (material) await tx.graphicProductComponent.create({ data: { tenantId: tenant.id, productId: product.id, materialId: material.id, quantity: 1, wastePercent: item.wastePercent || material.wastePercent || 0, createdById: userId, updatedById: userId } });
      if (process) await tx.graphicProductProcess.create({ data: { tenantId: tenant.id, productId: product.id, processId: process.id, quantity: Math.max(1, item.laborHours || 1), createdById: userId, updatedById: userId } });
      await tx.graphicProductVersion.create({ data: { tenantId: tenant.id, productId: product.id, snapshot: JSON.stringify(item), createdById: userId, updatedById: userId } }).catch(() => null);
    }

    return counters;
  });

  console.log(JSON.stringify({ tenant: tenant.name, summary: preview.summary, warnings: preview.warnings, result }, null, 2));
}

main().finally(() => prisma.$disconnect());
