import path from "path";

export const graphicAttachmentModels = ["quote", "order", "production", "delivery", "post-sale", "opportunity"] as const;
export const graphicAttachmentPurposes = [
  "ARTWORK",
  "CUSTOMER_ARTWORK",
  "FINAL_ARTWORK",
  "LOGO",
  "PROOF",
  "PHOTO",
  "DELIVERY_PROOF",
  "DOCUMENT",
  "OTHER"
] as const;

export type GraphicAttachmentModel = typeof graphicAttachmentModels[number];
export type GraphicAttachmentPurpose = typeof graphicAttachmentPurposes[number];

const extensionMimeTypes = new Map<string, string>([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".svg", "image/svg+xml"],
  [".pdf", "application/pdf"],
  [".ai", "application/postscript"],
  [".eps", "application/postscript"],
  [".psd", "image/vnd.adobe.photoshop"],
  [".cdr", "application/octet-stream"],
  [".indd", "application/octet-stream"],
  [".dxf", "image/vnd.dxf"],
  [".dwg", "image/vnd.dwg"],
  [".zip", "application/zip"],
  [".rar", "application/vnd.rar"],
  [".7z", "application/x-7z-compressed"],
  [".txt", "text/plain"],
  [".csv", "text/csv"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]
]);

const safeMimeFallbackExtensions = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/bmp", ".bmp"],
  ["image/tiff", ".tif"],
  ["application/pdf", ".pdf"]
]);

const canonicalExtensions: Record<string, string> = { ".jpeg": ".jpg", ".tiff": ".tif" };
const inlineMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff", "application/pdf"]);

export const graphicAttachmentMaxSizeBytes = 100 * 1024 * 1024;

export function isGraphicAttachmentModel(value: string): value is GraphicAttachmentModel {
  return graphicAttachmentModels.includes(value as GraphicAttachmentModel);
}

export function normalizeGraphicPurpose(value: unknown): GraphicAttachmentPurpose {
  const purpose = String(value || "OTHER").trim().toUpperCase();
  return graphicAttachmentPurposes.includes(purpose as GraphicAttachmentPurpose) ? purpose as GraphicAttachmentPurpose : "OTHER";
}

export function safeGraphicAttachmentExt(filename: string, mimeType: string) {
  const ext = path.extname(filename).toLowerCase();
  if (extensionMimeTypes.has(ext)) return canonicalExtensions[ext] || ext;
  return safeMimeFallbackExtensions.get(String(mimeType || "").toLowerCase()) || "";
}

export function graphicAttachmentContentType(filename: string, mimeType: string) {
  const ext = path.extname(filename).toLowerCase();
  const normalizedMime = String(mimeType || "").toLowerCase();
  return extensionMimeTypes.get(ext) || (safeMimeFallbackExtensions.has(normalizedMime) ? normalizedMime : "application/octet-stream");
}

export function canDisplayGraphicAttachmentInline(filename: string, mimeType: string) {
  return inlineMimeTypes.has(graphicAttachmentContentType(filename, mimeType));
}

export function graphicAttachmentDirectory(tenantId: string) {
  return path.resolve(process.cwd(), "data", "uploads", tenantId, "grafica");
}

export function isGraphicAttachmentPath(storagePath: string, tenantId: string) {
  const directory = graphicAttachmentDirectory(tenantId);
  return path.resolve(storagePath).startsWith(`${directory}${path.sep}`);
}

export function validateGraphicAttachment(file: { name: string; type: string; size: number }) {
  if (!safeGraphicAttachmentExt(file.name, file.type)) {
    return "Formato nao permitido. Envie imagem, PDF, CDR, AI, PSD, EPS, SVG, TIFF, documento ou pacote ZIP/RAR/7Z.";
  }
  if (file.size <= 0) return "Arquivo vazio.";
  if (file.size > graphicAttachmentMaxSizeBytes) return "Arquivo acima de 100MB.";
  return null;
}

export function isActiveGraphicAttachment(status: unknown) {
  return String(status || "ACTIVE").toUpperCase() === "ACTIVE";
}
