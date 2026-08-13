import test from "node:test";
import assert from "node:assert/strict";
import { defaultGraphicPipelineStages, isClosedGraphicOpportunity, isGraphicOpportunityStatus, opportunityQualityAlert, shouldCreateFollowUpTask, validateOpportunityUpdate } from "../src/lib/graphic-opportunities";

test("valida status oficiais de oportunidade grafica", () => {
  assert.equal(isGraphicOpportunityStatus("OPEN"), true);
  assert.equal(isGraphicOpportunityStatus("LOST"), true);
  assert.equal(isGraphicOpportunityStatus("INVALID"), false);
  assert.deepEqual(defaultGraphicPipelineStages().map((item) => item.name), ["OPEN", "QUOTE_CREATED", "WON", "LOST", "ARCHIVED"]);
});

test("oportunidade perdida exige motivo", () => {
  assert.equal(validateOpportunityUpdate({ currentStatus: "OPEN", nextStatus: "LOST", lossReason: "" }), "Informe o motivo da perda.");
  assert.equal(validateOpportunityUpdate({ currentStatus: "OPEN", nextStatus: "LOST", lossReason: "Preco" }), null);
});

test("oportunidade aberta exige proximo passo ou retorno", () => {
  assert.equal(validateOpportunityUpdate({ currentStatus: "OPEN", nextStatus: "OPEN", nextAction: "", nextFollowUp: null }), "Informe o proximo passo ou a data de retorno.");
  assert.equal(validateOpportunityUpdate({ currentStatus: "OPEN", nextStatus: "OPEN", nextAction: "Ligar", nextFollowUp: null }), null);
});

test("aceita etapa configurada do funil do tenant", () => {
  assert.equal(validateOpportunityUpdate({ currentStatus: "OPEN", nextStatus: "NEGOCIACAO", nextAction: "Ligar", allowedStatuses: ["OPEN", "NEGOCIACAO", "LOST"] }), null);
  assert.equal(validateOpportunityUpdate({ currentStatus: "OPEN", nextStatus: "FORA_DO_TENANT", nextAction: "Ligar", allowedStatuses: ["OPEN", "NEGOCIACAO", "LOST"] }), "Status de oportunidade invalido.");
});

test("nao reabre oportunidade perdida no mesmo registro", () => {
  assert.equal(validateOpportunityUpdate({ currentStatus: "LOST", nextStatus: "OPEN", lossReason: "Sem interesse", nextAction: "Ligar" }), "Oportunidade perdida deve ser reaberta por uma nova oportunidade.");
});

test("cria tarefa apenas com acao e data", () => {
  assert.equal(shouldCreateFollowUpTask({ nextAction: "Ligar", nextFollowUp: "2026-08-14" }), true);
  assert.equal(shouldCreateFollowUpTask({ nextAction: "Ligar", nextFollowUp: null }), false);
  assert.equal(shouldCreateFollowUpTask({ nextAction: "", nextFollowUp: "2026-08-14" }), false);
});

test("calcula alerta de qualidade para oportunidades abertas", () => {
  assert.equal(isClosedGraphicOpportunity("WON"), true);
  assert.equal(opportunityQualityAlert({ status: "OPEN", nextAction: "Enviar proposta", nextFollowUp: "2026-08-14" }), null);
  assert.equal(opportunityQualityAlert({ status: "OPEN", nextAction: "", nextFollowUp: null }), "Oportunidade aberta sem proximo passo completo.");
  assert.equal(opportunityQualityAlert({ status: "LOST", nextAction: "", nextFollowUp: null }), null);
});
