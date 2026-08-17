import test from "node:test";
import assert from "node:assert/strict";
import { isGraphicDeliveryStatus, validateDeliveryStatusChange } from "../src/lib/graphic-deliveries";

test("valida status oficiais de entrega grafica", () => {
  assert.equal(isGraphicDeliveryStatus("PENDING"), true);
  assert.equal(isGraphicDeliveryStatus("ACCEPTED"), true);
  assert.equal(isGraphicDeliveryStatus("ENVIADO"), false);
});

test("exige motivo para reclamacao ou cancelamento de entrega", () => {
  assert.match(validateDeliveryStatusChange({ status: "COMPLAINT" }) || "", /motivo/);
  assert.match(validateDeliveryStatusChange({ status: "CANCELLED", note: "" }) || "", /motivo/);
  assert.equal(validateDeliveryStatusChange({ status: "COMPLAINT", note: "Cliente reclamou da instalacao" }), null);
});

test("aceite de entrega exige comprovante", () => {
  assert.match(validateDeliveryStatusChange({ status: "ACCEPTED" }) || "", /comprovante/);
  assert.equal(validateDeliveryStatusChange({ status: "ACCEPTED", proofAttachmentId: "att-1" }), null);
});

test("expedicao respeita producao, agendamento e entrega em sequencia", () => {
  assert.match(validateDeliveryStatusChange({ status: "SCHEDULED", currentStatus: "PENDING", productionStatus: "IN_PROGRESS", expectedAt: "2026-08-18", responsibleName: "Jorge" }) || "", /producao/);
  assert.match(validateDeliveryStatusChange({ status: "SCHEDULED", currentStatus: "PENDING", productionStatus: "COMPLETED", responsibleName: "Jorge" }) || "", /data prevista/);
  assert.equal(validateDeliveryStatusChange({ status: "SCHEDULED", currentStatus: "PENDING", productionStatus: "COMPLETED", expectedAt: "2026-08-18", responsibleName: "Jorge" }), null);
  assert.match(validateDeliveryStatusChange({ status: "DELIVERED", currentStatus: "PENDING", productionStatus: "COMPLETED" }) || "", /Agende/);
  assert.equal(validateDeliveryStatusChange({ status: "DELIVERED", currentStatus: "SCHEDULED", productionStatus: "COMPLETED" }), null);
});
