import test from "node:test";
import assert from "node:assert/strict";
import { addPaymentToReceivable, buildGraphicInstallments, defaultGraphicPaymentAccount, defaultGraphicPaymentMethod, graphicPaymentIdempotencyKey, resolveReceivableStatus } from "../src/lib/graphic-receivables";

test("registra recebimento parcial sem ultrapassar valor total", () => {
  const first = addPaymentToReceivable(100000, 0, 40000);
  assert.deepEqual(first, { paidNowCents: 40000, nextReceivedCents: 40000, pendingCents: 60000 });

  const second = addPaymentToReceivable(100000, 90000, 30000);
  assert.deepEqual(second, { paidNowCents: 10000, nextReceivedCents: 100000, pendingCents: 0 });
});

test("resolve status de recebimento aberto, parcial, vencido e quitado", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");
  assert.equal(resolveReceivableStatus(100000, 0, now, "2026-08-20"), "OPEN");
  assert.equal(resolveReceivableStatus(100000, 0, now, "2026-08-01"), "OVERDUE");
  assert.equal(resolveReceivableStatus(100000, 40000, now, "2026-08-20"), "PARTIAL");
  assert.equal(resolveReceivableStatus(100000, 40000, now, "2026-08-01"), "PARTIAL_OVERDUE");
  assert.equal(resolveReceivableStatus(100000, 100000, now, "2026-08-01"), "PAID");
});

test("normaliza dados de baixa financeira grafica", () => {
  assert.equal(graphicPaymentIdempotencyKey("abc"), "graphic-payment-abc");
  assert.equal(defaultGraphicPaymentAccount(""), "Conta principal");
  assert.equal(defaultGraphicPaymentMethod("Pix"), "Pix");
  assert.equal(defaultGraphicPaymentMethod(""), "Manual");
});

test("gera parcelas conforme condicao de pagamento grafica", () => {
  const base = new Date("2026-08-13T12:00:00.000Z");
  const two = buildGraphicInstallments(100001, "50% na aprovacao e 50% na entrega", base);
  assert.equal(two.length, 2);
  assert.equal(two[0].amountCents, 50001);
  assert.equal(two[1].amountCents, 50000);
  assert.equal(two.reduce((sum, item) => sum + item.amountCents, 0), 100001);
  assert.equal(two[0].dueDate.toISOString().slice(0, 10), "2026-08-13");
  assert.equal(two[1].dueDate.toISOString().slice(0, 10), "2026-08-20");

  const single = buildGraphicInstallments(90000, "a combinar", base);
  assert.deepEqual(single.map((item) => item.amountCents), [90000]);
  assert.equal(single[0].dueDate.toISOString().slice(0, 10), "2026-08-20");
});
