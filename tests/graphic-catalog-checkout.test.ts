import assert from "node:assert/strict";
import test from "node:test";
import { catalogCheckoutLine, normalizeGraphicCatalogCheckout } from "../src/lib/graphic-catalog-checkout";
import { validateGraphicCatalogImage } from "../src/lib/graphic-catalog-images";

test("normaliza carrinho, contato e endereco do catalogo", () => {
  const result = normalizeGraphicCatalogCheckout({
    items: [{ variantId: "kit-1", quantity: 2 }, { variantId: "kit-1", quantity: 1 }],
    customer: { name: "Pedro Merli", phone: "(14) 99886-8776", postalCode: "17.000-000", address: "Rua Um", number: "25", district: "Centro", city: "Bauru", state: "sp" }
  });
  assert.equal(result.error, null);
  assert.equal(result.customer.phone, "14998868776");
  assert.equal(result.customer.postalCode, "17000000");
  assert.equal(result.customer.state, "SP");
  assert.deepEqual(result.items, [{ variantId: "kit-1", quantity: 3 }]);
});

test("bloqueia checkout sem telefone, endereco ou itens", () => {
  const result = normalizeGraphicCatalogCheckout({ customer: { name: "A", phone: "123" }, items: [] });
  assert.equal(result.error, "Informe seu nome.");
});

test("multiplica kits, unidades, preco, custo e area", () => {
  const line = catalogCheckoutLine({ quantity: 50, widthMm: 400, heightMm: 500, priceCents: 12000, costCents: 7000 }, 3);
  assert.equal(line.kits, 3);
  assert.equal(line.units, 150);
  assert.equal(line.priceCents, 36000);
  assert.equal(line.costCents, 21000);
  assert.equal(line.area, 30);
});

test("aceita somente imagens seguras para o catalogo", () => {
  assert.equal(validateGraphicCatalogImage({ type: "image/webp", size: 1024 }), null);
  assert.match(validateGraphicCatalogImage({ type: "application/pdf", size: 1024 }) || "", /JPG/);
  assert.match(validateGraphicCatalogImage({ type: "image/png", size: 11 * 1024 * 1024 }) || "", /10MB/);
});
