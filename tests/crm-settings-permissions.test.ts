import test from "node:test";
import assert from "node:assert/strict";
import { canManageCrmSettings } from "../src/lib/crm";

test("libera configuracoes do CRM somente para perfis autorizados", () => {
  assert.equal(canManageCrmSettings({ role: "user", moduleAccess: '["crm"]' }), false);
  assert.equal(canManageCrmSettings({ role: "user", moduleAccess: '["crm","crm-config"]' }), true);
  assert.equal(canManageCrmSettings({ role: "admin", moduleAccess: '["crm"]' }), true);
  assert.equal(canManageCrmSettings({ role: "superadmin", moduleAccess: '["crm"]' }), true);
});
