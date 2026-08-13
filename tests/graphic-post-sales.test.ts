import test from "node:test";
import assert from "node:assert/strict";
import { buildPostSaleOpportunityTitle, shouldCreatePostSaleOpportunity, shouldCreatePostSaleTask, validateSatisfaction } from "../src/lib/graphic-post-sales";

test("valida satisfacao do pos-venda", () => {
  assert.equal(validateSatisfaction(""), null);
  assert.equal(validateSatisfaction(1), null);
  assert.equal(validateSatisfaction(5), null);
  assert.equal(validateSatisfaction(0), "Satisfacao deve ser de 1 a 5.");
  assert.equal(validateSatisfaction(6), "Satisfacao deve ser de 1 a 5.");
});

test("cria oportunidade quando pos-venda indica problema ou recorrencia", () => {
  assert.equal(shouldCreatePostSaleOpportunity({ satisfaction: 5, createOpportunity: false, complaint: "" }), false);
  assert.equal(shouldCreatePostSaleOpportunity({ satisfaction: 3, createOpportunity: false, complaint: "" }), true);
  assert.equal(shouldCreatePostSaleOpportunity({ satisfaction: 5, createOpportunity: true, complaint: "" }), true);
  assert.equal(shouldCreatePostSaleOpportunity({ satisfaction: 5, createOpportunity: false, complaint: "Cliente reclamou do acabamento" }), true);
});

test("nomeia oportunidade de pos-venda conforme contexto", () => {
  assert.equal(buildPostSaleOpportunityTitle({ orderNumber: 12, complaint: "" }), "Nova oportunidade pos-venda pedido #12");
  assert.equal(buildPostSaleOpportunityTitle({ orderNumber: 12, complaint: "Refazer placa" }), "Resolver pos-venda do pedido #12");
});

test("cria tarefa de pos-venda apenas com acao e data", () => {
  assert.equal(shouldCreatePostSaleTask({ nextAction: "Ligar", nextFollowUp: "2026-08-20" }), true);
  assert.equal(shouldCreatePostSaleTask({ nextAction: "Ligar", nextFollowUp: null }), false);
  assert.equal(shouldCreatePostSaleTask({ nextAction: "", nextFollowUp: "2026-08-20" }), false);
});
