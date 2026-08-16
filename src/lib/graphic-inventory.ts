import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const inventoryMovementTypes = ["ENTRY", "OUTPUT", "ADJUSTMENT", "PRODUCTION_CONSUMPTION", "LOSS", "RETURN"] as const;
export type InventoryMovementType = typeof inventoryMovementTypes[number];
export const purchaseStatuses = ["DRAFT", "REQUESTED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;

function signedQuantity(type: InventoryMovementType, quantity: number) {
  if (["OUTPUT", "PRODUCTION_CONSUMPTION", "LOSS"].includes(type)) return -Math.abs(quantity);
  return quantity;
}

export function parseInventoryMovementType(value: unknown): InventoryMovementType | null {
  const type = String(value || "").trim().toUpperCase();
  return inventoryMovementTypes.includes(type as InventoryMovementType) ? type as InventoryMovementType : null;
}

export async function registerGraphicInventoryMovement(input: {
  tenantId: string;
  userId: string;
  materialId: string;
  type: InventoryMovementType;
  quantity: number;
  unitCostCents?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  occurredAt?: Date;
}) {
  const quantity = Number(input.quantity || 0);
  if (!Number.isFinite(quantity) || quantity === 0) throw new Error("INVENTORY_QUANTITY_REQUIRED");
  if (input.type !== "ADJUSTMENT" && quantity < 0) throw new Error("INVENTORY_QUANTITY_INVALID");

  return prisma.$transaction(async (tx: any) => {
    const material = await tx.graphicMaterial.findFirst({ where: { id: input.materialId, tenantId: input.tenantId } });
    if (!material) throw new Error("MATERIAL_NOT_FOUND");
    const referenceType = input.referenceType || "MANUAL";
    const referenceId = input.referenceId || `manual-${crypto.randomUUID()}`;
    const existing = await tx.graphicInventoryMovement.findFirst({ where: { tenantId: input.tenantId, referenceType, referenceId, materialId: input.materialId, type: input.type } });
    if (existing) return existing;
    const movement = await tx.graphicInventoryMovement.create({
      data: { tenantId: input.tenantId, materialId: input.materialId, type: input.type, quantity, unitCostCents: input.unitCostCents ?? null, referenceType, referenceId, note: input.note || null, occurredAt: input.occurredAt || new Date(), createdById: input.userId, updatedById: input.userId }
    });
    {
      const delta = signedQuantity(input.type, quantity);
      const nextStock = Math.round((Number(material.currentStock || 0) + delta) * 10000) / 10000;
      const costUpdate = input.unitCostCents && input.unitCostCents > 0 ? { currentCostCents: input.unitCostCents } : {};
      await tx.graphicMaterial.update({ where: { id: material.id }, data: { currentStock: nextStock, ...costUpdate, updatedById: input.userId } });
      if (input.unitCostCents && input.unitCostCents > 0 && input.unitCostCents !== material.currentCostCents) {
        await tx.graphicMaterialCostHistory.create({ data: { tenantId: input.tenantId, materialId: material.id, costCents: input.unitCostCents, source: input.referenceType || "INVENTORY", status: "ACTIVE", createdById: input.userId, updatedById: input.userId } });
      }
    }
    return movement;
  });
}

export async function createGraphicPurchase(input: {
  tenantId: string;
  userId: string;
  supplierId?: string | null;
  expectedAt?: Date | null;
  notes?: string | null;
  items: Array<{ materialId: string; quantity: number; unitCostCents: number }>;
}) {
  if (!input.items.length) throw new Error("PURCHASE_ITEMS_REQUIRED");
  return prisma.$transaction(async (tx: any) => {
    const materials = await tx.graphicMaterial.findMany({ where: { tenantId: input.tenantId, id: { in: input.items.map((item) => item.materialId) } } });
    if (materials.length !== input.items.length) throw new Error("PURCHASE_MATERIAL_NOT_FOUND");
    if (input.supplierId) {
      const supplier = await tx.graphicSupplier.findFirst({ where: { id: input.supplierId, tenantId: input.tenantId, status: "ACTIVE" } });
      if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
    }
    const last = await tx.graphicPurchase.findFirst({ where: { tenantId: input.tenantId }, orderBy: { number: "desc" }, select: { number: true } });
    const totalCents = input.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCostCents), 0);
    return tx.graphicPurchase.create({
      data: {
        tenantId: input.tenantId,
        number: (last?.number || 0) + 1,
        supplierId: input.supplierId || null,
        expectedAt: input.expectedAt || null,
        notes: input.notes || null,
        totalCents,
        createdById: input.userId,
        updatedById: input.userId,
        items: { create: input.items.map((item) => ({ tenantId: input.tenantId, materialId: item.materialId, quantity: item.quantity, unitCostCents: item.unitCostCents, createdById: input.userId, updatedById: input.userId })) }
      },
      include: { items: { include: { material: true } }, supplier: true }
    });
  });
}

export async function receiveGraphicPurchase(input: { tenantId: string; userId: string; purchaseId: string; items: Array<{ itemId: string; quantity: number }> }) {
  if (!input.items.length) throw new Error("PURCHASE_RECEIPT_ITEMS_REQUIRED");
  return prisma.$transaction(async (tx: any) => {
    const purchase = await tx.graphicPurchase.findFirst({ where: { id: input.purchaseId, tenantId: input.tenantId }, include: { items: true } });
    if (!purchase || ["CANCELLED", "RECEIVED"].includes(purchase.status)) throw new Error("PURCHASE_NOT_RECEIVABLE");
    for (const incoming of input.items) {
      const item = purchase.items.find((row: any) => row.id === incoming.itemId);
      if (!item || incoming.quantity <= 0 || item.receivedQuantity + incoming.quantity > item.quantity) throw new Error("PURCHASE_RECEIPT_QUANTITY_INVALID");
      const referenceId = `${purchase.id}:${item.id}:${item.receivedQuantity + incoming.quantity}`;
      const material = await tx.graphicMaterial.findFirst({ where: { id: item.materialId, tenantId: input.tenantId } });
      await tx.graphicInventoryMovement.create({ data: { tenantId: input.tenantId, materialId: item.materialId, type: "ENTRY", quantity: incoming.quantity, unitCostCents: item.unitCostCents, referenceType: "PURCHASE_RECEIPT", referenceId, note: `Recebimento da compra #${purchase.number}`, createdById: input.userId, updatedById: input.userId } });
      await tx.graphicMaterial.update({ where: { id: item.materialId }, data: { currentStock: Number(material.currentStock || 0) + incoming.quantity, currentCostCents: item.unitCostCents, updatedById: input.userId } });
      if (material.currentCostCents !== item.unitCostCents) await tx.graphicMaterialCostHistory.create({ data: { tenantId: input.tenantId, materialId: item.materialId, costCents: item.unitCostCents, source: "PURCHASE_RECEIPT", status: "ACTIVE", createdById: input.userId, updatedById: input.userId } });
      await tx.graphicPurchaseItem.update({ where: { id: item.id }, data: { receivedQuantity: item.receivedQuantity + incoming.quantity, updatedById: input.userId } });
    }
    const refreshed = await tx.graphicPurchase.findUnique({ where: { id: purchase.id }, include: { items: true } });
    const complete = refreshed.items.every((item: any) => item.receivedQuantity >= item.quantity);
    const partial = refreshed.items.some((item: any) => item.receivedQuantity > 0);
    return tx.graphicPurchase.update({ where: { id: purchase.id }, data: { status: complete ? "RECEIVED" : partial ? "PARTIALLY_RECEIVED" : purchase.status, receivedAt: complete ? new Date() : null, updatedById: input.userId }, include: { items: { include: { material: true } }, supplier: true } });
  });
}

export async function registerGraphicProductionConsumption(input: { tenantId: string; userId: string; productionOrderId: string; materialId?: string | null; description: string; quantity: number; wasteQuantity: number; costCents: number }) {
  if (input.quantity <= 0 || input.wasteQuantity < 0) throw new Error("PRODUCTION_CONSUMPTION_INVALID");
  return prisma.$transaction(async (tx: any) => {
    const production = await tx.graphicProductionOrder.findFirst({ where: { id: input.productionOrderId, tenantId: input.tenantId } });
    if (!production) throw new Error("PRODUCTION_NOT_FOUND");
    const consumption = await tx.graphicMaterialConsumption.create({ data: { tenantId: input.tenantId, productionOrderId: input.productionOrderId, materialId: input.materialId || null, description: input.description, quantity: input.quantity, wasteQuantity: input.wasteQuantity, costCents: input.costCents, createdById: input.userId, updatedById: input.userId } });
    if (input.materialId) {
      const material = await tx.graphicMaterial.findFirst({ where: { id: input.materialId, tenantId: input.tenantId } });
      if (!material) throw new Error("MATERIAL_NOT_FOUND");
      const used = input.quantity + input.wasteQuantity;
      await tx.graphicInventoryMovement.create({ data: { tenantId: input.tenantId, materialId: material.id, type: "PRODUCTION_CONSUMPTION", quantity: used, unitCostCents: input.costCents || material.currentCostCents, referenceType: "PRODUCTION_CONSUMPTION", referenceId: consumption.id, note: input.description, createdById: input.userId, updatedById: input.userId } });
      await tx.graphicMaterial.update({ where: { id: material.id }, data: { currentStock: Number(material.currentStock || 0) - used, updatedById: input.userId } });
    }
    await tx.graphicProductionEvent.create({ data: { tenantId: input.tenantId, productionOrderId: input.productionOrderId, userId: input.userId, action: "MATERIAL_CONSUMED", note: `${input.description} - ${input.quantity}`, createdById: input.userId, updatedById: input.userId } });
    return consumption;
  });
}

export async function refreshGraphicMaterialNeeds(input: { tenantId: string; userId: string; productionOrderId: string }) {
  return prisma.$transaction(async (tx: any) => {
    const production = await tx.graphicProductionOrder.findFirst({
      where: { id: input.productionOrderId, tenantId: input.tenantId },
      include: { order: { include: { quote: { include: { items: { include: { product: { include: { components: true } } } } } } } } }
    });
    if (!production) throw new Error("PRODUCTION_NOT_FOUND");
    const totals = new Map<string, number>();
    for (const item of production.order.quote.items) {
      for (const component of item.product?.components || []) {
        const expected = Number(item.quantity || 0) * Number(component.quantity || 0) * (1 + Number(component.wastePercent || 0) / 100);
        totals.set(component.materialId, (totals.get(component.materialId) || 0) + expected);
      }
    }
    const materialIds = [...totals.keys()];
    const materials = materialIds.length ? await tx.graphicMaterial.findMany({ where: { tenantId: input.tenantId, id: { in: materialIds } } }) : [];
    for (const material of materials) {
      const requiredQuantity = Math.round((totals.get(material.id) || 0) * 10000) / 10000;
      const availableQuantity = Number(material.currentStock || 0);
      const missingQuantity = Math.max(0, requiredQuantity - availableQuantity);
      await tx.graphicMaterialNeed.upsert({
        where: { tenantId_productionOrderId_materialId: { tenantId: input.tenantId, productionOrderId: production.id, materialId: material.id } },
        update: { requiredQuantity, availableQuantity, missingQuantity, status: missingQuantity > 0 ? "OPEN" : "RESOLVED", updatedById: input.userId },
        create: { tenantId: input.tenantId, productionOrderId: production.id, materialId: material.id, requiredQuantity, availableQuantity, missingQuantity, status: missingQuantity > 0 ? "OPEN" : "RESOLVED", createdById: input.userId, updatedById: input.userId }
      });
    }
    return { checkedMaterials: materials.length, shortages: materials.filter((material: any) => (totals.get(material.id) || 0) > Number(material.currentStock || 0)).length };
  });
}
