import test from "node:test";
import assert from "node:assert/strict";
import { buildGraphicDashboard } from "../src/lib/graphic-dashboard";

const today = new Date("2026-08-13T00:00:00-03:00");
const tomorrow = new Date("2026-08-14T00:00:00-03:00");

test("calcula indicadores comerciais e de qualidade da grafica", () => {
  const result = buildGraphicDashboard({
    today,
    tomorrow,
    canViewFinancial: true,
    opportunities: [
      { status: "OPEN", nextAction: "Ligar", nextFollowUp: "2026-08-13T10:00:00-03:00" },
      { status: "OPEN", nextAction: "", nextFollowUp: null }
    ],
    quotes: [{ status: "SENT" }, { status: "APPROVED" }],
    orders: [{ soldValueCents: 120000, billedValueCents: 120000, receivedValueCents: 40000 }],
    productionOrders: [{ status: "IN_PROGRESS", reworks: [{ status: "OPEN" }], consumptions: [{ wasteQuantity: 2 }] }],
    deliveries: [{ status: "PENDING" }],
    postSales: [{ status: "OPEN" }],
    receivables: [{ status: "OPEN", dueDate: "2026-08-12", amountCents: 120000, receivedCents: 40000 }]
  });

  assert.equal(result.metrics.opportunitiesOpen, 2);
  assert.equal(result.metrics.returnsToday, 1);
  assert.equal(result.metrics.qualityAlerts, 1);
  assert.equal(result.metrics.quotesApproved, 1);
  assert.equal(result.metrics.openReceivablesCents, 80000);
  assert.equal(result.metricNotes.find((item) => item.key === "openReceivablesCents")?.quality, "OK");
});

test("oculta indicadores financeiros quando o perfil nao tem permissao", () => {
  const result = buildGraphicDashboard({
    today,
    tomorrow,
    canViewFinancial: false,
    opportunities: [{ status: "OPEN", nextAction: "Retornar", nextFollowUp: "2026-08-13" }],
    quotes: [],
    orders: [{ soldValueCents: 50000, billedValueCents: 50000, receivedValueCents: 0 }],
    productionOrders: [],
    deliveries: [],
    postSales: [],
    receivables: [{ status: "OPEN", dueDate: "2026-08-20", amountCents: 50000, receivedCents: 0 }]
  });

  assert.equal(result.metrics.soldCents, null);
  assert.equal(result.metrics.openReceivablesCents, null);
  assert.equal(result.metricNotes.find((item) => item.key === "openReceivablesCents")?.quality, "RESTRICTED");
});

test("marca indicador sem base como dados insuficientes", () => {
  const result = buildGraphicDashboard({
    today,
    tomorrow,
    canViewFinancial: true,
    opportunities: [],
    quotes: [],
    orders: [],
    productionOrders: [],
    deliveries: [],
    postSales: [],
    receivables: []
  });

  assert.equal(result.metrics.quoteConversionPercent, null);
  assert.equal(result.metricNotes.find((item) => item.key === "quotesApproved")?.quality, "INSUFFICIENT_DATA");
});
