export type PricingInput = {
  quantity: number;
  width?: number | null;
  height?: number | null;
  materialCostCents: number;
  processCostCents: number;
  outsourcedCostCents: number;
  laborCostCents: number;
  freightCents: number;
  installationCents: number;
  extraCostCents: number;
  discountCents: number;
  urgencyCents: number;
  negotiatedPriceCents?: number;
  wastePercent: number;
  taxRatePercent: number;
  commissionPercent: number;
  fixedCostRatePercent: number;
  minMarginPercent: number;
};

function dimensionToMeters(value?: number | null) {
  const numeric = Number(value || 0);
  if (!numeric) return 0;
  return numeric > 20 ? numeric / 1000 : numeric;
}

export function calculateGraphicPricing(input: PricingInput) {
  const quantity = Math.max(1, Number(input.quantity || 1));
  const widthMeters = dimensionToMeters(input.width);
  const heightMeters = dimensionToMeters(input.height);
  const area = widthMeters && heightMeters ? widthMeters * heightMeters : 0;
  const materialBase = input.materialCostCents * Math.max(1, area ? area * quantity : quantity);
  const wasteCents = Math.round(materialBase * (input.wastePercent / 100));
  const directCostCents = materialBase + wasteCents + input.processCostCents + input.outsourcedCostCents + input.laborCostCents + input.freightCents + input.installationCents + input.extraCostCents;
  const fixedCostCents = Math.round(directCostCents * (input.fixedCostRatePercent / 100));
  const taxCents = Math.round(directCostCents * (input.taxRatePercent / 100));
  const commissionCents = Math.round(directCostCents * (input.commissionPercent / 100));
  const totalCostCents = directCostCents + fixedCostCents + taxCents + commissionCents;
  const minimumPriceCents = Math.ceil(totalCostCents / Math.max(0.01, 1 - input.minMarginPercent / 100));
  const suggestedPriceCents = Math.max(minimumPriceCents, Math.ceil(totalCostCents * 1.6));
  const negotiatedPriceCents = Math.max(0, input.negotiatedPriceCents ?? suggestedPriceCents) + input.urgencyCents - input.discountCents;
  const grossProfitCents = negotiatedPriceCents - totalCostCents;
  const marginPercent = negotiatedPriceCents > 0 ? (grossProfitCents / negotiatedPriceCents) * 100 : 0;
  const markupPercent = totalCostCents > 0 ? (grossProfitCents / totalCostCents) * 100 : 0;
  const approvalRequired = marginPercent < input.minMarginPercent || input.discountCents > 0;
  const approvalReason = [
    marginPercent < input.minMarginPercent ? "Margem abaixo do minimo configurado." : "",
    input.discountCents > 0 ? "Orcamento possui desconto e deve ser revisado conforme limite do tenant." : ""
  ].filter(Boolean).join(" ");

  return {
    quantity,
    area,
    materialBase,
    wasteCents,
    directCostCents,
    fixedCostCents,
    taxCents,
    commissionCents,
    totalCostCents,
    minimumPriceCents,
    suggestedPriceCents,
    negotiatedPriceCents,
    grossProfitCents,
    marginPercent,
    markupPercent,
    approvalRequired,
    approvalReason
  };
}
