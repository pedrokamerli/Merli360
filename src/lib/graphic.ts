import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/crm";
import { calculateGraphicPricing } from "@/lib/graphic-pricing";
import { defaultGraphicPipelineStages } from "@/lib/graphic-opportunities";

export { calculateGraphicPricing };

export const GRAPHIC_MODULE = "gestao-grafica";

export const graphicRoles = ["OWNER_ADMIN", "SALES_MANAGER", "SALES", "PRODUCTION", "FINANCE", "ADVISOR"] as const;

export type GraphicRole = typeof graphicRoles[number];

export type GraphicPermission =
  | "catalog:manage"
  | "settings:manage"
  | "opportunity:write"
  | "quote:create"
  | "quote:approve"
  | "cost:view"
  | "production:update"
  | "receivable:update"
  | "post-sale:update"
  | "report:view";

const rolePermissions: Record<GraphicRole, GraphicPermission[]> = {
  OWNER_ADMIN: ["catalog:manage", "settings:manage", "opportunity:write", "quote:create", "quote:approve", "cost:view", "production:update", "receivable:update", "post-sale:update", "report:view"],
  SALES_MANAGER: ["opportunity:write", "quote:create", "quote:approve", "production:update", "report:view"],
  SALES: ["opportunity:write", "quote:create"],
  PRODUCTION: ["production:update"],
  FINANCE: ["receivable:update", "report:view"],
  ADVISOR: ["report:view"]
};

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

export function parseGraphicRole(value: unknown): GraphicRole | null {
  const role = String(value || "").trim().toUpperCase();
  return graphicRoles.includes(role as GraphicRole) ? role as GraphicRole : null;
}

export function graphicRoleSettingKey(userId: string) {
  return `userRole:${userId}`;
}

export function defaultGraphicRoleForUser(user: Pick<GraphicUser, "role">): GraphicRole {
  if (user.role === "superadmin" || user.role === "admin") return "OWNER_ADMIN";
  return "SALES";
}

export function permissionsForGraphicRole(role: GraphicRole) {
  return new Set(rolePermissions[role]);
}

export function hasGraphicPermission(role: GraphicRole, permission: GraphicPermission) {
  return permissionsForGraphicRole(role).has(permission);
}

export async function getGraphicRole(user: GraphicUser): Promise<GraphicRole> {
  const row = await prisma.graphicSetting.findFirst({
    where: { tenantId: user.tenantId, key: graphicRoleSettingKey(user.id), status: "ACTIVE" },
    select: { value: true }
  });
  return parseGraphicRole(row?.value) || defaultGraphicRoleForUser(user);
}

export async function assertGraphicPermission(user: GraphicUser, permission: GraphicPermission) {
  assertGraphicAccess(user);
  const role = await getGraphicRole(user);
  if (!hasGraphicPermission(role, permission)) {
    const error = new Error("FORBIDDEN_GRAPHIC_PERMISSION");
    error.name = "FORBIDDEN_GRAPHIC_PERMISSION";
    throw error;
  }
  return role;
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
    ["quantityMultiplierEnabled", "true"],
    ["fileRetentionDays", "1825"],
    ["fileLgpdClassification", "CONFIDENTIAL"],
    ["fileRemovalPolicy", "SOFT_DELETE_ONLY"]
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

  const stageCount = await (prisma as any).graphicPipelineStage.count({ where: { tenantId } });
  if (!stageCount) {
    await (prisma as any).graphicPipelineStage.createMany({
      data: defaultGraphicPipelineStages().map((stage) => ({ tenantId, ...stage }))
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
    quantityMultiplierEnabled: value.quantityMultiplierEnabled !== "false",
    fileRetentionDays: Number(value.fileRetentionDays || 1825),
    fileLgpdClassification: value.fileLgpdClassification || "CONFIDENTIAL",
    fileRemovalPolicy: value.fileRemovalPolicy || "SOFT_DELETE_ONLY"
  };
}
