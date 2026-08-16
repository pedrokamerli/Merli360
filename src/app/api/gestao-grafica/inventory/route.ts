import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission, cents, dateOrNull } from "@/lib/graphic";
import { createGraphicPurchase, parseInventoryMovementType, receiveGraphicPurchase, registerGraphicInventoryMovement } from "@/lib/graphic-inventory";
import { financialTitleOpenCents, settleFinancialTitle } from "@/lib/financial-ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "inventory:view");
    const db = prisma as any;
    const [materials, suppliers, purchases, movements, needs, payables, receivables] = await Promise.all([
      db.graphicMaterial.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" }, include: { supplierRef: true } }),
      db.graphicSupplier.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicPurchase.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 100, include: { supplier: true, items: { include: { material: true } } } }),
      db.graphicInventoryMovement.findMany({ where: { tenantId: user.tenantId }, orderBy: { occurredAt: "desc" }, take: 100, include: { material: true } }),
      db.graphicMaterialNeed.findMany({ where: { tenantId: user.tenantId, status: "OPEN" }, orderBy: { createdAt: "desc" }, include: { material: true } }),
      db.financialTitle.findMany({ where: { tenantId: user.tenantId, type: "PAYABLE", origin: "GESTAO_GRAFICA", status: { in: ["OPEN", "PARTIAL"] } }, orderBy: { dueDate: "asc" }, take: 100, include: { settlements: true } }),
      db.graphicReceivable.findMany({ where: { tenantId: user.tenantId, status: { not: "PAID" } }, orderBy: { dueDate: "asc" }, take: 100, include: { order: true } })
    ]);
    return NextResponse.json({ materials, suppliers, purchases, movements, needs, payables: payables.map((item: any) => ({ ...item, openCents: financialTitleOpenCents(item) })), receivables });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message?.startsWith("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite acessar o estoque." : "Nao foi possivel carregar estoque e compras." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await request.json();
    const action = String(body.action || "movement");
    const db = prisma as any;

    if (action === "supplier") {
      await assertGraphicPermission(user, "purchase:manage");
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Informe o fornecedor." }, { status: 400 });
      const item = await db.graphicSupplier.upsert({
        where: { tenantId_name: { tenantId: user.tenantId, name } },
        update: { document: String(body.document || "") || null, email: String(body.email || "") || null, phone: String(body.phone || "") || null, contactName: String(body.contactName || "") || null, notes: String(body.notes || "") || null, updatedById: user.id },
        create: { tenantId: user.tenantId, name, document: String(body.document || "") || null, email: String(body.email || "") || null, phone: String(body.phone || "") || null, contactName: String(body.contactName || "") || null, notes: String(body.notes || "") || null, createdById: user.id, updatedById: user.id }
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_upsert_supplier", entity: "GraphicSupplier", entityId: item.id, request });
      return NextResponse.json({ item });
    }

    if (action === "purchase") {
      await assertGraphicPermission(user, "purchase:manage");
      const items = Array.isArray(body.items) ? body.items.map((item: any) => ({ materialId: String(item.materialId || ""), quantity: Number(item.quantity || 0), unitCostCents: cents(item.unitCost) })) : [];
      if (items.some((item: any) => !item.materialId || item.quantity <= 0 || item.unitCostCents < 0)) return NextResponse.json({ error: "Revise os materiais, quantidades e custos da compra." }, { status: 400 });
      const item = await createGraphicPurchase({ tenantId: user.tenantId, userId: user.id, supplierId: String(body.supplierId || "") || null, expectedAt: dateOrNull(body.expectedAt), notes: String(body.notes || "") || null, items });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_create_purchase", entity: "GraphicPurchase", entityId: item.id, request });
      return NextResponse.json({ item });
    }

    if (action === "receive-purchase") {
      await assertGraphicPermission(user, "purchase:manage");
      const item = await receiveGraphicPurchase({ tenantId: user.tenantId, userId: user.id, purchaseId: String(body.purchaseId || ""), items: Array.isArray(body.items) ? body.items.map((row: any) => ({ itemId: String(row.itemId || ""), quantity: Number(row.quantity || 0) })) : [] });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_receive_purchase", entity: "GraphicPurchase", entityId: item.id, request });
      return NextResponse.json({ item });
    }

    if (action === "order-purchase") {
      await assertGraphicPermission(user, "purchase:manage");
      const purchase = await db.graphicPurchase.findFirst({ where: { id: String(body.purchaseId || ""), tenantId: user.tenantId }, include: { supplier: true } });
      if (!purchase || ["CANCELLED", "RECEIVED"].includes(purchase.status)) return NextResponse.json({ error: "Compra nao pode ser pedida neste estado." }, { status: 400 });
      const item = await db.$transaction(async (tx: any) => {
        const title = await tx.financialTitle.upsert({
          where: { tenantId_legacyModel_legacyId: { tenantId: user.tenantId, legacyModel: "GraphicPurchase", legacyId: purchase.id } },
          update: { originalAmountCents: purchase.totalCents, dueDate: purchase.expectedAt || new Date(), description: `Compra grafica #${purchase.number} - ${purchase.supplier?.name || "fornecedor a definir"}`, updatedAt: new Date() },
          create: { tenantId: user.tenantId, type: "PAYABLE", origin: "GESTAO_GRAFICA", description: `Compra grafica #${purchase.number} - ${purchase.supplier?.name || "fornecedor a definir"}`, category: "Compras grafica", dueDate: purchase.expectedAt || new Date(), originalAmountCents: purchase.totalCents, notes: purchase.notes, legacyModel: "GraphicPurchase", legacyId: purchase.id }
        });
        return tx.graphicPurchase.update({ where: { id: purchase.id }, data: { status: "ORDERED", orderedAt: purchase.orderedAt || new Date(), financialTitleId: title.id, updatedById: user.id }, include: { supplier: true, items: { include: { material: true } } } });
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_order_purchase", entity: "GraphicPurchase", entityId: item.id, request });
      return NextResponse.json({ item });
    }

    if (action === "settle-payable") {
      await assertGraphicPermission(user, "purchase:manage");
      const titleId = String(body.titleId || "");
      const amount = Number(String(body.amount || "0").replace(",", "."));
      if (!titleId || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Informe titulo e valor pago." }, { status: 400 });
      const item = await settleFinancialTitle({ tenantId: user.tenantId, titleId, principalAmount: amount, effectiveDate: body.paidAt || new Date(), accountName: String(body.accountName || "Conta principal"), paymentMethod: String(body.method || "Manual"), notes: String(body.notes || "") || null, idempotencyKey: `graphic-payable-${titleId}-${String(body.paidAt || new Date().toISOString()).slice(0, 10)}-${amount}` });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_settle_payable", entity: "FinancialTitle", entityId: titleId, request, metadata: { amount } });
      return NextResponse.json({ item });
    }

    await assertGraphicPermission(user, "inventory:manage");
    const type = parseInventoryMovementType(body.type);
    if (!type) return NextResponse.json({ error: "Tipo de movimentacao invalido." }, { status: 400 });
    const item = await registerGraphicInventoryMovement({ tenantId: user.tenantId, userId: user.id, materialId: String(body.materialId || ""), type, quantity: Number(body.quantity || 0), unitCostCents: body.unitCost === undefined ? null : cents(body.unitCost), note: String(body.note || "") || null, occurredAt: dateOrNull(body.occurredAt) || new Date() });
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_inventory_movement", entity: "GraphicInventoryMovement", entityId: item.id, request, metadata: { type } });
    return NextResponse.json({ item });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message?.startsWith("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite executar esta acao." : "Nao foi possivel concluir a operacao de estoque ou compra.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
