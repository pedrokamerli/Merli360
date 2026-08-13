import test from "node:test";
import assert from "node:assert/strict";
import { catalogValidationStatus, isGraphicCatalogType, normalizeSettingValue, validatePercent } from "../src/lib/graphic-catalog";

test("valida tipos nativos do catalogo grafico", () => {
  assert.equal(isGraphicCatalogType("product"), true);
  assert.equal(isGraphicCatalogType("material"), true);
  assert.equal(isGraphicCatalogType("process"), true);
  assert.equal(isGraphicCatalogType("setting"), true);
  assert.equal(isGraphicCatalogType("stage"), true);
  assert.equal(isGraphicCatalogType("financeiro"), false);
});

test("normaliza parametros de configuracao", () => {
  assert.equal(normalizeSettingValue(true), "true");
  assert.equal(normalizeSettingValue(false), "false");
  assert.equal(normalizeSettingValue(null), "");
  assert.equal(normalizeSettingValue(" 30 "), "30");
});

test("bloqueia percentual fora da faixa operacional", () => {
  assert.doesNotThrow(() => validatePercent(0, "Perda prevista"));
  assert.doesNotThrow(() => validatePercent(100, "Perda prevista"));
  assert.throws(() => validatePercent(-1, "Perda prevista"), /entre 0 e 100/);
  assert.throws(() => validatePercent(101, "Perda prevista"), /entre 0 e 100/);
});

test("marca custos zerados como pendentes de validacao", () => {
  assert.equal(catalogValidationStatus(true), "VALIDATED");
  assert.equal(catalogValidationStatus(false), "PENDING_VALIDATION");
});
