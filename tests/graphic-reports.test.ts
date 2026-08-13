import test from "node:test";
import assert from "node:assert/strict";
import { buildGraphicCsv, canAccessGraphicReport, csvEscape, formatGraphicReportValue, isGraphicReportModel } from "../src/lib/graphic-reports";

test("valida modelos de relatorio da grafica", () => {
  assert.equal(isGraphicReportModel("quotes"), true);
  assert.equal(isGraphicReportModel("receivables"), true);
  assert.equal(isGraphicReportModel("unknown"), false);
});

test("protege csv contra formula injection", () => {
  assert.equal(csvEscape("=IMPORTXML('x')"), "\"'=IMPORTXML('x')\"");
  assert.equal(csvEscape("+SUM(A1:A2)"), "\"'+SUM(A1:A2)\"");
  assert.equal(csvEscape("texto normal"), "\"texto normal\"");
});

test("gera csv com cabecalho e valores formatados", () => {
  const csv = buildGraphicCsv("quotes", [{
    number: 12,
    createdAt: new Date("2026-08-13T12:00:00Z"),
    clientName: "Cliente A",
    status: "APPROVED",
    validUntil: new Date("2026-08-20T12:00:00Z"),
    totalPrice: 1500,
    marginPercent: 32.5,
    approvalRequired: false
  }]);

  assert.match(csv, /Numero/);
  assert.match(csv, /Cliente A/);
  assert.match(csv, /R\$\s?1\.500,00/);
  assert.match(csv, /32\.5%/);
});

test("respeita permissao por perfil operacional", () => {
  assert.equal(canAccessGraphicReport("ADVISOR", "quotes"), true);
  assert.equal(canAccessGraphicReport("ADVISOR", "receivables"), false);
  assert.equal(canAccessGraphicReport("FINANCE", "receivables"), true);
  assert.equal(canAccessGraphicReport("SALES", "audit"), false);
  assert.equal(canAccessGraphicReport("OWNER_ADMIN", "audit"), true);
});

test("formata booleano e datas dos relatorios", () => {
  assert.equal(formatGraphicReportValue("approvalRequired", true), "Sim");
  assert.match(formatGraphicReportValue("createdAt", new Date("2026-08-13T12:00:00Z")), /13\/08\/2026/);
});
