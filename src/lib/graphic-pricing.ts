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
  spreadsheetPricing?: boolean;
  safetyPercent?: number;
  finishingCostCents?: number;
  laborHours?: number;
  fixedHourlyCostCents?: number;
  quantityMultiplierEnabled?: boolean;
  quantityMultiplierBands?: Array<{ maxQuantity: number; multiplier: number }>;
  urgent?: boolean;
  urgentMultiplier?: number;
};

export type CatalogVariantPricingInput = {
  quantity: number;
  widthMm?: number | null;
  heightMm?: number | null;
  priceCents: number;
  costCents: number;
  negotiatedPriceCents?: number;
  discountCents?: number;
  freightCents?: number;
  installationCents?: number;
  extraCostCents?: number;
  minMarginPercent: number;
  urgent?: boolean;
  urgentMultiplier?: number;
};

export function millimetersToMeters(value?: number | null) {
  const numeric = Number(value || 0);
  if (!numeric) return 0;
  return numeric / 1000;
}

export function calculateCatalogVariantPricing(input: CatalogVariantPricingInput) {
  const quantity = Math.max(1, Number(input.quantity || 1));
  const widthMeters = millimetersToMeters(input.widthMm);
  const heightMeters = millimetersToMeters(input.heightMm);
  const area = widthMeters && heightMeters ? widthMeters * heightMeters : 0;
  const urgencyMultiplier = input.urgent ? Math.max(1, Number(input.urgentMultiplier || 1.15)) : 1;
  const freightCents = Math.max(0, Number(input.freightCents || 0));
  const installationCents = Math.max(0, Number(input.installationCents || 0));
  const extraCostCents = Math.max(0, Number(input.extraCostCents || 0));
  const discountCents = Math.max(0, Number(input.discountCents || 0));
  const baseCostCents = Math.max(0, Number(input.costCents || 0));
  const basePriceCents = Math.max(0, Number(input.priceCents || 0));
  const totalCostCents = baseCostCents + freightCents + installationCents + extraCostCents;
  const suggestedPriceCents = Math.ceil(basePriceCents * urgencyMultiplier) + freightCents + installationCents + extraCostCents;
  const negotiatedPriceCents = Math.max(0, input.negotiatedPriceCents ?? suggestedPriceCents) - discountCents;
  const grossProfitCents = negotiatedPriceCents - totalCostCents;
  const marginPercent = negotiatedPriceCents > 0 ? (grossProfitCents / negotiatedPriceCents) * 100 : 0;
  const markupPercent = totalCostCents > 0 ? (grossProfitCents / totalCostCents) * 100 : 0;
  const minimumPriceCents = Math.ceil(totalCostCents / Math.max(0.01, 1 - input.minMarginPercent / 100));
  const approvalRequired = marginPercent < input.minMarginPercent || discountCents > 0;
  const approvalReason = [
    marginPercent < input.minMarginPercent ? "Margem abaixo do minimo configurado." : "",
    discountCents > 0 ? "Orcamento possui desconto e deve ser revisado conforme limite do tenant." : ""
  ].filter(Boolean).join(" ");

  return {
    source: "CATALOG" as const,
    quantity,
    area,
    materialBase: baseCostCents,
    wasteCents: 0,
    safetyCents: 0,
    finishingCents: 0,
    laborCents: 0,
    directCostCents: totalCostCents,
    fixedCostCents: 0,
    taxCents: 0,
    commissionCents: 0,
    totalCostCents,
    minimumPriceCents,
    suggestedPriceCents,
    negotiatedPriceCents,
    grossProfitCents,
    marginPercent,
    markupPercent,
    quantityMultiplier: baseCostCents > 0 ? basePriceCents / baseCostCents : 1,
    urgencyMultiplier,
    approvalRequired,
    approvalReason
  };
}

export function calculateGraphicPricing(input: PricingInput) {
  const quantity = Math.max(1, Number(input.quantity || 1));
  const widthMeters = millimetersToMeters(input.width);
  const heightMeters = millimetersToMeters(input.height);
  const area = widthMeters && heightMeters ? widthMeters * heightMeters : 0;

  if (input.spreadsheetPricing) {
    const billableMeasure = area ? area * quantity : quantity;
    const safetyPercent = Number(input.safetyPercent || 0);
    const materialAndProcessCents = Math.max(0, input.materialCostCents) + Math.max(0, input.processCostCents);
    const materialBase = Math.round(billableMeasure * materialAndProcessCents);
    const wasteCents = Math.round(materialBase * (Math.max(0, input.wastePercent || 0) / 100));
    const safetyCents = Math.round(materialBase * (Math.max(0, safetyPercent) / 100));
    const finishingCents = Math.round(Math.max(0, input.finishingCostCents || 0) * quantity);
    const laborCents = Math.round(Math.max(0, input.laborHours || 0) * Math.max(0, input.fixedHourlyCostCents || 0));
    const directCostCents = materialBase + wasteCents + safetyCents + finishingCents + laborCents + Math.max(0, input.extraCostCents) + Math.max(0, input.outsourcedCostCents) + Math.max(0, input.laborCostCents) + Math.max(0, input.freightCents) + Math.max(0, input.installationCents);
    const bands = (input.quantityMultiplierBands || []).filter((band) => Number.isFinite(band.maxQuantity) && Number.isFinite(band.multiplier)).sort((a, b) => a.maxQuantity - b.maxQuantity);
    const quantityMultiplier = input.quantityMultiplierEnabled === false ? 1 : (bands.find((band) => quantity <= band.maxQuantity)?.multiplier || bands.at(-1)?.multiplier || 1);
    const urgencyMultiplier = input.urgent ? Math.max(1, Number(input.urgentMultiplier || 1.15)) : 1;
    const suggestedPriceCents = Math.ceil(directCostCents * quantityMultiplier * urgencyMultiplier);
    const negotiatedPriceCents = Math.max(0, input.negotiatedPriceCents ?? suggestedPriceCents) - Math.max(0, input.discountCents);
    const grossProfitCents = negotiatedPriceCents - directCostCents;
    const marginPercent = negotiatedPriceCents > 0 ? (grossProfitCents / negotiatedPriceCents) * 100 : 0;
    const markupPercent = directCostCents > 0 ? (grossProfitCents / directCostCents) * 100 : 0;
    const approvalRequired = marginPercent < input.minMarginPercent || input.discountCents > 0;
    const approvalReason = [marginPercent < input.minMarginPercent ? "Margem abaixo do minimo configurado." : "", input.discountCents > 0 ? "Orcamento possui desconto e deve ser revisado conforme limite do tenant." : ""].filter(Boolean).join(" ");
    return { quantity, area, materialBase, wasteCents, safetyCents, finishingCents, laborCents, directCostCents, fixedCostCents: 0, taxCents: 0, commissionCents: 0, totalCostCents: directCostCents, minimumPriceCents: suggestedPriceCents, suggestedPriceCents, negotiatedPriceCents, grossProfitCents, marginPercent, markupPercent, quantityMultiplier, urgencyMultiplier, approvalRequired, approvalReason };
  }

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
