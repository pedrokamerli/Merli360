import assert from "node:assert/strict";
import { createSessionToken } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

const baseUrl = process.env.MERLI360_URL || "http://localhost:3003";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "merli360-local-secret";

async function request(path: string, token: string | null, body?: unknown, method = "POST") {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { cookie: `merli360_session=${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${payload.error || response.status}`);
  return payload;
}

async function main() {
  const suffix = `api-verification-${Date.now()}`;
  const tenant = await prisma.tenant.create({ data: { name: suffix, slug: suffix, brandName: "Verificacao API", kind: "grafica" } });

  try {
    const user = await prisma.user.create({ data: { tenantId: tenant.id, username: suffix, passwordHash: "local-verification", name: "Verificacao API", role: "admin", moduleAccess: "all" } });
    const token = createSessionToken(user.id);
    const nextFollowUp = new Date(Date.now() + 86_400_000).toISOString();
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();

    const lead = await (prisma as any).lead.create({ data: { tenantId: tenant.id, name: "Cliente API", companyName: "Cliente API", contact: "14999990000", normalizedPhone: "14999990000", email: "cliente-api@example.com", city: "Bauru", state: "SP", segment: "Banner", status: "Qualificado" } });
    const opportunity = await request(`/api/crm/leads/${lead.id}/quote-handoff`, token);
    assert.equal(opportunity.client.name, "Cliente API", "O handoff deve reaproveitar o cadastro do lead.");
    assert.equal(opportunity.opportunity.leadId, lead.id, "A oportunidade deve manter o vinculo com o lead de origem.");
    const quote = await request("/api/gestao-grafica/quotes", token, {
      clientId: opportunity.client.id,
      opportunityId: opportunity.opportunity.id,
      validUntil,
      paymentTerms: "50% na aprovacao e 50% na entrega",
      items: [{ description: "Banner de verificacao", quantity: 2, negotiatedPrice: "120", deadlineDays: 4 }]
    });
    await request("/api/gestao-grafica/quotes", token, { id: quote.item.id, action: "send", nextAction: "Confirmar aprovacao", nextFollowUp }, "PUT");
    const approved = await request(`/api/gestao-grafica/public-quotes/${quote.item.shareToken}?action=approve`, null);
    const productionId = approved.productionId;
    assert.ok(productionId, "Aprovacao publica nao criou producao.");

    await request("/api/gestao-grafica/production", token, { id: productionId, action: "checklist", checklist: { arte: true, medidas: true, material: true, prazo: true, arquivos: true } }, "PUT");
    await request("/api/gestao-grafica/production", token, { id: productionId, status: "RELEASED" }, "PUT");
    const production = await (prisma as any).graphicProductionOrder.findFirst({ where: { id: productionId, tenantId: tenant.id }, include: { steps: { orderBy: { position: "asc" } } } });
    for (const step of production.steps) {
      await request("/api/gestao-grafica/production", token, { id: productionId, action: "step", stepId: step.id, stepStatus: "IN_PROGRESS" }, "PUT");
      await request("/api/gestao-grafica/production", token, { id: productionId, action: "step", stepId: step.id, stepStatus: "COMPLETED" }, "PUT");
    }
    await request("/api/gestao-grafica/production", token, { id: productionId, status: "COMPLETED" }, "PUT");

    const realDelivery = await (prisma as any).graphicDelivery.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" } });
    await request("/api/gestao-grafica/deliveries", token, { id: realDelivery.id, status: "SCHEDULED", expectedAt: nextFollowUp, responsibleName: "Equipe de verificacao", method: "RETIRADA" }, "PUT");
    await request("/api/gestao-grafica/deliveries", token, { id: realDelivery.id, status: "DELIVERED", responsibleName: "Equipe de verificacao", method: "RETIRADA" }, "PUT");
    const receivable = await (prisma as any).graphicReceivable.findFirst({ where: { tenantId: tenant.id }, orderBy: { dueDate: "asc" } });
    await request("/api/gestao-grafica/receivables", token, { id: receivable.id, amount: receivable.amountCents / 100, method: "Pix" });

    const [orderCount, postSaleCount, paymentCount, taskCount, auditCount] = await Promise.all([
      (prisma as any).graphicOrder.count({ where: { tenantId: tenant.id } }),
      (prisma as any).graphicPostSale.count({ where: { tenantId: tenant.id, status: "OPEN" } }),
      (prisma as any).graphicPayment.count({ where: { tenantId: tenant.id } }),
      (prisma as any).graphicTask.count({ where: { tenantId: tenant.id, status: "OPEN" } }),
      prisma.auditLog.count({ where: { tenantId: tenant.id } })
    ]);
    assert.equal(orderCount, 1);
    assert.equal(postSaleCount, 1);
    assert.equal(paymentCount, 1);
    assert.ok(taskCount >= 2, "Follow-up e pos-venda deveriam gerar tarefas.");
    assert.ok(auditCount >= 6, "Acoes operacionais deveriam gerar auditoria.");
    console.log(JSON.stringify({ ok: true, orderCount, postSaleCount, paymentCount, taskCount, auditCount }, null, 2));
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
