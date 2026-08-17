export const graphicCatalogPaymentMethods = [
  "Pix",
  "Cartao de credito",
  "Cartao de debito",
  "Boleto",
  "Transferencia bancaria",
  "Dinheiro"
] as const;

export function normalizeGraphicCatalogPaymentMethod(value: unknown) {
  const method = String(value || "").trim();
  return graphicCatalogPaymentMethods.includes(method as (typeof graphicCatalogPaymentMethods)[number]) ? method : "";
}

export function graphicCatalogPaymentTerms(method: string) {
  return `Forma de pagamento preferida: ${method}. Frete, prazo e condicoes finais serao confirmados pela equipe Studium.`;
}
