import test from "node:test";
import assert from "node:assert/strict";
import { isGraphicQuoteStatus, isTerminalQuoteStatus, nextQuoteVersion, validateCommercialApproval, validateQuoteStatusAction } from "../src/lib/graphic-quotes";

test("valida status oficiais de orcamento grafico", () => {
  assert.equal(isGraphicQuoteStatus("DRAFT"), true);
  assert.equal(isGraphicQuoteStatus("SENT"), true);
  assert.equal(isGraphicQuoteStatus("APROVADO"), false);
});

test("bloqueia alteracao de orcamento encerrado", () => {
  assert.equal(isTerminalQuoteStatus("APPROVED"), true);
  assert.match(validateQuoteStatusAction("APPROVED", "SENT") || "", /aprovado/);
  assert.match(validateQuoteStatusAction("CANCELLED", "SENT") || "", /encerrado/);
});

test("recusa e cancelamento exigem motivo", () => {
  assert.match(validateQuoteStatusAction("DRAFT", "REFUSED") || "", /motivo/);
  assert.match(validateQuoteStatusAction("SENT", "CANCELLED") || "", /motivo/);
  assert.equal(validateQuoteStatusAction("SENT", "REFUSED", "Cliente recusou prazo"), null);
});

test("calcula proxima versao de orcamento", () => {
  assert.equal(nextQuoteVersion([]), 1);
  assert.equal(nextQuoteVersion([{ version: 1 }, { version: 3 }]), 4);
});

test("valida aprovacao comercial de excecao", () => {
  assert.equal(validateCommercialApproval({ status: "SENT", approvalRequired: true, pendingApprovals: 1 }), null);
  assert.match(validateCommercialApproval({ status: "SENT", approvalRequired: false, pendingApprovals: 0 }) || "", /nao possui/);
  assert.match(validateCommercialApproval({ status: "APPROVED", approvalRequired: true, pendingApprovals: 1 }) || "", /nao precisa/);
  assert.match(validateCommercialApproval({ status: "CANCELLED", approvalRequired: true, pendingApprovals: 1 }) || "", /encerrado/);
});
