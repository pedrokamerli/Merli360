export const productionStatuses = ["PENDING", "RELEASED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export const productionStepStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"] as const;

export type ProductionStatus = typeof productionStatuses[number];
export type ProductionStepStatus = typeof productionStepStatuses[number];

const requiredChecklistKeys = ["arte", "medidas", "material", "prazo", "arquivos"];

export function isProductionStatus(value: string): value is ProductionStatus {
  return productionStatuses.includes(value as ProductionStatus);
}

export function isProductionStepStatus(value: string): value is ProductionStepStatus {
  return productionStepStatuses.includes(value as ProductionStepStatus);
}

export function parseChecklist(value: unknown): Record<string, boolean> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, boolean>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function mergeChecklist(current: unknown, patch: Record<string, unknown>) {
  const checklist = parseChecklist(current);
  for (const [key, value] of Object.entries(patch)) {
    if (requiredChecklistKeys.includes(key)) checklist[key] = value === true || value === "true" || value === "on" || value === "1";
  }
  return checklist;
}

export function missingChecklistItems(checklist: Record<string, boolean>) {
  return requiredChecklistKeys.filter((key) => !checklist[key]);
}

export function canReleaseProduction(checklist: Record<string, boolean>) {
  return missingChecklistItems(checklist).length === 0;
}

export function validateProductionStatusChange(current: string, next: string, checklist: Record<string, boolean>) {
  if (!isProductionStatus(next)) return "Status de producao invalido.";
  if (current === "COMPLETED" && next !== "COMPLETED") return "Ordem concluida nao pode voltar de status.";
  if (current === "CANCELLED" && next !== "CANCELLED") return "Ordem cancelada nao pode voltar de status.";
  if (next === "RELEASED" && !canReleaseProduction(checklist)) return `Checklist incompleto: ${missingChecklistItems(checklist).join(", ")}.`;
  if (next === "COMPLETED" && !["IN_PROGRESS", "RELEASED"].includes(current)) return "Conclua a producao somente depois de liberar ou iniciar.";
  return null;
}

export function validateRework(reason: string, impact: string, correctiveAction: string) {
  if (!reason.trim()) return "Retrabalho exige motivo.";
  if (!impact.trim()) return "Retrabalho exige impacto.";
  if (!correctiveAction.trim()) return "Retrabalho exige acao corretiva.";
  return null;
}

export function positiveNumber(value: unknown) {
  const parsed = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
