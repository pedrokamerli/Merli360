import test from "node:test";
import assert from "node:assert/strict";
import { inventoryMovementTypes, parseInventoryMovementType, purchaseStatuses } from "../src/lib/graphic-inventory";
import { hasGraphicWorkspaceAccess } from "../src/lib/graphic";

test("aceita somente movimentacoes de estoque suportadas", () => {
  assert.equal(parseInventoryMovementType("entry"), "ENTRY");
  assert.equal(parseInventoryMovementType("production_consumption"), "PRODUCTION_CONSUMPTION");
  assert.equal(parseInventoryMovementType("inventado"), null);
  assert.ok(inventoryMovementTypes.includes("LOSS"));
});

test("mantem estados de compra operacionais", () => {
  assert.deepEqual(purchaseStatuses, ["DRAFT", "REQUESTED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]);
});

test("separa workspaces por responsabilidade", () => {
  assert.equal(hasGraphicWorkspaceAccess("GRAPHIC_SALES", "commercial"), true);
  assert.equal(hasGraphicWorkspaceAccess("GRAPHIC_SALES", "administrative"), false);
  assert.equal(hasGraphicWorkspaceAccess("GRAPHIC_ADMIN", "administrative"), true);
  assert.equal(hasGraphicWorkspaceAccess("GRAPHIC_OPERATIONS", "operations"), true);
  assert.equal(hasGraphicWorkspaceAccess("GRAPHIC_OPERATIONS", "sales"), false);
  assert.equal(hasGraphicWorkspaceAccess("GRAPHIC_SALES", "sales"), true);
  assert.equal(hasGraphicWorkspaceAccess("GRAPHIC_ADVISOR", "management"), true);
  assert.equal(hasGraphicWorkspaceAccess("GRAPHIC_OWNER", "settings"), true);
});
