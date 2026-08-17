import test from "node:test";
import assert from "node:assert/strict";
import { hasGrantedModule, parseModuleAccess } from "../src/lib/module-access";

test("aceita acesso total em formato simples ou JSON", () => {
  assert.deepEqual(parseModuleAccess("all"), ["all"]);
  assert.deepEqual(parseModuleAccess('["all"]'), ["all"]);
  assert.equal(hasGrantedModule("all", "financeiro"), true);
  assert.equal(hasGrantedModule('["all"]', "gestao-grafica"), true);
});

test("mantem os modulos operacionais separados", () => {
  assert.equal(hasGrantedModule('["crm"]', "crm"), true);
  assert.equal(hasGrantedModule('["crm"]', "financeiro"), false);
  assert.equal(hasGrantedModule('["gestao-grafica"]', "crm"), false);
});
