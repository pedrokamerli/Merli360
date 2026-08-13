import test from "node:test";
import assert from "node:assert/strict";
import { addPaymentToReceivable, resolveReceivableStatus } from "../src/lib/graphic-receivables";

test("registra recebimento parcial sem ultrapassar valor total", () => {
  const first = addPaymentToReceivable(100000, 0, 40000);
  assert.deepEqual(first, { paidNowCents: 40000, nextReceivedCents: 40000, pendingCents: 60000 });

  const second = addPaymentToReceivable(100000, 90000, 30000);
  assert.deepEqual(second, { paidNowCents: 30000, nextReceivedCents: 100000, pendingCents: 0 });
});

test("resolve status de recebimento aberto, parcial, vencido e quitado", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");
  assert.equal(resolveReceivableStatus(100000, 0, now, "2026-08-20"), "OPEN");
  assert.equal(resolveReceivableStatus(100000, 0, now, "2026-08-01"), "OVERDUE");
  assert.equal(resolveReceivableStatus(100000, 40000, now, "2026-08-20"), "PARTIAL");
  assert.equal(resolveReceivableStatus(100000, 40000, now, "2026-08-01"), "PARTIAL_OVERDUE");
  assert.equal(resolveReceivableStatus(100000, 100000, now, "2026-08-01"), "PAID");
});
