import crypto from "node:crypto";

export const GRAPHIC_CATALOG_TOKEN_KEY = "catalogPublicToken";

const graphicCatalogTypes = new Set(["product", "material", "process", "setting", "stage"]);

export function isGraphicCatalogType(value: unknown) {
  return graphicCatalogTypes.has(String(value || "").trim().toLowerCase());
}

export function normalizeSettingValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

export function validatePercent(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error(`${label} deve estar entre 0 e 100.`);
  return parsed;
}

export function catalogValidationStatus(valid: boolean) {
  return valid ? "VALIDATED" : "PENDING_VALIDATION";
}

export function normalizeGraphicSetting(key: string, value: unknown) {
  const normalized = normalizeSettingValue(value);
  if (key === "fileRetentionDays") {
    const days = Number(normalized);
    if (!Number.isInteger(days) || days < 30 || days > 3650) throw new Error("A retencao deve ficar entre 30 e 3650 dias.");
    return String(days);
  }
  if (key === "fileLgpdClassification") {
    const classification = normalized.toUpperCase();
    if (!["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(classification)) throw new Error("Classificacao LGPD invalida.");
    return classification;
  }
  if (key === "fileRemovalPolicy") {
    const policy = normalized.toUpperCase();
    if (!["SOFT_DELETE_ONLY", "SCHEDULED_PURGE", "MANUAL_PURGE"].includes(policy)) throw new Error("Politica de remocao invalida.");
    return policy;
  }
  return normalized;
}

export function newGraphicCatalogToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function slugifyCatalogName(value: string) {
  return String(value || "produto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "produto";
}

export function catalogItemImageStyle(item: { imageUrl?: string | null; imagePosition?: string | null }) {
  if (!item.imageUrl) return {};
  const isSprite = item.imageUrl.includes("catalog-studium-products.png");
  return {
    backgroundImage: `url(${item.imageUrl})`,
    backgroundPosition: item.imagePosition || "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: isSprite ? "300% 200%" : "cover"
  };
}

export function catalogVariantSummary(variant: {
  quantity?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
}) {
  const dimensions = variant.widthMm && variant.heightMm ? `${variant.widthMm} x ${variant.heightMm} mm` : "Sem medida fixa";
  const quantity = Math.max(1, Number(variant.quantity || 1));
  return `${quantity} ${quantity === 1 ? "unidade" : "unidades"} | ${dimensions}`;
}
