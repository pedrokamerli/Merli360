import test from "node:test";
import assert from "node:assert/strict";
import { calculateGraphicPricing } from "../src/lib/graphic-pricing";

test("calcula custo completo, margem, markup e preco minimo", () => {
  const result = calculateGraphicPricing({
    quantity: 1,
    width: 2,
    height: 1,
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
