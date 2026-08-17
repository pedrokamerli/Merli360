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

test("importa a hora fixa, faixas de quantidade e regras tecnicas do produto", () => {
  const buffer = workbookBuffer({
    PARAMETROS: [{ Parametro: "Aluguel", Valor: "950" }, { Parametro: "Energia", Valor: "1000" }, { Parametro: "Administrativo", Valor: "3500" }, { Parametro: "Outros", Valor: "2500" }, { Parametro: "Funcionários", Valor: "9000" }, { Parametro: "Dias úteis/mês", Valor: "22" }, { Parametro: "Horas/dia", Valor: "8" }],
    FAIXAS_QTD: [{ "Até quantidade": "20", Multiplicador: "1,90", Uso: "PADRÃO" }, { "Até quantidade": "999999", Multiplicador: "1,25", Uso: "PADRÃO" }],
    PRODUTOS: [{ Produto: "Banner 280", "Venda por": "m2", "Perda %": "10%", "Acabamento R$/un": "0,50", "Margem segurança %": "5%", "Horas mão de obra": "0", "Tipo cálculo": "M2" }]
  });
  const preview = parseGraphicWorkbook(buffer);
  const product = preview.items.find((item) => item.type === "product");
  const bands = preview.items.find((item) => item.key === "quantityMultiplierBands");

  assert.equal(preview.items.find((item) => item.key === "fixedHourlyCostCents")?.value, "9631");
  assert.deepEqual(JSON.parse(bands?.value || "[]"), [{ maxQuantity: 20, multiplier: 1.9 }, { maxQuantity: 999999, multiplier: 1.25 }]);
  assert.equal(product?.finishingCostCents, 50);
  assert.equal(product?.safetyPercent, 5);
  assert.equal(product?.calculationType, "M2");
});
