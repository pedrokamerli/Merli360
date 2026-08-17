import test from "node:test";
import assert from "node:assert/strict";
import { canReleaseProduction, mergeChecklist, missingChecklistItems, validateProductionCompletion, validateProductionStatusChange, validateRework } from "../src/lib/graphic-production";

test("bloqueia liberacao de producao com checklist incompleto", () => {
  const checklist = mergeChecklist(null, { arte: true, medidas: true, material: true });

  assert.equal(canReleaseProduction(checklist), false);
  assert.deepEqual(missingChecklistItems(checklist), ["prazo", "arquivos"]);
  assert.match(validateProductionStatusChange("PENDING", "RELEASED", checklist) || "", /Checklist incompleto/);
});

test("permite liberar producao com checklist completo", () => {
  const checklist = mergeChecklist(null, { arte: true, medidas: true, material: true, prazo: true, arquivos: true });

  assert.equal(canReleaseProduction(checklist), true);
  assert.equal(validateProductionStatusChange("PENDING", "RELEASED", checklist), null);
});

test("protege status finais da producao", () => {
  const checklist = mergeChecklist(null, { arte: true, medidas: true, material: true, prazo: true, arquivos: true });

  assert.match(validateProductionStatusChange("COMPLETED", "IN_PROGRESS", checklist) || "", /nao pode voltar/);
  assert.match(validateProductionStatusChange("CANCELLED", "PENDING", checklist) || "", /nao pode voltar/);
  assert.match(validateProductionStatusChange("PENDING", "COMPLETED", checklist) || "", /somente depois/);
});

test("nao conclui producao com etapa pendente", () => {
  assert.match(validateProductionCompletion([{ name: "Arte", status: "COMPLETED" }, { name: "Impressao", status: "PENDING" }]) || "", /Impressao/);
  assert.equal(validateProductionCompletion([{ name: "Arte", status: "COMPLETED" }, { name: "Impressao", status: "SKIPPED" }]), null);
});

test("retrabalho exige motivo impacto e acao corretiva", () => {
  assert.match(validateRework("", "Prazo", "Refazer") || "", /motivo/);
  assert.match(validateRework("Erro de corte", "", "Refazer") || "", /impacto/);
  assert.match(validateRework("Erro de corte", "Perda de material", "") || "", /acao corretiva/);
  assert.equal(validateRework("Erro de corte", "Perda de material", "Conferir medidas antes de refazer"), null);
});
