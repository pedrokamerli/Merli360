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
      { status: "OPEN", clientId: "c1", source: "Instagram", productInterest: "Banner", ownerName: "Ana", nextAction: "Ligar", nextFollowUp: "2026-08-13T10:00:00-03:00" },
      { status: "OPEN", clientId: "c3", source: "Indicacao", productInterest: "Placa ACM", ownerName: "Ana", nextAction: "", nextFollowUp: null }
    ],
    quotes: [
      { status: "SENT", discountCents: 1000, marginPercent: 35, approvalRequired: true },
      { status: "APPROVED", totalPriceCents: 90000, discountCents: 3000, marginPercent: 25 },
      { status: "APPROVED", totalPriceCents: 150000, discountCents: 0, marginPercent: 45 }
    ],
    orders: [
      { clientId: "c1", clientName: "Cliente A", clientSegment: "Varejo", soldValueCents: 120000, billedValueCents: 120000, receivedValueCents: 40000 },
      { clientId: "c1", clientName: "Cliente A", clientSegment: "Varejo", soldValueCents: 80000, billedValueCents: 0, receivedValueCents: 0 },
      { clientId: "c2", clientName: "Cliente B", clientSegment: "Industria", soldValueCents: 50000, billedValueCents: 0, receivedValueCents: 0 }
    ],
    productionOrders: [
      { status: "IN_PROGRESS", promisedAt: "2026-08-12T10:00:00-03:00", createdAt: "2026-08-13T08:00:00-03:00", order: { quote: { approvedAt: "2026-08-13T06:00:00-03:00" } }, steps: [{ estimatedMinutes: 60, actualMinutes: 90 }], reworks: [{ status: "OPEN" }], consumptions: [{ wasteQuantity: 2 }] },
      { status: "BLOCKED", promisedAt: "2026-08-14T10:00:00-03:00", createdAt: "2026-08-13T09:00:00-03:00", order: { quote: { approvedAt: "2026-08-13T08:00:00-03:00" } }, steps: [{ estimatedMinutes: 120, actualMinutes: 60 }], reworks: [], consumptions: [] },
      { status: "COMPLETED", createdAt: "2026-08-10T08:00:00-03:00", updatedAt: "2026-08-10T14:00:00-03:00", order: { quote: { approvedAt: "2026-08-10T07:00:00-03:00" } }, steps: [{ estimatedMinutes: 60, actualMinutes: 60 }], reworks: [], consumptions: [] }
    ],
    deliveries: [
      { status: "PENDING" },
      { status: "DELIVERED", expectedAt: "2026-08-13T18:00:00-03:00", deliveredAt: "2026-08-13T17:00:00-03:00" },
      { status: "DELIVERED", expectedAt: "2026-08-12T18:00:00-03:00", deliveredAt: "2026-08-13T09:00:00-03:00" }
    ],
    postSales: [{ status: "OPEN" }],
    receivables: [{ status: "OPEN", dueDate: "2026-08-12", amountCents: 120000, receivedCents: 40000 }]
  });

  assert.equal(result.metrics.opportunitiesOpen, 2);
  assert.equal(result.metrics.returnsToday, 1);
  assert.equal(result.metrics.qualityAlerts, 1);
  assert.equal(result.metrics.clientsNew, 1);
  assert.equal(result.metrics.clientsRecurring, 1);
  assert.equal(result.metrics.clientsInactive, 1);
  assert.equal(result.metrics.quotesApproved, 2);
  assert.equal(result.metrics.averageTicketCents, 120000);
  assert.equal(result.metrics.averageMarginPercent, 35);
  assert.equal(result.metrics.discountsCents, 4000);
  assert.equal(result.metrics.approvalRequiredOpen, 1);
  assert.equal(result.metrics.productionDelayed, 1);
  assert.equal(result.metrics.productionBlocked, 1);
  assert.equal(result.metrics.productionPlannedHours, 4);
  assert.equal(result.metrics.productionActualHours, 3.5);
  assert.equal(result.metrics.productionTimeVariancePercent, -12);
  assert.equal(result.metrics.averageProductionCycleHours, 6);
  assert.equal(result.metrics.averageApprovalToProductionHours, 1.3);
  assert.equal(result.metrics.deliveryOnTimePercent, 50);
  assert.equal(result.metrics.openReceivablesCents, 80000);
  assert.equal(result.groups.salesBySource[0].label, "Instagram");
  assert.equal(result.groups.salesByProduct[0].label, "Banner");
  assert.equal(result.groups.salesByResponsible[0].label, "Ana");
  assert.equal(result.groups.salesBySegment[0].label, "Varejo");
  assert.equal(result.groups.revenueByClient[0].valueCents, 200000);
  assert.equal(result.metricNotes.find((item) => item.key === "openReceivablesCents")?.quality, "OK");
  assert.equal(result.metricNotes.find((item) => item.key === "productionTimeVariancePercent")?.quality, "OK");
  assert.equal(result.metricNotes.find((item) => item.key === "deliveryOnTimePercent")?.quality, "OK");
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
  assert.equal(result.metrics.averageTicketCents, null);
  assert.equal(result.metrics.discountsCents, null);
  assert.deepEqual(result.groups.revenueByClient, []);
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
