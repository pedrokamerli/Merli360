import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const normalize = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const moneyToCents = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const parsed = Number(raw.replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "") || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};
const numberValue = (value) => {
  const parsed = Number(String(value ?? "").replace("%", "").replace(",", ".").replace(/[^\d.-]/g, "") || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const percentValue = (value) => {
  const parsed = numberValue(value);
  return parsed > 0 && parsed <= 1 && String(value ?? "").includes("%") ? parsed * 100 : parsed;
};
const get = (row, names) => {
  const wanted = names.map(normalize);
  const key = Object.keys(row).find((item) => wanted.includes(normalize(item)));
  return key ? String(row[key] ?? "").trim() : "";
};
const rowsFromSheet = (workbook, sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const known = new Set(["parametro", "valor", "material", "produto", "processo", "unidade", "custo", "custo unitario", "codigo", "cliente"]);
  const headerIndex = matrix.findIndex((row) => row.map((value) => normalize(value)).filter((label) => known.has(label)).length >= 2);
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex].map((value, index) => String(value || `COL${index + 1}`).trim());
  return matrix.slice(headerIndex + 1).flatMap((values, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    return Object.values(row).some((value) => String(value ?? "").trim()) ? [{ ...row, __rowNumber: headerIndex + index + 2 }] : [];
  });
};
const parseWorkbook = (filePath) => {
  const workbook = XLSX.readFile(filePath);
  const items = [];
  for (const sheet of workbook.SheetNames) {
    const sheetKey = normalize(sheet).replace(/[^a-z0-9]/g, "");
    const rows = rowsFromSheet(workbook, sheet);
    if (sheetKey.includes("material") || sheetKey.includes("materiai")) for (const row of rows) {
      const name = get(row, ["material", "nome", "descricao", "insumo"]);
      if (!name) continue;
      const code = get(row, ["codigo", "cod"]);
      items.push({ type: "material", key: code || name, code, name, unit: get(row, ["unidade", "un"]) || "unidade", costCents: moneyToCents(get(row, ["custo unitario", "custo", "valor", "preco"])), wastePercent: percentValue(get(row, ["perda %", "perda"])), sheet, rowNumber: row.__rowNumber });
    }
    if (sheetKey.includes("process")) for (const row of rows) {
      const name = get(row, ["processo", "nome", "descricao", "servico"]);
      if (!name) continue;
      const code = get(row, ["codigo", "cod"]);
      items.push({ type: "process", key: code || name, code, name, processType: get(row, ["tipo", "origem"]) || "INTERNAL", unit: get(row, ["unidade", "un"]) || "hora", costCents: moneyToCents(get(row, ["custo unitario", "custo", "valor", "preco"])), sheet, rowNumber: row.__rowNumber });
    }
    if (sheetKey.includes("produto")) for (const row of rows) {
      const name = get(row, ["produto", "nome", "descricao"]);
      if (!name) continue;
      const code = get(row, ["codigo", "cod"]);
      items.push({ type: "product", key: code || name, code, name, category: get(row, ["tipo calculo", "categoria", "grupo", "tipo"]) || "Grafica", unit: get(row, ["venda por", "unidade", "un"]) || "unidade", description: get(row, ["observacao", "descricao"]), materialCode: get(row, ["material principal", "material"]), processCode: get(row, ["processo principal", "processo"]), wastePercent: percentValue(get(row, ["perda %", "perda"])), extraCostCents: moneyToCents(get(row, ["custo extra fixo", "extra"])), laborHours: numberValue(get(row, ["horas mao de obra", "mao de obra"])), sheet, rowNumber: row.__rowNumber });
    }
  }
  return items;
};

const filePath = path.resolve(process.argv[2] || "");
if (!filePath || !fs.existsSync(filePath)) throw new Error("Planilha nao encontrada.");
const items = parseWorkbook(filePath);
const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
if (!tenant) throw new Error("Nenhum tenant encontrado.");
const user = await prisma.user.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
const userId = user?.id || null;
const db = prisma;

const result = await db.$transaction(async (tx) => {
  const counters = { productsInserted: 0, productsUpdated: 0, materialsInserted: 0, materialsUpdated: 0, processesInserted: 0, processesUpdated: 0 };
  const materialMap = new Map();
  const processMap = new Map();
  for (const item of items) {
    if (item.type === "material") {
      const existing = await tx.graphicMaterial.findFirst({ where: { tenantId: tenant.id, name: item.name } });
      const material = existing ? await tx.graphicMaterial.update({ where: { id: existing.id }, data: { unit: item.unit, currentCostCents: item.costCents, wastePercent: item.wastePercent, updatedById: userId } }) : await tx.graphicMaterial.create({ data: { tenantId: tenant.id, name: item.name, unit: item.unit, currentCostCents: item.costCents, wastePercent: item.wastePercent, createdById: userId, updatedById: userId } });
      await tx.graphicMaterialCostHistory.create({ data: { tenantId: tenant.id, materialId: material.id, costCents: item.costCents, source: `IMPORT:${path.basename(filePath)}:${item.sheet}:${item.rowNumber}`, createdById: userId, updatedById: userId } });
      existing ? counters.materialsUpdated++ : counters.materialsInserted++;
      materialMap.set(item.key, material); if (item.code) materialMap.set(item.code, material); materialMap.set(item.name, material);
    }
    if (item.type === "process") {
      const existing = await tx.graphicProcess.findFirst({ where: { tenantId: tenant.id, name: item.name } });
      const process = existing ? await tx.graphicProcess.update({ where: { id: existing.id }, data: { type: item.processType, unit: item.unit, costCents: item.costCents, updatedById: userId } }) : await tx.graphicProcess.create({ data: { tenantId: tenant.id, name: item.name, type: item.processType, unit: item.unit, costCents: item.costCents, createdById: userId, updatedById: userId } });
      existing ? counters.processesUpdated++ : counters.processesInserted++;
      processMap.set(item.key, process); if (item.code) processMap.set(item.code, process); processMap.set(item.name, process);
    }
  }
  for (const item of items.filter((row) => row.type === "product")) {
    const existing = await tx.graphicProduct.findFirst({ where: { tenantId: tenant.id, name: item.name } });
    const description = [item.description, item.code ? `Codigo planilha: ${item.code}` : ""].filter(Boolean).join(" | ") || null;
    const product = existing ? await tx.graphicProduct.update({ where: { id: existing.id }, data: { category: item.category, unit: item.unit, description: description || existing.description, updatedById: userId } }) : await tx.graphicProduct.create({ data: { tenantId: tenant.id, name: item.name, category: item.category, unit: item.unit, description, createdById: userId, updatedById: userId } });
    existing ? counters.productsUpdated++ : counters.productsInserted++;
    await tx.graphicProductComponent.deleteMany({ where: { tenantId: tenant.id, productId: product.id } });
    await tx.graphicProductProcess.deleteMany({ where: { tenantId: tenant.id, productId: product.id } });
    const material = materialMap.get(item.materialCode);
    const process = processMap.get(item.processCode);
    if (material) await tx.graphicProductComponent.create({ data: { tenantId: tenant.id, productId: product.id, materialId: material.id, quantity: 1, wastePercent: item.wastePercent || material.wastePercent || 0, createdById: userId, updatedById: userId } });
    if (process) await tx.graphicProductProcess.create({ data: { tenantId: tenant.id, productId: product.id, processId: process.id, quantity: Math.max(1, item.laborHours || 1), createdById: userId, updatedById: userId } });
    await tx.graphicProductVersion.create({ data: { tenantId: tenant.id, productId: product.id, snapshot: JSON.stringify(item), createdById: userId, updatedById: userId } }).catch(() => null);
  }
  return counters;
});

console.log(JSON.stringify({ tenant: tenant.name, imported: items.length, result }, null, 2));
await prisma.$disconnect();
