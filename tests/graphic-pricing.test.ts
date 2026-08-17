import test from "node:test";
import assert from "node:assert/strict";
import { calculateCatalogVariantPricing, calculateGraphicPricing } from "../src/lib/graphic-pricing";

test("calcula custo completo, margem, markup e preco minimo", () => {
  const result = calculateGraphicPricing({
    quantity: 1,
    width: 2000,
    height: 1000,
    materialCostCents: 42000,
    processCostCents: 18000,
    outsourcedCostCents: 0,
    laborCostCents: 25000,
    freightCents: 6000,
    installationCents: 22000,
    extraCostCents: 0,
    discountCents: 0,
    urgencyCents: 0,
    negotiatedPriceCents: 220000,
    wastePercent: 8,
    fixedCostRatePercent: 8,
    taxRatePercent: 6,
    commissionPercent: 3,
    minMarginPercent: 30
  });

  assert.equal(result.area, 2);
  assert.equal(result.materialBase, 84000);
  assert.equal(result.wasteCents, 6720);
  assert.equal(result.totalCostCents, 189213);
  assert.equal(result.minimumPriceCents, 270305);
  assert.equal(result.negotiatedPriceCents, 220000);
  assert.equal(result.approvalRequired, true);
  assert.match(result.approvalReason, /Margem abaixo/);
  assert.ok(result.marginPercent > 13.9 && result.marginPercent < 14.1);
  assert.ok(result.markupPercent > 16.2 && result.markupPercent < 16.4);
});

test("usa milimetros sem heuristica ambigua", () => {
  const common = {
    quantity: 1,
    materialCostCents: 100,
    processCostCents: 0,
    outsourcedCostCents: 0,
    laborCostCents: 0,
    freightCents: 0,
    installationCents: 0,
    extraCostCents: 0,
    discountCents: 0,
    urgencyCents: 0,
    wastePercent: 0,
    fixedCostRatePercent: 0,
    taxRatePercent: 0,
    commissionPercent: 0,
    minMarginPercent: 0
  };
  assert.equal(calculateGraphicPricing({ ...common, width: 1000, height: 1000 }).area, 1);
  assert.equal(calculateGraphicPricing({ ...common, width: 10, height: 10 }).area, 0.0001);
});

test("mantem o preco exato de um kit do catalogo", () => {
  const result = calculateCatalogVariantPricing({
    quantity: 50,
    widthMm: 400,
    heightMm: 500,
    priceCents: 852,
    costCents: 474,
    minMarginPercent: 20
  });
  assert.equal(result.suggestedPriceCents, 852);
  assert.equal(result.negotiatedPriceCents, 852);
  assert.equal(result.area, 0.2);
  assert.equal(result.quantity, 50);
});

test("marca desconto como aprovacao obrigatoria mesmo com margem saudavel", () => {
  const result = calculateGraphicPricing({
    quantity: 10,
    materialCostCents: 1000,
    processCostCents: 2000,
    outsourcedCostCents: 0,
    laborCostCents: 3000,
    freightCents: 0,
    installationCents: 0,
    extraCostCents: 0,
    discountCents: 5000,
    urgencyCents: 0,
    negotiatedPriceCents: 50000,
    wastePercent: 5,
    fixedCostRatePercent: 5,
    taxRatePercent: 5,
    commissionPercent: 2,
    minMarginPercent: 20
  });

  assert.equal(result.approvalRequired, true);
  assert.match(result.approvalReason, /desconto/);
  assert.ok(result.grossProfitCents > 0);
});

test("replica a regra de m2, perdas, seguranca, acabamento, hora e faixa da planilha", () => {
  const result = calculateGraphicPricing({
    quantity: 10,
    width: 1000,
    height: 500,
    materialCostCents: 850,
    processCostCents: 850,
    outsourcedCostCents: 0,
    laborCostCents: 0,
    freightCents: 0,
    installationCents: 0,
    extraCostCents: 0,
    discountCents: 0,
    urgencyCents: 0,
    wastePercent: 10,
    safetyPercent: 5,
    finishingCostCents: 50,
    laborHours: 0,
    fixedHourlyCostCents: 9631,
    quantityMultiplierEnabled: true,
    quantityMultiplierBands: [{ maxQuantity: 20, multiplier: 1.9 }, { maxQuantity: 999999, multiplier: 1.25 }],
    spreadsheetPricing: true,
    taxRatePercent: 0,
    commissionPercent: 0,
    fixedCostRatePercent: 0,
    minMarginPercent: 30
  });

  assert.equal(result.area, 0.5);
  assert.equal(result.materialBase, 8500);
  assert.equal(result.wasteCents, 850);
  assert.equal(result.safetyCents, 425);
  assert.equal(result.finishingCents, 500);
  assert.equal(result.totalCostCents, 10275);
  assert.equal(result.quantityMultiplier, 1.9);
  assert.equal(result.suggestedPriceCents, 19523);
});
