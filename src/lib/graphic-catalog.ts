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

export function normalizeGraphicSetting(key: string, value: unknown) {
  const normalized = normalizeSettingValue(value);
  if (["minMarginPercent", "maxDiscountPercent", "fixedCostRatePercent", "taxRatePercent", "commissionPercent"].includes(key)) {
    validatePercent(Number(normalized || 0), key);
  }
  if (key === "fileRetentionDays") {
    const days = Number(normalized || 0);
    if (!Number.isInteger(days) || days < 30 || days > 3650) throw new Error("Retencao de arquivos deve ficar entre 30 e 3650 dias.");
    return String(days);
  }
  if (key === "postSaleDays") {
    const days = Number(normalized || 0);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("Prazo de pos-venda deve ficar entre 1 e 365 dias.");
    return String(days);
  }
  if (key === "fileLgpdClassification") {
    const classification = normalized.toUpperCase();
    if (!["PUBLIC", "INTERNAL", "CONFIDENTIAL", "SENSITIVE"].includes(classification)) throw new Error("Classificacao LGPD de arquivo invalida.");
    return classification;
  }
  if (key === "fileRemovalPolicy") {
    const policy = normalized.toUpperCase();
    if (!["SOFT_DELETE_ONLY", "ADMIN_REVIEW", "LEGAL_HOLD"].includes(policy)) throw new Error("Politica de remocao de arquivo invalida.");
    return policy;
  }
  return normalized;
}

export function validatePercent(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} deve estar entre 0 e 100.`);
  }
}

export function catalogValidationStatus(hasCost: boolean) {
  return hasCost ? "VALIDATED" : "PENDING_VALIDATION";
}
