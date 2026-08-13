import path from "path";

export const graphicAttachmentModels = ["quote", "order", "production", "delivery", "post-sale", "opportunity"] as const;
export const graphicAttachmentPurposes = ["ARTWORK", "LOGO", "PROOF", "PHOTO", "DELIVERY_PROOF", "DOCUMENT", "OTHER"] as const;

export type GraphicAttachmentModel = typeof graphicAttachmentModels[number];
export type GraphicAttachmentPurpose = typeof graphicAttachmentPurposes[number];

const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"]
]);

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
export const graphicAttachmentMaxSizeBytes = 10 * 1024 * 1024;

export function isGraphicAttachmentModel(value: string): value is GraphicAttachmentModel {
  return graphicAttachmentModels.includes(value as GraphicAttachmentModel);
}

export function normalizeGraphicPurpose(value: unknown): GraphicAttachmentPurpose {
  const purpose = String(value || "OTHER").trim().toUpperCase();
  return graphicAttachmentPurposes.includes(purpose as GraphicAttachmentPurpose) ? purpose as GraphicAttachmentPurpose : "OTHER";
}

export function safeGraphicAttachmentExt(filename: string, mimeType: string) {
  const ext = path.extname(filename).toLowerCase();
  if (allowedExtensions.has(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  return allowedTypes.get(mimeType) || "";
}

export function validateGraphicAttachment(file: { name: string; type: string; size: number }) {
  if (!allowedTypes.has(file.type)) return "Envie PDF ou imagem JPG/PNG/WebP.";
  if (!safeGraphicAttachmentExt(file.name, file.type)) return "Extensao de arquivo nao permitida.";
  if (file.size <= 0) return "Arquivo vazio.";
  if (file.size > graphicAttachmentMaxSizeBytes) return "Arquivo acima de 10MB.";
  return null;
}
