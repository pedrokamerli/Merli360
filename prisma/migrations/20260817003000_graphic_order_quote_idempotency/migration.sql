-- One quote may originate only one graphic order. Existing duplicates make this
-- migration stop before changing data, so they can be reconciled explicitly.
CREATE UNIQUE INDEX IF NOT EXISTS "GraphicOrder_tenantId_quoteId_key"
ON "GraphicOrder"("tenantId", "quoteId");
