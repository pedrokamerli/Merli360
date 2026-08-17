import test from "node:test";
import assert from "node:assert/strict";
import { catalogQuantityMultiplier, parseTiendanubeCatalog } from "../src/lib/graphic-catalog-import";

test("importa produto e kit do CSV da Tiendanube em milimetros", () => {
  const csv = [
    '"Identificador URL";Nome;Categorias;"Nome da variacao 1";"Valor da variacao 1";"Nome da variacao 2";"Valor da variacao 2";"Nome da variacao 3";"Valor da variacao 3";Preco;"Exibir na loja"',
    'banner-lona-ilhos;"Banner em lona com ilhos";Banners;Tamanho;40x50;Gramatura;240g;Quantidade;"Kit com 100 unidades";145.00;SIM'
  ].join("\n");
  const items = parseTiendanubeCatalog(Buffer.from(csv));
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "ACTIVE");
  assert.equal(items[0].variants[0].widthMm, 400);
  assert.equal(items[0].variants[0].heightMm, 500);
  assert.equal(items[0].variants[0].quantity, 100);
  assert.equal(items[0].variants[0].priceCents, 14500);
  assert.equal(items[0].variants[0].costCents, 10000);
});

test("usa as mesmas faixas de quantidade da planilha", () => {
  assert.equal(catalogQuantityMultiplier(20), 1.9);
  assert.equal(catalogQuantityMultiplier(21), 1.8);
  assert.equal(catalogQuantityMultiplier(100), 1.45);
  assert.equal(catalogQuantityMultiplier(1000), 1.25);
});
