export const graphicCatalogTypes = ["product", "material", "process", "setting", "stage"] as const;

export type GraphicCatalogType = typeof graphicCatalogTypes[number];

export function isGraphicCatalogType(value: string): value is GraphicCatalogType {
  return graphicCatalogTypes.includes(value as GraphicCatalogType);
}

export function normalizeSettingValue(value: unknown) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function validatePercent(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} deve estar entre 0 e 100.`);
  }
}

export function catalogValidationStatus(hasCost: boolean) {
  return hasCost ? "VALIDATED" : "PENDING_VALIDATION";
}
