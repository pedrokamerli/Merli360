export const graphicDeliveryStatuses = ["PENDING", "SCHEDULED", "DELIVERED", "ACCEPTED", "COMPLAINT", "CANCELLED"] as const;

export type GraphicDeliveryStatus = typeof graphicDeliveryStatuses[number];

export function isGraphicDeliveryStatus(value: string): value is GraphicDeliveryStatus {
  return graphicDeliveryStatuses.includes(value as GraphicDeliveryStatus);
}

export function validateDeliveryStatusChange(input: { status: string; note?: string; proofAttachmentId?: string | null }) {
  if (!isGraphicDeliveryStatus(input.status)) return "Status de entrega invalido.";
  if (["COMPLAINT", "CANCELLED"].includes(input.status) && !String(input.note || "").trim()) return "Informe o motivo.";
  if (input.status === "ACCEPTED" && !String(input.proofAttachmentId || "").trim()) return "Registre um comprovante antes do aceite.";
  return null;
}
