import crypto from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { executeAssistantOperation, interpretFinancialOperation } from "@/lib/assistant-actions";
import { saveAssistantPlan } from "@/lib/ai-plan-store";
import { getAiRuntimeConfig } from "@/lib/ai";
import { classifyBankTransaction } from "@/lib/bank-classification";

export const dynamic = "force-dynamic";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream"
]);
const maxSizeBytes = 12 * 1024 * 1024;

function normalize(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseBrMoney(value: string) {
  const raw = String(value || "").trim();
  const negative = /^-/.test(raw) || /\b(enviado|debito|saida|pagamento)\b/i.test(raw);
  const amount = Number(raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return 0;
  return negative ? -Math.abs(amount) : amount;
}

function parseBrDate(value: string) {
  const match = String(value || "").match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) return new Date();
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return new Date(Date.UTC(Number(year), Number(match[2]) - 1, Number(match[1]), 12));
}

function classifyStatement(description: string, amountCents: number) {
  const text = normalize(description).toUpperCase();
  let paymentMethod = "";
  if (/\bPIX\b/.test(text)) paymentMethod = "Pix";
  else if (/TED|DOC|TRANSFER|TRANSF/.test(text)) paymentMethod = "Transferencia";
  else if (/BOLETO|TITULO|COD BARRAS/.test(text)) paymentMethod = "Boleto";
  else if (/CARTAO|CREDITO|DEBITO/.test(text)) paymentMethod = /CREDITO/.test(text) ? "Credito" : "Debito";

  if (/FACEBK|FACEBOOK|META|GOOGLE ADS|INSTAGRAM ADS|TIKTOK/.test(text)) return { category: "Marketing e anuncios", paymentMethod };
  if (/CANVA|OPENAI|CHATGPT|CAPCUT|HOSTINGER|DOMINIO|ADOBE/.test(text)) return { category: "Ferramentas e sistemas", paymentMethod };
  if (/MEI|DAS|DARF|SIMPLES|IMPOSTO|RECEITA FEDERAL/.test(text)) return { category: "Impostos e taxas", paymentMethod };
  if (/TARIFA|IOF|JUROS|ANUIDADE|CESTA/.test(text)) return { category: "Tarifas bancarias", paymentMethod };
  if (/PIX|TED|DOC|TRANSFER|TRANSF/.test(text)) return { category: amountCents >= 0 ? "Entrada a conferir" : "Saida a conferir", paymentMethod: paymentMethod || "Transferencia" };
  return { category: amountCents >= 0 ? "Entrada a conferir" : "A conferir", paymentMethod };
}

function looksLikeStatement(text: string) {
  const clean = normalize(text);
  const dateCount = (clean.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g) || []).length;
  const moneyCount = (clean.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g) || []).length;
  return dateCount >= 2 && moneyCount >= 2 && /(extrato|saldo|historico|hist[oó]rico|documento|pix enviado|pix recebido|periodo|per[ií]odo|santander|aplicativo)/i.test(text);
}

function compactStatementDescription(value: string) {
  return String(value || "")
    .replace(/\b(Data\/Hora|Saldo disponivel para uso|Saldo disponível para uso|Historico|Histórico|Documento|Saldo|Conta|Ag[eê]ncia|Aplicativo Santander Empresas|Periodo|Período)\b/gi, " ")
    .replace(/\b\d{1,2}h\d{2}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

type ParsedBankRow = {
  tenantId: string;
  batchId: string;
  date: Date;
  description: string;
  amountCents: number;
  direction: string;
  accountName: string;
  categorySuggestion: string;
  categorySuggestionSource: string;
  suggestionConfidence: number | null;
  counterpartyName: string | null;
  counterpartyDocument: string | null;
  paymentMethod: string;
  fingerprint: string;
  status: string;
  notes: string;
};

function parsedBankRow(input: { tenantId: string; batchId: string; accountName: string; dateText: string; description: string; amount: number; source: string }) {
  const amountCents = Math.round(input.amount * 100);
  if (!amountCents) return null;
  const date = parseBrDate(input.dateText);
  const direction = amountCents >= 0 ? "IN" : "OUT";
  const description = compactStatementDescription(input.description) || "Movimentacao importada";
  if (/saldo|total|disponivel/i.test(description)) return null;
  const fingerprint = crypto
    .createHash("sha256")
    .update([input.tenantId, date.toISOString().slice(0, 10), description, amountCents].join("|"))
    .digest("hex");
  const classification = classifyStatement(description, amountCents);
  return {
    tenantId: input.tenantId,
    batchId: input.batchId,
    date,
    description,
    amountCents: Math.abs(amountCents),
    direction,
    accountName: input.accountName,
    categorySuggestion: classification.category,
    categorySuggestionSource: "Regra do sistema",
    suggestionConfidence: 0.55,
    counterpartyName: null,
    counterpartyDocument: null,
    paymentMethod: classification.paymentMethod,
    fingerprint,
    status: "POSTED",
    notes: `Extraido de ${input.source} pela IA. Revisar e conciliar antes de confirmar como fluxo definitivo.`
  } satisfies ParsedBankRow;
}

function cleanSantanderText(text: string) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\bAplicativo Santander Empresas\b/gi, " ")
    .replace(/\bData\/Hora:.*?(?=Saldo dispon|Data Hist|Pix|Compra|Pagamento|Transfer|TED|DOC|Boleto|Tarifa|$)/gi, " ")
    .replace(/\bData Hist[oó]rico Documento Valor \(R\$\) Saldo \(R\$\)/gi, " ")
    .replace(/\b\d{1,2}\/\d{1,2}\b(?!\/)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSantanderStatement(text: string) {
  return /Santander Empresas/i.test(text) && /(Valor \(R\$\)|Saldo \(R\$\)|Pix Recebido|Pix Enviado)/i.test(text);
}

function parseSantanderStatementText(text: string, tenantId: string, batchId: string, accountName: string) {
  const rows: ParsedBankRow[] = [];
  const seen = new Set<string>();
  let pendingPrefix = "";
  const stopPattern = /\b(?:Saldo de ContaMax|Saldo Dispon[ií]vel|Posi[cç][aã]o em|Entenda a composi[cç][aã]o|Central de Atendimento|Ouvidoria)\b/i;
  const startsWithMovement = /^(Pix|Compra|Pagamento|Transfer[eê]ncia|TED|DOC|Boleto|Tarifa|Mensalidade|Saque|Dep[oó]sito)\b/i;
  const lines = String(text || "").split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopPattern.test(line)) break;
    if (/^\d+\/\d+$/.test(line)) continue;
    if (/Data\/Hora|Saldo dispon|Data Hist|Valor \(R\$\)|Ag[eê]ncia|Conta:|Per[ií]odos?:/i.test(line)) continue;
    const dateMatch = line.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
    if (!dateMatch) {
      if (startsWithMovement.test(line)) pendingPrefix = line;
      continue;
    }
    const dateText = dateMatch[0];
    const dateIndex = dateMatch.index || 0;
    const beforeDate = line.slice(0, dateIndex).trim();
    const afterDate = line.slice(dateIndex + dateText.length).trim();
    const moneyMatches = [...afterDate.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g)];
    if (!moneyMatches.length) continue;
    const amountMatch = moneyMatches[0];
    const amount = parseBrMoney(amountMatch[0]);
    if (!amount) continue;
    const prefix = beforeDate || pendingPrefix;
    const inlineDescription = afterDate.slice(0, amountMatch.index || 0).replace(/\b\d{5,}\b/g, " ").trim();
    const afterAmount = afterDate.slice((amountMatch.index || 0) + amountMatch[0].length).trim();
    const balanceMatch = afterAmount.match(/^-?\d{1,3}(?:\.\d{3})*,\d{2}|^-?\d+,\d{2}/);
    const suffix = balanceMatch ? afterAmount.slice(balanceMatch[0].length).trim() : afterAmount;
    const nextSuffixes: string[] = [];
    while (lines[index + 1] && !/^\d+\/\d+$/.test(lines[index + 1]) && !/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(lines[index + 1]) && !startsWithMovement.test(lines[index + 1]) && !stopPattern.test(lines[index + 1])) {
      nextSuffixes.push(lines[index + 1]);
      index += 1;
    }
    const description = [prefix, inlineDescription, suffix && !startsWithMovement.test(suffix) && !stopPattern.test(suffix) ? suffix : "", ...nextSuffixes]
      .filter(Boolean)
      .join(" ")
      .replace(/\b\d{5,}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    pendingPrefix = startsWithMovement.test(suffix) ? suffix : "";
    const row = parsedBankRow({ tenantId, batchId, accountName, dateText, description, amount, source: "PDF Santander PJ" });
    if (row && !seen.has(row.fingerprint)) {
      seen.add(row.fingerprint);
      rows.push(row);
    }
  }
  return rows;
}

function parseStatementText(text: string, tenantId: string, batchId: string, accountName: string) {
  if (isSantanderStatement(text)) return parseSantanderStatementText(text, tenantId, batchId, accountName);
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const pattern = /((?:Pix|TED|DOC|Transfer[eê]ncia|Boleto|Tarifa|Compra|Pagamento|Recebido|Enviado)[^]*?)(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})/gi;
  const rows: Array<{
    tenantId: string;
    batchId: string;
    date: Date;
    description: string;
    amountCents: number;
    direction: string;
    accountName: string;
    categorySuggestion: string;
    categorySuggestionSource: string;
    suggestionConfidence: number | null;
    counterpartyName: string | null;
    counterpartyDocument: string | null;
    paymentMethod: string;
    fingerprint: string;
    status: string;
    notes: string;
  }> = [];
  const seen = new Set<string>();
  for (const match of normalized.matchAll(pattern)) {
    const rawDescription = compactStatementDescription(match[1]);
    if (!rawDescription || /saldo dispon/i.test(rawDescription)) continue;
    const amount = parseBrMoney(match[3]);
    if (!amount) continue;
    const amountCents = Math.round(amount * 100);
    const date = parseBrDate(match[2]);
    const direction = amountCents >= 0 ? "IN" : "OUT";
    const description = rawDescription.replace(/\b(Data|Hora|Documento|R\$)\b/gi, "").trim() || "Movimentacao importada";
    const fingerprint = crypto
      .createHash("sha256")
      .update([tenantId, date.toISOString().slice(0, 10), description, amountCents].join("|"))
      .digest("hex");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const classification = classifyStatement(description, amountCents);
    rows.push({
      tenantId,
      batchId,
      date,
      description,
      amountCents: Math.abs(amountCents),
      direction,
      accountName,
      categorySuggestion: classification.category,
      categorySuggestionSource: "Regra do sistema",
      suggestionConfidence: 0.55,
      counterpartyName: null,
      counterpartyDocument: null,
      paymentMethod: classification.paymentMethod,
      fingerprint,
      status: "POSTED",
      notes: "Extraido de anexo pela IA. Revisar e conciliar antes de confirmar como fluxo definitivo."
    });
  }
  if (!rows.length) {
    for (const line of String(text || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      const dateMatch = line.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b/);
      const moneyMatches = [...line.matchAll(/-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?|-?\d+[,.]\d{2}/g)];
      if (!dateMatch || !moneyMatches.length) continue;
      const moneyAfterDate = moneyMatches.filter((match) => (match.index || 0) > (dateMatch.index || 0));
      const moneyMatch = moneyAfterDate[0] || moneyMatches[0];
      const amount = parseBrMoney(moneyMatch[0]);
      if (!amount) continue;
      const amountCents = Math.round(amount * 100);
      const date = parseBrDate(dateMatch[0]);
      let description = line.replace(dateMatch[0], "");
      for (const money of moneyMatches) description = description.replace(money[0], "");
      description = compactStatementDescription(description.replace(/[;,|]+/g, " ")) || "Movimentacao importada";
      if (/saldo|total|disponivel/i.test(description)) continue;
      const fingerprint = crypto
        .createHash("sha256")
        .update([tenantId, date.toISOString().slice(0, 10), description, amountCents].join("|"))
        .digest("hex");
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const classification = classifyStatement(description, amountCents);
      rows.push({
        tenantId,
        batchId,
        date,
        description,
        amountCents: Math.abs(amountCents),
        direction: amountCents >= 0 ? "IN" : "OUT",
        accountName,
        categorySuggestion: classification.category,
        categorySuggestionSource: "Regra do sistema",
        suggestionConfidence: 0.55,
        counterpartyName: null,
        counterpartyDocument: null,
        paymentMethod: classification.paymentMethod,
        fingerprint,
        status: "POSTED",
        notes: "Extraido de anexo pela IA. Revisar e conciliar antes de confirmar como fluxo definitivo."
      });
    }
  }
  return rows;
}

function decodeBuffer(bytes: Buffer) {
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("�")) text = new TextDecoder("latin1").decode(bytes);
  return text;
}

function cleanCell(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function parseAmount(value: unknown) {
  const raw = cleanCell(value);
  const negative = /^-|\((.*)\)|\b(D|DEB|DEBITO|DÉBITO)\b/i.test(raw);
  const amount = Number(raw.replace(/\s/g, "").replace(/R\$/i, "").replace(/[()]/g, "").replace(/[A-Za-z]/g, "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount)) return 0;
  return negative ? -Math.abs(amount) : amount;
}

function parseFlexibleDate(value: unknown) {
  const text = cleanCell(value);
  const br = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return new Date(Date.UTC(Number(year), Number(br[2]) - 1, Number(br[1]), 12));
  }
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function rowValue(row: Record<string, unknown>, candidates: string[]) {
  const found = Object.keys(row).find((key) => {
    const normalized = normalize(key);
    return candidates.some((candidate) => normalized.includes(normalize(candidate)));
  });
  return found ? row[found] : "";
}

function rowsToStatementText(rows: Array<Record<string, unknown>>) {
  const lines = [];
  for (const row of rows) {
    const values = Object.values(row).map(cleanCell).filter(Boolean);
    if (!values.length) continue;
    const dateValue = rowValue(row, ["data", "dt", "movimento", "lancamento"]) || values.find((value) => parseFlexibleDate(value));
    const date = parseFlexibleDate(dateValue);
    if (!date) continue;
    const description =
      rowValue(row, ["descricao", "descr", "historico", "hist", "lancamento", "detalhe", "memo", "nome"]) ||
      values.find((value) => !parseFlexibleDate(value) && !/\d+[,.]\d{2}/.test(value)) ||
      "Movimentacao importada";
    const signed = rowValue(row, ["valor", "amount", "quantia", "vlr", "movimentacao"]);
    const credit = rowValue(row, ["credito", "crédito", "entrada", "receita"]);
    const debit = rowValue(row, ["debito", "débito", "saida", "saída", "despesa"]);
    let amount = signed ? parseAmount(signed) : Math.abs(parseAmount(credit)) - Math.abs(parseAmount(debit));
    if (!amount) {
      const money = values.find((value) => /-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?|-?\d+[,.]\d{2}/.test(value));
      amount = parseAmount(money);
    }
    if (!amount) continue;
    lines.push(`${description} ${date.toLocaleDateString("pt-BR")} ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }
  return lines.join("\n");
}

function structuredFileToStatementText(filename: string, mimeType: string, bytes: Buffer) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".ofx" || ext === ".qfx") {
    const text = decodeBuffer(bytes).replace(/\r/g, "");
    const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi)].map((match) => match[1]);
    return blocks.map((block) => {
      const tag = (name: string) => block.match(new RegExp(`<${name}>([^<\\r\\n]+)`, "i"))?.[1]?.trim() || "";
      const date = tag("DTPOSTED").replace(/^(\d{4})(\d{2})(\d{2}).*/, "$3/$2/$1");
      const amount = Number(tag("TRNAMT").replace(",", "."));
      const description = [tag("NAME"), tag("PAYEE"), tag("MEMO"), tag("TRNTYPE")].filter(Boolean).join(" ");
      return `${description || "Lancamento OFX"} ${date} ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    }).join("\n");
  }
  if (ext === ".xlsx" || ext === ".xls" || mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    if (rows.length) return rowsToStatementText(rows);
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
    return matrix.map((row) => row.map(cleanCell).join(";")).join("\n");
  }
  if (ext === ".csv" || mimeType.includes("csv") || mimeType === "text/plain" || mimeType === "application/octet-stream") {
    const csv = decodeBuffer(bytes);
    const delimiter = ((csv.match(/;/g)?.length || 0) >= (csv.match(/,/g)?.length || 0)) ? ";" : ",";
    const parsed = Papa.parse<Record<string, unknown>>(csv, { header: true, skipEmptyLines: true, delimiter, transformHeader: (header) => header.trim() });
    if (parsed.data.length && Object.keys(parsed.data[0] || {}).length > 1) return rowsToStatementText(parsed.data);
    return csv;
  }
  return "";
}

async function importStatementFromAttachment(params: {
  tenantId: string;
  filename: string;
  text: string;
  accountName?: string;
  userId?: string;
}) {
  const accountName = params.accountName || "PJ";
  const fileHash = crypto.createHash("sha256").update(`${params.filename}|${params.text}`).digest("hex");
  const batch = await prisma.bankImportBatch.upsert({
    where: { tenantId_fileHash: { tenantId: params.tenantId, fileHash } },
    update: { filename: params.filename, accountName, status: "IMPORTED" },
    create: {
      tenantId: params.tenantId,
      filename: params.filename,
      fileHash,
      accountName,
      status: "IMPORTED",
      notes: "Importado automaticamente a partir de anexo enviado para a IA."
    }
  });
  const parsedRows = parseStatementText(params.text, params.tenantId, batch.id, accountName);
  for (const row of parsedRows) {
    const classification = await classifyBankTransaction({
      tenantId: params.tenantId,
      userId: params.userId,
      description: row.description,
      direction: row.direction as "IN" | "OUT",
      amountCents: row.amountCents
    });
    row.categorySuggestion = classification.category || row.categorySuggestion;
    row.paymentMethod = classification.paymentMethod || row.paymentMethod;
    row.categorySuggestionSource = classification.source;
    row.suggestionConfidence = classification.confidence;
    row.counterpartyName = classification.counterpartyName || null;
    row.counterpartyDocument = classification.counterpartyDocument || null;
    row.notes = [row.notes, `Sugestao: ${classification.source}. ${classification.reason}`].filter(Boolean).join(" ");
  }
  let inserted = 0;
  let duplicates = 0;
  for (const row of parsedRows) {
    const exists = await prisma.bankTransaction.findUnique({
      where: { tenantId_fingerprint: { tenantId: params.tenantId, fingerprint: row.fingerprint } },
      select: { id: true }
    });
    if (exists) {
      duplicates += 1;
      continue;
    }
    await prisma.bankTransaction.create({ data: row });
    inserted += 1;
  }
  const totalInCents = parsedRows.filter((row) => row.direction === "IN").reduce((sum, row) => sum + row.amountCents, 0);
  const totalOutCents = parsedRows.filter((row) => row.direction === "OUT").reduce((sum, row) => sum + row.amountCents, 0);
  await prisma.bankImportBatch.update({
    where: { id: batch.id },
    data: {
      totalRows: parsedRows.length,
      insertedRows: inserted,
      duplicateRows: duplicates,
      totalInCents,
      totalOutCents,
      status: "IMPORTED"
    }
  });
  return { batchId: batch.id, rows: parsedRows, inserted, duplicates, totalInCents, totalOutCents };
}

function safeExt(filename: string, mimeType: string) {
  const ext = path.extname(filename).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".pdf", ".csv", ".xlsx", ".xls", ".ofx", ".qfx"].includes(ext)) return ext;
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return ".xlsx";
  if (mimeType.includes("csv")) return ".csv";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

async function extractPdfText(buffer: Buffer) {
  const PDFParser = (await import("pdf2json")).default;
  const parser = new PDFParser(null, true) as {
    on: (event: string, callback: (data: any) => void) => void;
    parseBuffer: (buffer: Buffer) => void;
    destroy?: () => void;
  };

  return new Promise<string>((resolve) => {
    parser.on("pdfParser_dataError", () => resolve(""));
    parser.on("pdfParser_dataReady", (data) => {
      try {
        const pages = data?.Pages || [];
        const lines = pages.flatMap((page: any) => {
          const byY = new Map<string, Array<{ x: number; text: string }>>();
          for (const textItem of page.Texts || []) {
            const y = String(Math.round(Number(textItem.y || 0) * 10));
            const text = (textItem.R || [])
              .map((run: any) => {
                try {
                  return decodeURIComponent(run.T || "");
                } catch {
                  return run.T || "";
                }
              })
              .join("");
            if (!text.trim()) continue;
            const items = byY.get(y) || [];
            items.push({ x: Number(textItem.x || 0), text });
            byY.set(y, items);
          }
          return [...byY.entries()]
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([, items]) => items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "));
        });
        resolve(lines.join("\n").replace(/\s+\n/g, "\n").trim());
      } catch {
        resolve("");
      } finally {
        parser.destroy?.();
      }
    });
    parser.parseBuffer(buffer);
  });
}

function money(value: any) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? `R$ ${amount.toFixed(2)}` : "nao identificado";
}

function readableOperation(operation: any) {
  if (!operation || operation.action === "none") {
    return [
      "Li o anexo, mas nao encontrei dados suficientes para registrar com seguranca.",
      operation?.answer ? `\nResumo da leitura: ${operation.answer}` : "",
      "Envie uma foto mais nitida ou diga o valor, data e se foi entrada ou saida."
    ].filter(Boolean).join("\n\n");
  }
  const label =
    operation.action === "create_payable" ? "CONTA A PAGAR IDENTIFICADA" :
    operation.action === "create_receivable" ? "CONTA A RECEBER IDENTIFICADA" :
    operation.action === "update_initial_balance" ? "SALDO IDENTIFICADO" :
    "LANCAMENTO IDENTIFICADO";
  const type =
    operation.action === "create_payable" ? "Conta a pagar" :
    operation.action === "create_receivable" ? "Conta a receber" :
    operation.type === "entrada" ? "Entrada" :
    operation.type === "saida" ? "Saida" :
    operation.action;
  return [
    label,
    `Tipo: ${type}`,
    `Descricao: ${operation.description || operation.establishmentName || "nao identificada"}`,
    `Valor: ${money(operation.amount)}`,
    `Data: ${operation.date || "nao identificada"}`,
    operation.dueDate ? `Vencimento: ${operation.dueDate}` : "",
    `Categoria: ${operation.category || "A conferir"}`,
    `Forma de pagamento: ${operation.paymentMethod || "nao identificada"}`,
    `Conta: ${operation.account || "nao identificada"}`,
    operation.establishmentName ? `Estabelecimento/beneficiario: ${operation.establishmentName}` : "",
    operation.document ? `Documento: ${operation.document}` : "",
    operation.notes ? `Observacoes: ${operation.notes}` : "",
    "",
    "Confirma o registro?"
  ].filter((line) => line !== "").join("\n");
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const form = await request.formData();
  const file = form.get("file");
  const message = String(form.get("message") || "Leia este anexo e registre o lancamento financeiro se houver valor claro.").trim();
  const accountName = String(form.get("account") || "PJ").trim() || "PJ";

  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo obrigatorio." }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  const allowedExt = [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".csv", ".xlsx", ".xls", ".ofx", ".qfx"];
  if (!allowedTypes.has(file.type) && !allowedExt.includes(ext)) {
    return NextResponse.json({ error: "Envie imagem, PDF, CSV, XLSX ou OFX." }, { status: 400 });
  }
  if (file.size > maxSizeBytes) return NextResponse.json({ error: "Arquivo acima de 12MB." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = `${crypto.randomUUID()}${safeExt(file.name, file.type)}`;
  const dir = path.join(process.cwd(), "data", "uploads", user.tenantId);
  const storagePath = path.join(dir, filename);
  await mkdir(dir, { recursive: true });
  await writeFile(storagePath, bytes);

  const attachment = await prisma.attachment.create({
    data: {
      tenantId: user.tenantId,
      filename,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storagePath,
      linkedModel: "assistant",
      linkedId: null,
      createdById: user.id
    }
  });

  await prisma.assistantMessage.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      role: "user",
      content: `${message}\n\n[Anexo enviado: ${file.name}]`,
      metadata: JSON.stringify({ attachmentId: attachment.id, mimeType: file.type })
    }
  });

  const structuredText = structuredFileToStatementText(file.name, file.type, bytes);
  const extractedText = structuredText || (file.type === "application/pdf" ? await extractPdfText(bytes) : "");
  const shouldUseVision = file.type.startsWith("image/") || (file.type === "application/pdf" && extractedText.length < 30);

  if (extractedText && (structuredText || looksLikeStatement(extractedText))) {
    const statementImport = await importStatementFromAttachment({
      tenantId: user.tenantId,
      filename: file.name,
      text: extractedText,
      accountName,
      userId: user.id
    });
    const preview = statementImport.rows.slice(0, 8).map((row) => {
      const sign = row.direction === "IN" ? "+" : "-";
      return `${row.date.toISOString().slice(0, 10)} | ${sign}R$ ${(row.amountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | ${row.paymentMethod || "Forma a conferir"} | ${row.categorySuggestion || "A conferir"} | ${row.description}`;
    });
    const answer = [
      "EXTRATO IDENTIFICADO",
      `Importei ${statementImport.inserted} movimentacao(oes) para revisao e conciliacao.`,
      statementImport.duplicates ? `${statementImport.duplicates} item(ns) ja existiam e foram ignorados como duplicidade.` : "",
      `Entradas detectadas: R$ ${(statementImport.totalInCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `Saidas detectadas: R$ ${(statementImport.totalOutCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `Conta/carteira do extrato: ${accountName}`,
      "",
      "Previa:",
      preview.join("\n"),
      "",
      "Esses itens ficaram em Conciliacao/Importacao para voce revisar, categorizar e confirmar. Nao criei uma conta a pagar unica porque o anexo tem varias movimentacoes."
    ].filter(Boolean).join("\n");
    const assistantMessage = await prisma.assistantMessage.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        role: "assistant",
        content: answer,
        metadata: JSON.stringify({ attachmentId: attachment.id, statementImport, extractedTextLength: extractedText.length })
      }
    });
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "ai_import_statement_attachment",
      entity: "bankImportBatches",
      entityId: statementImport.batchId,
      request,
      metadata: { originalName: file.name, inserted: statementImport.inserted, duplicates: statementImport.duplicates }
    });
    return NextResponse.json({
      answer,
      message: assistantMessage,
      attachment,
      statementImport: {
        batchId: statementImport.batchId,
        inserted: statementImport.inserted,
        duplicates: statementImport.duplicates,
        preview: statementImport.rows.slice(0, 20)
      },
      diagnostics: { extractedTextLength: extractedText.length, usedVision: false, mode: "statement" }
    });
  }

  const interpreted = await interpretFinancialOperation({
    tenantId: user.tenantId,
    userId: user.id,
    tenantKind: user.tenant.kind,
    message,
    attachmentText: extractedText,
    attachmentBase64: shouldUseVision ? bytes.toString("base64") : undefined,
    attachmentMimeType: shouldUseVision ? file.type : undefined
  });

  const hasPendingAction =
    interpreted.operation?.action &&
    interpreted.operation.action !== "none" &&
    interpreted.operation.shouldExecute &&
    Number(interpreted.operation.confidence || 0) >= 0.55;
  const runtime = await getAiRuntimeConfig();
  const pendingPlan = hasPendingAction
    ? await saveAssistantPlan({
        tenantId: user.tenantId,
        userId: user.id,
        userRole: user.role,
        message,
        operation: interpreted.operation,
        autoExecute: runtime.autoExecute,
        conversationId: attachment.id
      })
    : null;

  if (hasPendingAction && runtime.autoExecute) {
    const actionResult = await executeAssistantOperation({
      tenantId: user.tenantId,
      tenantKind: user.tenant.kind,
      userId: user.id,
      message,
      operation: interpreted.operation,
      enrichment: interpreted.enrichment,
      attachmentId: attachment.id,
      request
    });
    const answer = `Li o anexo e salvei automaticamente porque a execucao automatica esta ativa.\n\n${actionResult.message}`;
    const assistantMessage = await prisma.assistantMessage.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        role: "assistant",
        content: answer,
        metadata: JSON.stringify({ attachmentId: attachment.id, actionResult, autoExecuted: true, extractedTextLength: extractedText.length, interpreted })
      }
    });
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "ai_auto_analyze_attachment",
      entity: "attachments",
      entityId: attachment.id,
      request,
      metadata: { originalName: file.name, actionResult, extractedTextLength: extractedText.length }
    });
    return NextResponse.json({
      answer,
      message: assistantMessage,
      attachment,
      actionResult,
      pendingPlanId: pendingPlan?.record.id || null,
      enrichment: interpreted.enrichment,
      analysis: interpreted.operation,
      diagnostics: { extractedTextLength: extractedText.length, usedVision: shouldUseVision }
    });
  }

  const answer = hasPendingAction
    ? readableOperation(interpreted.operation)
    : readableOperation(interpreted.operation);

  const assistantMessage = await prisma.assistantMessage.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      role: "assistant",
      content: answer,
      metadata: JSON.stringify({ attachmentId: attachment.id, pendingAction: hasPendingAction ? interpreted.operation : null, extractedTextLength: extractedText.length, interpreted })
    }
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "ai_analyze_attachment",
    entity: "attachments",
    entityId: attachment.id,
    request,
    metadata: { originalName: file.name, pendingAction: hasPendingAction ? interpreted.operation : null, extractedTextLength: extractedText.length }
  });

  return NextResponse.json({
    answer,
    message: assistantMessage,
    attachment,
    pendingAction: hasPendingAction ? interpreted.operation : null,
    pendingPlanId: pendingPlan?.record.id || null,
    enrichment: interpreted.enrichment,
    analysis: interpreted.operation,
    diagnostics: { extractedTextLength: extractedText.length, usedVision: shouldUseVision }
  });
}
