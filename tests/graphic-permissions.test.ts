import test from "node:test";
import assert from "node:assert/strict";
import { defaultGraphicRoleForUser, graphicRoleSettingKey, hasGraphicPermission, parseGraphicRole } from "../src/lib/graphic";

test("normaliza papeis operacionais validos da grafica", () => {
  assert.equal(parseGraphicRole("owner_admin"), "GRAPHIC_OWNER");
  assert.equal(parseGraphicRole("PRODUCTION"), "GRAPHIC_OPERATIONS");
  assert.equal(parseGraphicRole("finance"), "GRAPHIC_ADMIN");
  assert.equal(parseGraphicRole("vendas"), null);
  assert.equal(graphicRoleSettingKey("user-1"), "userRole:user-1");
});

test("define fallback seguro pelo papel global do usuario", () => {
  assert.equal(defaultGraphicRoleForUser({ role: "superadmin" }), "GRAPHIC_OWNER");
  assert.equal(defaultGraphicRoleForUser({ role: "admin" }), "GRAPHIC_OWNER");
  assert.equal(defaultGraphicRoleForUser({ role: "user" }), "GRAPHIC_SALES");
});

test("restringe acoes criticas por perfil operacional", () => {
  assert.equal(hasGraphicPermission("GRAPHIC_OWNER", "settings:manage"), true);
  assert.equal(hasGraphicPermission("GRAPHIC_SALES", "quote:approve"), false);
  assert.equal(hasGraphicPermission("GRAPHIC_OPERATIONS", "production:update"), true);
  assert.equal(hasGraphicPermission("GRAPHIC_OPERATIONS", "receivable:update"), false);
  assert.equal(hasGraphicPermission("GRAPHIC_ADMIN", "receivable:update"), true);
  assert.equal(hasGraphicPermission("GRAPHIC_ADMIN", "production:update"), false);
  assert.equal(hasGraphicPermission("GRAPHIC_ADVISOR", "report:view"), true);
  assert.equal(hasGraphicPermission("GRAPHIC_ADVISOR", "quote:create"), false);
});
