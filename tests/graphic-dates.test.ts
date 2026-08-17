import test from "node:test";
import assert from "node:assert/strict";
import { dateOrNull } from "../src/lib/graphic";

test("datas sem horario preservam o dia comercial", () => {
  assert.equal(dateOrNull("2026-08-24")?.toISOString(), "2026-08-24T12:00:00.000Z");
  assert.equal(dateOrNull("invalida"), null);
});
