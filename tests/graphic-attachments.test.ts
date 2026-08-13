import test from "node:test";
import assert from "node:assert/strict";
import { isActiveGraphicAttachment, isGraphicAttachmentModel, normalizeGraphicPurpose, safeGraphicAttachmentExt, validateGraphicAttachment } from "../src/lib/graphic-attachments";

test("valida vinculos permitidos para anexos da grafica", () => {
  assert.equal(isGraphicAttachmentModel("production"), true);
  assert.equal(isGraphicAttachmentModel("delivery"), true);
  assert.equal(isGraphicAttachmentModel("financeiro"), false);
});

test("normaliza finalidade de anexo", () => {
  assert.equal(normalizeGraphicPurpose("artwork"), "ARTWORK");
  assert.equal(normalizeGraphicPurpose("delivery_proof"), "DELIVERY_PROOF");
  assert.equal(normalizeGraphicPurpose("qualquer"), "OTHER");
});

test("protege tipo extensao e tamanho de anexo", () => {
  assert.equal(safeGraphicAttachmentExt("arte.jpeg", "image/jpeg"), ".jpg");
  assert.equal(safeGraphicAttachmentExt("prova.bin", "application/pdf"), ".pdf");
  assert.equal(validateGraphicAttachment({ name: "arte.png", type: "image/png", size: 1000 }), null);
  assert.match(validateGraphicAttachment({ name: "script.js", type: "text/javascript", size: 1000 }) || "", /PDF ou imagem/);
  assert.match(validateGraphicAttachment({ name: "vazio.pdf", type: "application/pdf", size: 0 }) || "", /vazio/);
  assert.match(validateGraphicAttachment({ name: "grande.pdf", type: "application/pdf", size: 11 * 1024 * 1024 }) || "", /10MB/);
});

test("identifica anexos ativos para manter exclusao logica", () => {
  assert.equal(isActiveGraphicAttachment("ACTIVE"), true);
  assert.equal(isActiveGraphicAttachment(undefined), true);
  assert.equal(isActiveGraphicAttachment("INACTIVE"), false);
});
