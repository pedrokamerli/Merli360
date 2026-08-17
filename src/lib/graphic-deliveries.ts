export const graphicDeliveryStatuses = ["PENDING", "SCHEDULED", "DELIVERED", "ACCEPTED", "COMPLAINT", "CANCELLED"] as const;

export type GraphicDeliveryStatus = typeof graphicDeliveryStatuses[number];

export function isGraphicDeliveryStatus(value: string): value is GraphicDeliveryStatus {
  return graphicDeliveryStatuses.includes(value as GraphicDeliveryStatus);
}

export function validateDeliveryStatusChange(input: { status: string; currentStatus?: string; productionStatus?: string | null; expectedAt?: string | Date | null; responsibleName?: string | null; note?: string; proofAttachmentId?: string | null }) {
  if (!isGraphicDeliveryStatus(input.status)) return "Status de entrega invalido.";
  if (["SCHEDULED", "DELIVERED"].includes(input.status) && input.productionStatus !== undefined && input.productionStatus !== "COMPLETED") return "Conclua a producao antes de liberar a expedicao.";
  if (input.status === "SCHEDULED" && input.currentStatus && !["PENDING", "SCHEDULED"].includes(input.currentStatus)) return "Esta entrega nao pode mais ser reagendada.";
  if (input.status === "SCHEDULED" && !input.expectedAt) return "Informe a data prevista da expedicao.";
  if (input.status === "SCHEDULED" && !String(input.responsibleName || "").trim()) return "Informe o responsavel pela expedicao.";
  if (input.status === "DELIVERED" && input.currentStatus && input.currentStatus !== "SCHEDULED") return "Agende a expedicao antes de marcar como entregue.";
  if (["COMPLAINT", "CANCELLED"].includes(input.status) && !String(input.note || "").trim()) return "Informe o motivo.";
  if (input.status === "ACCEPTED" && !String(input.proofAttachmentId || "").trim()) return "Registre um comprovante antes do aceite.";
  return null;
}
