export const graphicQuoteStatuses = ["DRAFT", "SENT", "VIEWED", "APPROVED", "REFUSED", "EXPIRED", "CANCELLED"] as const;

export type GraphicQuoteStatus = typeof graphicQuoteStatuses[number];

const terminalStatuses = new Set(["APPROVED", "REFUSED", "EXPIRED", "CANCELLED"]);

export function isGraphicQuoteStatus(value: string): value is GraphicQuoteStatus {
  return graphicQuoteStatuses.includes(value as GraphicQuoteStatus);
}

export function isTerminalQuoteStatus(status: string) {
  return terminalStatuses.has(status);
}

export function validateQuoteStatusAction(current: string, next: string, reason?: string) {
  if (!isGraphicQuoteStatus(next)) return "Status de orcamento invalido.";
  if (current === "APPROVED") return "Orcamento aprovado nao pode ser alterado.";
  if (isTerminalQuoteStatus(current) && current !== next) return "Orcamento encerrado nao pode voltar de status.";
  if (["REFUSED", "CANCELLED"].includes(next) && !String(reason || "").trim()) return "Informe o motivo.";
  if (next === "APPROVED") return "Use a aprovacao do orcamento para gerar pedido.";
  return null;
}

export function nextQuoteVersion(versions: { version: number }[]) {
  return Math.max(0, ...versions.map((item) => item.version || 0)) + 1;
}

export function validateCommercialApproval(input: { status: string; approvalRequired: boolean; pendingApprovals: number }) {
  if (input.status === "APPROVED") return "Orcamento aprovado nao precisa de revisao comercial.";
  if (isTerminalQuoteStatus(input.status)) return "Orcamento encerrado nao pode receber aprovacao comercial.";
  if (!input.approvalRequired && input.pendingApprovals < 1) return "Orcamento nao possui excecao comercial pendente.";
  return null;
}

export function validateQuoteCommercialRelease(input: { approvalRequired: boolean; pendingApprovals: number }) {
  return input.approvalRequired || input.pendingApprovals > 0 ? "QUOTE_COMMERCIAL_APPROVAL_PENDING" : null;
}
