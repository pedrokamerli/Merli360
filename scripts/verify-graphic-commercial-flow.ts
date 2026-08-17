import { prisma } from "../src/lib/prisma";
import { approveGraphicQuote } from "../src/lib/graphic-commercial";

async function main() {
  const suffix = `verification-${Date.now()}`;
  const tenant = await prisma.tenant.create({ data: { name: suffix, slug: suffix, brandName: "Verificacao local", kind: "grafica" } });

  try {
    const user = await prisma.user.create({ data: { tenantId: tenant.id, username: suffix, passwordHash: "local-verification", name: "Verificacao local", role: "admin" } });
    const client = await prisma.client.create({ data: { tenantId: tenant.id, name: "Cliente de verificacao", type: "grafica" } });
    const opportunity = await (prisma as any).graphicOpportunity.create({
      data: { tenantId: tenant.id, clientId: client.id, ownerId: user.id, title: "Banner de verificacao", status: "QUOTE_CREATED", createdById: user.id, updatedById: user.id }
    });
    const quote = await (prisma as any).graphicQuote.create({
      data: {
        tenantId: tenant.id,
        opportunityId: opportunity.id,
        clientId: client.id,
        responsibleId: user.id,
        number: 1,
        status: "SENT",
        validUntil: new Date(Date.now() + 86_400_000),
        paymentTerms: "50% na aprovacao e 50% na entrega",
        totalPriceCents: 12_000,
        totalCostCents: 5_000,
        minimumPriceCents: 8_000,
        createdById: user.id,
        updatedById: user.id,
        items: { create: [{ tenantId: tenant.id, description: "Banner de verificacao", quantity: 2, priceCents: 12_000, costCents: 5_000, deadlineDays: 4, createdById: user.id, updatedById: user.id }] },
        versions: { create: [{ tenantId: tenant.id, version: 1, snapshot: "{}", createdById: user.id, updatedById: user.id }] }
      }
    });

    const first = await approveGraphicQuote({ tenantId: tenant.id, quoteId: quote.id, userId: user.id, auditAction: "graphic_verify_flow" });
    const second = await approveGraphicQuote({ tenantId: tenant.id, quoteId: quote.id, userId: user.id, auditAction: "graphic_verify_flow" });
    const check = await (prisma as any).graphicOrder.findFirst({
      where: { id: first.order.id, tenantId: tenant.id },
      include: { items: true, productionOrders: { include: { steps: true } }, receivables: true, deliveries: true }
    });
    const auditCount = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "graphic_verify_flow" } });
    const expected = { orders: 1, items: 1, productionOrders: 1, steps: 10, receivables: 2, deliveries: 1, audit: 1 };
    const actual = { orders: 1, items: check.items.length, productionOrders: check.productionOrders.length, steps: check.productionOrders[0]?.steps.length || 0, receivables: check.receivables.length, deliveries: check.deliveries.length, audit: auditCount };
    if (second.alreadyApproved !== true || Object.entries(expected).some(([key, value]) => actual[key as keyof typeof actual] !== value)) {
      throw new Error(`Fluxo comercial inconsistente: ${JSON.stringify({ expected, actual, secondApproval: second.alreadyApproved })}`);
    }
    console.log(JSON.stringify({ ok: true, ...actual, repeatedApproval: second.alreadyApproved }, null, 2));
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
