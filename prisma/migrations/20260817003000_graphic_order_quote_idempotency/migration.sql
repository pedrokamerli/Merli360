-- One quote may originate only one graphic order. Existing duplicates make this
-- migration stop before changing data, so they can be reconciled explicitly.
DROP INDEX IF EXISTS "GraphicOrder_tenantId_quoteId_key";

ALTER TABLE "GraphicOrder"
ADD CONSTRAINT "GraphicOrder_tenantId_quoteId_key"
UNIQUE ("tenantId", "quoteId");
