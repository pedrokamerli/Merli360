export const graphicOpportunityStatuses = ["OPEN", "QUOTE_CREATED", "WON", "LOST", "ARCHIVED"] as const;

export type GraphicOpportunityStatus = typeof graphicOpportunityStatuses[number];

const closedStatuses = new Set(["WON", "LOST", "ARCHIVED"]);

export function isGraphicOpportunityStatus(value: string): value is GraphicOpportunityStatus {
  return graphicOpportunityStatuses.includes(value as GraphicOpportunityStatus);
}

export function defaultGraphicPipelineStages() {
  return [
    { name: "OPEN", position: 0, kind: "ACTIVE" },
    { name: "QUOTE_CREATED", position: 1, kind: "ACTIVE" },
    { name: "WON", position: 2, kind: "WON" },
    { name: "LOST", position: 3, kind: "LOST" },
    { name: "ARCHIVED", position: 4, kind: "ARCHIVED" }
  ];
}

export function isClosedGraphicOpportunity(status: string) {
  return closedStatuses.has(status);
}

export function validateOpportunityUpdate(input: { currentStatus: string; nextStatus?: string; lossReason?: string; nextAction?: string | null; nextFollowUp?: string | Date | null; allowedStatuses?: string[] }) {
  const nextStatus = input.nextStatus || input.currentStatus;
  const allowedStatuses = input.allowedStatuses?.length ? input.allowedStatuses : [...graphicOpportunityStatuses];
  if (!allowedStatuses.includes(nextStatus)) return "Status de oportunidade invalido.";
  if (input.currentStatus === "LOST" && nextStatus !== "LOST") return "Oportunidade perdida deve ser reaberta por uma nova oportunidade.";
  if (nextStatus === "LOST" && !String(input.lossReason || "").trim()) return "Informe o motivo da perda.";
  if (!isClosedGraphicOpportunity(nextStatus) && !String(input.nextAction || "").trim() && !input.nextFollowUp) return "Informe o proximo passo ou a data de retorno.";
  return null;
}

export function shouldCreateFollowUpTask(input: { nextAction?: string | null; nextFollowUp?: string | Date | null }) {
  return Boolean(String(input.nextAction || "").trim() && input.nextFollowUp);
}

export function opportunityQualityAlert(input: { status: string; nextAction?: string | null; nextFollowUp?: string | Date | null }) {
  if (isClosedGraphicOpportunity(input.status)) return null;
  return !String(input.nextAction || "").trim() || !input.nextFollowUp ? "Oportunidade aberta sem proximo passo completo." : null;
}
