import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { isTemplateRow, moneyToCents, parseGraphicWorkbook } from "../src/lib/graphic-import";

function workbookBuffer(sheets: Record<string, Record<string, unknown>[]>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("normaliza valores monetarios brasileiros da planilha", () => {
  assert.equal(moneyToCents("R$ 1.234,56"), 123456);
  assert.equal(moneyToCents("42,50"), 4250);
  assert.equal(moneyToCents(""), 0);
});

test("ignora linhas modelo da planilha grafica", () => {
  assert.equal(isTemplateRow({ Codigo: "PED0001", Cliente: "Modelo" }), true);
  assert.equal(isTemplateRow({ Codigo: "CLI001", Cliente: "Modelo" }), true);
  assert.equal(isTemplateRow({ Produto: "Banner" }), false);
});

test("le abas principais da planilha grafica e marca custos como pendentes", () => {
  const buffer = workbookBuffer({
    PARAMETROS: [{ Parametro: "Margem minima", Valor: "35" }],
    MATERIAIS: [{ Material: "Lona teste", Unidade: "m2", Custo: "R$ 42,50", "Perda %": "8" }],
    PROCESSOS: [{ Processo: "Impressao teste", Tipo: "INTERNAL", Unidade: "hora", Custo: "85" }],
    PRODUTOS: [{ Produto: "Banner teste", Categoria: "Comunicacao visual", Unidade: "m2" }],
    PEDIDOS: [{ Codigo: "PED0001", Cliente: "Modelo" }]
  });

  const preview = parseGraphicWorkbook(buffer);

  assert.equal(preview.errors.length, 0);
  assert.equal(preview.summary.setting, 1);
  assert.equal(preview.summary.material, 1);
  assert.equal(preview.summary.process, 1);
  assert.equal(preview.summary.product, 1);
  assert.equal(preview.items.every((item) => item.validationStatus === "PENDING_VALIDATION"), true);
  assert.equal(preview.items.find((item) => item.type === "material")?.costCents, 4250);
  assert.match(preview.warnings.join(" "), /PEDIDOS/);
});
