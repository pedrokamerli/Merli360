import path from "path";

export const graphicCatalogImageMaxSizeBytes = 10 * 1024 * 1024;

const allowedImageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

export function validateGraphicCatalogImage(file: { type: string; size: number }) {
  if (!allowedImageTypes.has(file.type)) return "Envie uma imagem JPG, PNG ou WebP.";
  if (file.size <= 0) return "O arquivo selecionado esta vazio.";
  if (file.size > graphicCatalogImageMaxSizeBytes) return "A imagem deve ter no maximo 10MB.";
  return null;
}

export function graphicCatalogImageExtension(mimeType: string) {
  return allowedImageTypes.get(mimeType) || "";
}

export function graphicCatalogImageDirectory(tenantId: string) {
  return path.resolve(process.cwd(), "data", "uploads", tenantId, "grafica", "catalogo");
}

export function isGraphicCatalogImagePath(storagePath: string, tenantId: string) {
  const directory = graphicCatalogImageDirectory(tenantId);
  const resolved = path.resolve(storagePath);
  return resolved.startsWith(`${directory}${path.sep}`);
}
