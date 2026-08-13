import test from "node:test";
import assert from "node:assert/strict";
import { defaultGraphicRoleForUser, graphicRoleSettingKey, hasGraphicPermission, parseGraphicRole } from "../src/lib/graphic";

test("normaliza papeis operacionais validos da grafica", () => {
  assert.equal(parseGraphicRole("owner_admin"), "OWNER_ADMIN");
  assert.equal(parseGraphicRole("PRODUCTION"), "PRODUCTION");
  assert.equal(parseGraphicRole("finance"), "FINANCE");
  assert.equal(parseGraphicRole("vendas"), null);
  assert.equal(graphicRoleSettingKey("user-1"), "userRole:user-1");
});

test("define fallback seguro pelo papel global do usuario", () => {
  assert.equal(defaultGraphicRoleForUser({ role: "superadmin" }), "OWNER_ADMIN");
  assert.equal(defaultGraphicRoleForUser({ role: "admin" }), "OWNER_ADMIN");
  assert.equal(defaultGraphicRoleForUser({ role: "user" }), "SALES");
});

test("restringe acoes criticas por perfil operacional", () => {
  assert.equal(hasGraphicPermission("OWNER_ADMIN", "settings:manage"), true);
  assert.equal(hasGraphicPermission("SALES_MANAGER", "quote:approve"), true);
  assert.equal(hasGraphicPermission("SALES", "quote:approve"), false);
  assert.equal(hasGraphicPermission("PRODUCTION", "production:update"), true);
  assert.equal(hasGraphicPermission("PRODUCTION", "receivable:update"), false);
  assert.equal(hasGraphicPermission("FINANCE", "receivable:update"), true);
  assert.equal(hasGraphicPermission("FINANCE", "production:update"), false);
  assert.equal(hasGraphicPermission("ADVISOR", "report:view"), true);
  assert.equal(hasGraphicPermission("ADVISOR", "quote:create"), false);
});
