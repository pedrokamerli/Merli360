export function validateSatisfaction(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return "Satisfacao deve ser de 1 a 5.";
  return null;
}

export function shouldCreatePostSaleOpportunity(input: { satisfaction?: number | null; createOpportunity?: boolean; complaint?: string | null }) {
  return Boolean(input.createOpportunity || String(input.complaint || "").trim() || (input.satisfaction !== null && input.satisfaction !== undefined && input.satisfaction <= 3));
}

export function buildPostSaleOpportunityTitle(input: { orderNumber?: number | string | null; complaint?: string | null }) {
  if (String(input.complaint || "").trim()) return `Resolver pos-venda do pedido #${input.orderNumber || "-"}`;
  return `Nova oportunidade pos-venda pedido #${input.orderNumber || "-"}`;
}

export function shouldCreatePostSaleTask(input: { nextAction?: string | null; nextFollowUp?: string | Date | null }) {
  return Boolean(String(input.nextAction || "").trim() && input.nextFollowUp);
}
