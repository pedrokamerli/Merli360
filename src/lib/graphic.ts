import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/crm";

export const GRAPHIC_MODULE = "gestao-grafica";

export const graphicProductionSteps = [
  "Conferencia",
  "Arte",
  "Impressao",
  "Recorte",
  "Acabamento",
  "Montagem",
  "Instalacao",
  "Revisao",
  "Embalagem",
  "Liberacao"
];

export type GraphicUser = {
  id: string;
  tenantId: string;
  role: string;
  moduleAccess?: string | null;
};

export function hasGraphicAccess(user: { role: string; moduleAccess?: string | null }) {
  return hasModuleAccess(user, GRAPHIC_MODULE) || hasModuleAccess(user, "crm");
}

export function assertGraphicAccess(user: GraphicUser) {
  if (!hasGraphicAccess(user)) {
    const error = new Error("FORBIDDEN_MODULE");
    error.name = "FORBIDDEN_MODULE";
    throw error;
  }
}

export function cents(value: unknown) {
  const parsed = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function fromCents(value: number) {
  return Math.round(value || 0) / 100;
}

export function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function ensureGraphicDefaults(tenantId: string) {
  const settings = await prisma.graphicSetting.findMany({ where: { tenantId } });
  const existing = new Set(settings.map((item) => item.key));
  const defaults = [
    ["minMarginPercent", "30"],
    ["maxDiscountPercent", "10"],
    ["fixedCostRatePercent", "8"],
    ["taxRatePercent", "6"],
    ["commissionPercent", "3"],
    ["quantityMultiplierEnabled", "true"]
  ];

  await prisma.$transaction(
    defaults
      .filter(([key]) => !existing.has(key))
      .map(([key, value]) => prisma.graphicSetting.create({ data: { tenantId, key, value } }))
  );

  const productCount = await prisma.graphicProduct.count({ where: { tenantId } });
  if (!productCount) {
    await prisma.graphicProduct.createMany({
      data: [
        { tenantId, name: "Banner", category: "Comunicacao visual", unit: "m2", description: "Banner em lona com acabamento simples." },
        { tenantId, name: "Adesivo", category: "Adesivos e rotulos", unit: "m2", description: "Adesivo personalizado para comunicacao visual." },
        { tenantId, name: "Placa ACM", category: "Placas", unit: "m2", description: "Placa em ACM para fachada ou sinalizacao." },
        { tenantId, name: "Impresso comercial", category: "Impressos", unit: "unidade", description: "Cartao, panfleto, folder ou impresso personalizado." }
      ]
    });
  }

  const materialCount = await prisma.graphicMaterial.count({ where: { tenantId } });
  if (!materialCount) {
    await prisma.graphicMaterial.createMany({
      data: [
        { tenantId, name: "Lona", unit: "m2", currentCostCents: 0, wastePercent: 8 },
        { tenantId, name: "Adesivo vinil", unit: "m2", currentCostCents: 0, wastePercent: 10 },
        { tenantId, name: "ACM", unit: "m2", currentCostCents: 0, wastePercent: 5 },
        { tenantId, name: "Papel couche", unit: "unidade", currentCostCents: 0, wastePercent: 3 }
      ]
    });
  }

  const processCount = await prisma.graphicProcess.count({ where: { tenantId } });
  if (!processCount) {
    await prisma.graphicProcess.createMany({
      data: [
        { tenantId, name: "Arte", unit: "hora", costCents: 0 },
        { tenantId, name: "Impressao", unit: "m2", costCents: 0 },
        { tenantId, name: "Recorte", unit: "hora", costCents: 0 },
        { tenantId, name: "Instalacao", unit: "hora", costCents: 0 }
      ]
    });
  }
}

export async function getGraphicSettings(tenantId: string) {
  await ensureGraphicDefaults(tenantId);
  const rows = await prisma.graphicSetting.findMany({ where: { tenantId, status: "ACTIVE" } });
  const value = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    minMarginPercent: Number(value.minMarginPercent || 30),
    maxDiscountPercent: Number(value.maxDiscountPercent || 10),
    fixedCostRatePercent: Number(value.fixedCostRatePercent || 8),
    taxRatePercent: Number(value.taxRatePercent || 6),
    commissionPercent: Number(value.commissionPercent || 3),
    quantityMultiplierEnabled: value.quantityMultiplierEnabled !== "false"
  };
}

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

export function calculateGraphicPricing(input: PricingInput) {
  const quantity = Math.max(1, Number(input.quantity || 1));
  const area = input.width && input.height ? Number(input.width) * Number(input.height) : 0;
  const materialBase = input.materialCostCents * Math.max(1, area || quantity);
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
