import assert from "node:assert/strict";
import { createSessionToken } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

const baseUrl = process.env.MERLI360_URL || "http://localhost:3003";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "merli360-local-secret";

async function cleanupTenant(tenantId: string) {
  const db = prisma as any;
  await db.cashMovement.deleteMany({ where: { tenantId } });
  await db.settlement.deleteMany({ where: { tenantId } });
  await db.financialTitle.deleteMany({ where: { tenantId } });
  await db.graphicInventoryMovement.deleteMany({ where: { tenantId } });
  await db.graphicMaterialCostHistory.deleteMany({ where: { tenantId } });
  await db.graphicPurchaseItem.deleteMany({ where: { tenantId } });
  await db.graphicPurchase.deleteMany({ where: { tenantId } });
  await db.graphicSupplier.deleteMany({ where: { tenantId } });
  await db.graphicMaterial.deleteMany({ where: { tenantId } });
  await db.auditLog.deleteMany({ where: { tenantId } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
}

async function request(path: string, token: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { cookie: `merli360_session=${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`POST ${path}: ${payload.error || response.status}`);
  return payload;
}

async function main() {
  const staleTenants = await prisma.tenant.findMany({ where: { slug: { startsWith: "admin-verification-" } }, select: { id: true } });
  for (const stale of staleTenants) await cleanupTenant(stale.id);
  const suffix = `admin-verification-${Date.now()}`;
  const tenant = await prisma.tenant.create({ data: { name: suffix, slug: suffix, brandName: "Verificacao administrativa", kind: "grafica" } });

  try {
    const user = await prisma.user.create({ data: { tenantId: tenant.id, username: suffix, passwordHash: "local-verification", name: "Verificacao administrativa", role: "admin", moduleAccess: "all" } });
    const material = await (prisma as any).graphicMaterial.create({ data: { tenantId: tenant.id, name: "Lona de verificacao", unit: "m2", currentStock: 0, minStock: 2, currentCostCents: 0, createdById: user.id, updatedById: user.id } });
    const token = createSessionToken(user.id);
    const supplier = await request("/api/gestao-grafica/inventory", token, { action: "supplier", name: "Fornecedor API", phone: "14999990000" });
    const purchase = await request("/api/gestao-grafica/inventory", token, { action: "purchase", supplierId: supplier.item.id, expectedAt: new Date(Date.now() + 86_400_000).toISOString(), items: [{ materialId: material.id, quantity: 10, unitCost: "12.50" }] });
    await request("/api/gestao-grafica/inventory", token, { action: "order-purchase", purchaseId: purchase.item.id });
    const orderedPurchase = await (prisma as any).graphicPurchase.findFirst({ where: { id: purchase.item.id, tenantId: tenant.id }, include: { items: true } });
    await request("/api/gestao-grafica/inventory", token, { action: "receive-purchase", purchaseId: orderedPurchase.id, items: [{ itemId: orderedPurchase.items[0].id, quantity: 10 }] });
    const payable = await prisma.financialTitle.findFirst({ where: { tenantId: tenant.id, type: "PAYABLE", origin: "GESTAO_GRAFICA" } });
    await request("/api/gestao-grafica/inventory", token, { action: "settle-payable", titleId: payable?.id, amount: 125, accountName: "Conta principal", method: "Pix" });

    const [storedMaterial, storedPurchase, storedPayable, movementCount] = await Promise.all([
      (prisma as any).graphicMaterial.findFirst({ where: { id: material.id, tenantId: tenant.id } }),
      (prisma as any).graphicPurchase.findFirst({ where: { id: purchase.item.id, tenantId: tenant.id } }),
      prisma.financialTitle.findFirst({ where: { id: payable?.id, tenantId: tenant.id }, include: { settlements: true } }),
      (prisma as any).graphicInventoryMovement.count({ where: { tenantId: tenant.id, materialId: material.id, type: "ENTRY" } })
    ]);
    assert.ok(storedMaterial, "Material de verificacao nao encontrado.");
    assert.ok(storedPurchase, "Compra de verificacao nao encontrada.");
    assert.ok(storedPayable, "Conta a pagar de verificacao nao encontrada.");
    assert.equal(storedMaterial.currentStock, 10);
    assert.equal(storedMaterial.currentCostCents, 1250);
    assert.equal(storedPurchase.status, "RECEIVED");
    assert.equal(storedPayable.status, "PAID");
    assert.equal(movementCount, 1);
    console.log(JSON.stringify({ ok: true, stock: storedMaterial.currentStock, purchaseStatus: storedPurchase.status, payableStatus: storedPayable.status, movementCount }, null, 2));
  } finally {
    await cleanupTenant(tenant.id);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
