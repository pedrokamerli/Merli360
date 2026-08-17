import test from "node:test";
import assert from "node:assert/strict";
import { approveGraphicQuote } from "../src/lib/graphic-commercial";

function quoteFixture() {
  return {
    id: "quote-1",
    tenantId: "tenant-1",
    status: "SENT",
    validUntil: new Date(Date.now() + 86_400_000),
    approvalRequired: false,
    approvals: [],
    versions: [{ version: 1 }],
    clientId: "client-1",
    opportunityId: "opportunity-1",
    totalPriceCents: 12_000,
    paymentTerms: "50% na aprovacao e 50% na entrega",
    items: [{ id: "item-1", description: "Banner", quantity: 2, priceCents: 12_000, costCents: 5_000, deadlineDays: 4 }]
  };
}

test("aprovar orcamento cria pedido, producao, recebiveis e entrega na mesma transacao", async () => {
  const calls: Array<{ model: string; data?: any }> = [];
  const quote = quoteFixture();
  const tx = {
    graphicQuote: { findFirst: async () => quote, update: async ({ data }: any) => ({ ...quote, ...data }) },
    graphicOrder: { findFirst: async () => null, create: async ({ data }: any) => { calls.push({ model: "order", data }); return { id: "order-1", number: data.number }; } },
    graphicOrderItem: { createMany: async ({ data }: any) => { calls.push({ model: "orderItems", data }); } },
    graphicProductionOrder: { create: async ({ data }: any) => { calls.push({ model: "production", data }); return { id: "production-1" }; } },
    graphicProductionStep: { createMany: async ({ data }: any) => { calls.push({ model: "steps", data }); } },
    financialTitle: { create: async ({ data }: any) => { calls.push({ model: "financialTitle", data }); return { id: `title-${calls.length}` }; } },
    graphicReceivable: { create: async ({ data }: any) => { calls.push({ model: "receivable", data }); } },
    graphicDelivery: { create: async ({ data }: any) => { calls.push({ model: "delivery", data }); } },
    graphicOpportunity: { update: async ({ data }: any) => { calls.push({ model: "opportunity", data }); } },
    graphicActivity: { create: async ({ data }: any) => { calls.push({ model: "activity", data }); } },
    graphicQuoteVersion: { create: async ({ data }: any) => { calls.push({ model: "version", data }); } },
    auditLog: { create: async ({ data }: any) => { calls.push({ model: "audit", data }); } }
  };
  const db = { $transaction: async (work: any) => work(tx) };

  const result = await approveGraphicQuote({ tenantId: "tenant-1", quoteId: "quote-1", userId: "user-1", approvedPublicly: true, db });

  assert.equal(result.alreadyApproved, false);
  assert.equal(calls.filter((call) => call.model === "order").length, 1);
  assert.equal(calls.filter((call) => call.model === "production").length, 1);
  assert.equal(calls.filter((call) => call.model === "financialTitle").length, 2);
  assert.equal(calls.filter((call) => call.model === "receivable").length, 2);
  assert.equal(calls.filter((call) => call.model === "delivery").length, 1);
  assert.equal(calls.filter((call) => call.model === "audit").length, 1);
  assert.equal(calls.find((call) => call.model === "opportunity")?.data.status, "WON");
  assert.equal(calls.find((call) => call.model === "activity")?.data.type, "QUOTE_APPROVED");
});

test("repetir aprovacao devolve o pedido existente sem criar efeitos novos", async () => {
  const quote = { ...quoteFixture(), status: "APPROVED" };
  const existingOrder = { id: "order-1", quoteId: quote.id, productionOrders: [{ id: "production-1" }] };
  const db = {
    $transaction: async (work: any) => work({
      graphicQuote: { findFirst: async () => quote },
      graphicOrder: { findFirst: async () => existingOrder }
    })
  };

  const result = await approveGraphicQuote({ tenantId: "tenant-1", quoteId: "quote-1", db });

  assert.equal(result.alreadyApproved, true);
  assert.equal(result.order.id, "order-1");
  assert.equal(result.production?.id, "production-1");
});
