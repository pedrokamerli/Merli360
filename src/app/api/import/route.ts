import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import crypto from "crypto";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { slugHash } from "@/lib/format";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { classifyBankTransaction } from "@/lib/bank-classification";
import { askAi } from "@/lib/ai";

export const dynamic = "force-dynamic";

type StatementRow = Record<string, string>;
type ParsedTable = { rows: StatementRow[]; headers: string[] };
type ImportedRow = {
  date: Date;
  description: string;
  amount: number;
  type: "entrada" | "saida";
  category: string;
  subcategory: string;
  costCenter: string;
  account: string;
  status: string;
  paymentMethod: string;
  notes: string;
  source: string;
  importHash: string;
  clientId?: string;
  classificationSource?: string;
  suggestionConfidence?: number;
  counterpartyName?: string | null;
  counterpartyDocument?: string | null;
};

type AiClassification = {
  index: number;
  category?: string;
  subcategory?: string;
  costCenter?: string;
  paymentMethod?: string;
  contactName?: string;
  recurring?: boolean;
  recurrence?: string;
  confidence?: number;
  reason?: string;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function cents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeUpper(text: string) {
  return normalize(text).toUpperCase();
}

function parseAmount(value: string) {
  const raw = String(value ?? "").trim();
  const negative = /^\(.*\)$/.test(raw) || /(^-|[\s-](D|DEBITO|DÉBITO)$)/i.test(raw);
  const cleaned = raw
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/[()]/g, "")
    .replace(/[DC]$/i, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const amount = Number(cleaned || 0);
  return negative ? -Math.abs(amount) : amount;
}

function parseDate(value: string) {
  const raw = String(value ?? "").trim();
  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return new Date(Date.UTC(Number(year), Number(br[2]) - 1, Number(br[1]), 12));
  }
  const brInside = raw.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (brInside) {
    const year = brInside[3].length === 2 ? `20${brInside[3]}` : brInside[3];
    return new Date(Date.UTC(Number(year), Number(brInside[2]) - 1, Number(brInside[1]), 12));
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
  const excelSerial = Number(raw);
  if (!Number.isNaN(excelSerial) && excelSerial > 20000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + excelSerial * 86400000);
  }
  return new Date(raw);
}

function parseBankAmount(value: string) {
  const raw = String(value ?? "").trim();
  const normalizedRaw = normalize(raw);
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw) || /\b(d|deb|debito)\b/.test(normalizedRaw);
  const cleaned = raw
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/[()]/g, "")
    .replace(/(DEBITO|DÉBITO|CREDITO|CRÉDITO|DEB|CRE|[DC])$/i, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const amount = Number(cleaned || 0);
  return negative ? -Math.abs(amount) : amount;
}

function looksLikeDate(value: unknown) {
  return !Number.isNaN(parseDate(String(value ?? "")).getTime());
}

function isHeaderLike(cells: string[]) {
  const text = normalize(cells.join(" "));
  const hasDate = /(data|dt|movimento|lancamento)/.test(text);
  const hasDescription = /(descricao|historico|lancamento|detalhe|memo|nome)/.test(text);
  const hasAmount = /(valor|amount|credito|debito|entrada|saida|quantia|vlr|movimentacao)/.test(text);
  return [hasDate, hasDescription, hasAmount].filter(Boolean).length >= 2;
}

function cleanCell(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function uniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = cleanCell(header) || `Coluna ${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
}

function rowsFromMatrix(matrix: unknown[][]): ParsedTable {
  const cleaned = matrix
    .map((row) => row.map(cleanCell))
    .filter((row) => row.some((cell) => cell));
  if (!cleaned.length) return { rows: [], headers: [] };

  let headerIndex = cleaned.findIndex(isHeaderLike);
  if (headerIndex < 0) headerIndex = cleaned.findIndex((row) => row.some(looksLikeDate));
  if (headerIndex < 0) return { rows: [], headers: [] };

  const headerRow = isHeaderLike(cleaned[headerIndex])
    ? cleaned[headerIndex]
    : cleaned[headerIndex].map((_, index) => {
        if (index === 0) return "Data";
        if (index === 1) return "Descricao";
        if (index === cleaned[headerIndex].length - 1) return "Valor";
        return `Coluna ${index + 1}`;
      });
  const headers = uniqueHeaders(headerRow);
  const dataStart = isHeaderLike(cleaned[headerIndex]) ? headerIndex + 1 : headerIndex;
  const rows = cleaned.slice(dataStart).map((row) => {
    const item: StatementRow = {};
    headers.forEach((header, index) => {
      item[header] = row[index] ?? "";
    });
    return item;
  });
  return { rows, headers };
}

function categorize(description: string, amount: number) {
  const text = normalizeUpper(description);
  const isInput = amount >= 0;

  const hasPix = /\bPIX\b|PIXEMIT|PIXRECEB|PIX RECEB|PIX ENVI|PIX TRANSF|PIX TRANSFERENCIA/.test(text);
  const hasTransfer = /TRANSFER|TRANSF|TED|DOC|TEF|TRF|TRANSFERENCIA/.test(text);
  const hasCard = /CARTAO|CARD|MASTERCARD|VISA|ELO/.test(text);
  const hasCreditCard = /CREDITO|CRED\.|CARTAO CRED/.test(text);
  const hasDebitCard = /DEBITO|DEB\.|CARTAO DEB/.test(text);
  const hasBoleto = /BOLETO|CONVENIO|COD BARRAS|CODIGO DE BARRAS|TITULO/.test(text);

  let paymentMethod = "";
  if (hasPix) paymentMethod = "Pix";
  else if (hasTransfer) paymentMethod = "Transferencia";
  else if (hasBoleto) paymentMethod = "Boleto";
  else if (hasCreditCard) paymentMethod = "Credito";
  else if (hasDebitCard) paymentMethod = "Debito";
  else if (hasCard) paymentMethod = "Cartao";

  if ((hasPix || hasTransfer) && /(PEDRO|MERLI|TALLES|SIMOES|PROPRIA|MESMA TITULARIDADE|ENTRE CONTAS)/.test(text)) {
    return { category: "Transferencia propria", paymentMethod: paymentMethod || "Transferencia" };
  }

  if (/(FACEBK|FACEBOOK|META ADS|META PAY|(^|\s)FB(\s|$)|INSTAGRAM ADS|GOOGLE ADS|TIKTOK ADS)/.test(text)) {
    return { category: "Marketing e anuncios", paymentMethod: paymentMethod || (hasCard ? "Cartao" : "") };
  }
  if (/(CANVA|OPENAI|CHATGPT|CAPCUT|ADOBE|GOOGLE WORKSPACE|DOMINIO|HOSTINGER|HOSTGATOR|LOCAWEB|REGISTROBR|REGISTRO\.BR|MICROSOFT|APPLE\.COM\/BILL)/.test(text)) {
    return { category: "Ferramentas e sistemas", paymentMethod: paymentMethod || (hasCard ? "Cartao" : "") };
  }
  if (/(MEI|DAS|SIMPLES|DARF|IMPOSTO|INSS|RECEITA FEDERAL|PREFEITURA)/.test(text)) {
    return { category: "Impostos e taxas", paymentMethod: paymentMethod || (hasBoleto ? "Boleto" : "") };
  }
  if (/(IOF|TARIFA|CESTA|PACOTE SERVICOS|ANUIDADE|JUROS|MULTA|MANUT CONTA)/.test(text)) {
    return { category: "Tarifas bancarias", paymentMethod };
  }
  if (/(UBER|99|POSTO|COMBUSTIVEL|GASOLINA|ETANOL|SHELL|IPIRANGA|PETROBRAS)/.test(text)) {
    return { category: text.includes("UBER") || text.includes("99") ? "Transporte e frete" : "Combustivel", paymentMethod };
  }
  if (/(IFOOD|MERCADO|SUPERMERCADO|RESTAURANTE|PADARIA|LANCHONETE|ALIMENT)/.test(text)) {
    return { category: "Alimentacao", paymentMethod };
  }
  if (/(ENERGIA|ELEKTRO|CPFL|ENEL|CEMIG|COPEL)/.test(text)) return { category: "Energia", paymentMethod: paymentMethod || "Boleto" };
  if (/(AGUA|SABESP|SANEPAR|DAE)/.test(text)) return { category: "Agua", paymentMethod: paymentMethod || "Boleto" };
  if (/(INTERNET|VIVO|CLARO|TIM|OI|ALGAR|TELEFONE|CELULAR)/.test(text)) return { category: "Internet e telefone", paymentMethod: paymentMethod || "Boleto" };

  if (hasPix) return { category: isInput ? "Entrada a conferir" : "Saida a conferir", paymentMethod: "Pix" };
  if (hasTransfer) return { category: isInput ? "Entrada a conferir" : "Saida a conferir", paymentMethod: "Transferencia" };
  if (hasBoleto) return { category: isInput ? "Entrada a conferir" : "A conferir", paymentMethod: "Boleto" };
  if (hasCard) return { category: isInput ? "Entrada a conferir" : "A conferir", paymentMethod: paymentMethod || "Cartao" };

  return { category: isInput ? "Entrada a conferir" : "A conferir", paymentMethod };
}

function parseAiJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as { items?: AiClassification[] };
  } catch {
    return null;
  }
}

function recurringHint(row: ImportedRow, previous: Array<{ description: string; amount: number; date: Date }>) {
  const rowText = normalize(row.description);
  const similar = previous.filter((item) => {
    const amountClose = Math.abs(item.amount - row.amount) <= 2;
    const itemText = normalize(item.description);
    return amountClose && (itemText.includes(rowText.slice(0, 18)) || rowText.includes(itemText.slice(0, 18)));
  });
  if (similar.length >= 2) return "Possivel recorrencia: lancamento parecido encontrado em meses anteriores.";
  return "";
}

async function classifyWithAi(promptText: string) {
  try {
    const answer = await askAi(promptText, { json: true, timeoutMs: 18000 });
    return answer ? parseAiJson(answer) : null;
  } finally {
  }
}

async function enhanceWithAi<T extends ImportedRow>(rows: T[], tenantId: string, enabled: boolean): Promise<T[]> {
  if (!enabled || rows.length === 0) return rows;

  const [categories, clients, buyers, previousTransactions] = await Promise.all([
    prisma.category.findMany({ where: { tenantId }, select: { name: true, type: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.buyer.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      where: { tenantId },
      select: { description: true, amount: true, date: true },
      orderBy: { date: "desc" },
      take: 300
    })
  ]);

  const allowedCategories = new Set(categories.map((category) => category.name));
  const paymentMethods = new Set(["Pix", "Transferencia", "Boleto", "Credito", "Debito", "Cartao", "Dinheiro"]);
  const clientByName = new Map(clients.map((client) => [normalize(client.name), client]));
  const knownContacts = [...clients.map((client) => client.name), ...buyers.map((buyer) => buyer.name)];
  const rowsForAi = rows.slice(0, 80).map((row, index) => ({
    index,
    date: row.date.toISOString().slice(0, 10),
    description: row.description,
    amount: row.amount,
    type: row.type,
    currentCategory: row.category,
    currentPaymentMethod: row.paymentMethod
  }));

  const promptText =
    "Classifique lancamentos bancarios brasileiros para um sistema financeiro pequeno. " +
    "Use somente categorias existentes. Identifique forma de pagamento, possivel contato e recorrencia. " +
    "Retorne apenas JSON no formato {\"items\":[{\"index\":0,\"category\":\"...\",\"subcategory\":\"...\",\"costCenter\":\"...\",\"paymentMethod\":\"Pix\",\"contactName\":\"...\",\"recurring\":false,\"recurrence\":\"mensal\",\"confidence\":0.8,\"reason\":\"...\"}]}. " +
    "Nao invente valores. Se nao tiver certeza, mantenha categoria a conferir e confidence baixa.\n\n" +
    `Categorias permitidas: ${categories.map((category) => `${category.name} (${category.type})`).join(", ")}\n` +
    `Contatos conhecidos: ${knownContacts.join(", ") || "nenhum"}\n` +
    `Lancamentos: ${JSON.stringify(rowsForAi)}`;

  try {
    const parsed = await classifyWithAi(promptText);
    if (!parsed?.items?.length) return rows;

    const byIndex = new Map(parsed.items.map((item) => [item.index, item]));
    return rows.map((row, index) => {
      const suggestion = byIndex.get(index);
      const hint = recurringHint(row, previousTransactions);
      if (!suggestion) return hint ? { ...row, notes: `${row.notes} ${hint}` } : row;

      const confidence = Number(suggestion.confidence || 0);
      const category = suggestion.category && allowedCategories.has(suggestion.category) && confidence >= 0.45 ? suggestion.category : row.category;
      const paymentMethod = suggestion.paymentMethod && paymentMethods.has(suggestion.paymentMethod) ? suggestion.paymentMethod : row.paymentMethod;
      const matchedClient = suggestion.contactName ? clientByName.get(normalize(suggestion.contactName)) : null;
      const recurrenceText = suggestion.recurring ? `Recorrencia sugerida: ${suggestion.recurrence || "recorrente"}.` : "";
      const contactText = suggestion.contactName ? `Contato sugerido: ${suggestion.contactName}.` : "";
      const reasonText = suggestion.reason ? `IA: ${suggestion.reason}` : "IA: classificacao sugerida.";
      const notes = [row.notes, reasonText, contactText, recurrenceText, hint].filter(Boolean).join(" ");

      return {
        ...row,
        category,
        subcategory: suggestion.recurring ? "Recorrente" : suggestion.subcategory || row.subcategory,
        costCenter: suggestion.costCenter || row.costCenter,
        paymentMethod,
        clientId: matchedClient?.id || row.clientId,
        classificationSource: category !== row.category || paymentMethod !== row.paymentMethod ? "IA ChatGPT" : row.classificationSource,
        suggestionConfidence: Math.max(Number(row.suggestionConfidence || 0), confidence || 0),
        notes
      } as T;
    });
  } catch {
    return rows;
  }
}

async function enhanceWithLearning<T extends ImportedRow>(rows: T[], tenantId: string, userId: string): Promise<T[]> {
  const enhanced = [];
  for (const row of rows) {
    const classification = await classifyBankTransaction({
      tenantId,
      userId,
      description: row.description,
      direction: row.type === "entrada" ? "IN" : "OUT",
      amountCents: cents(row.amount)
    });
    enhanced.push({
      ...row,
      category: classification.category || row.category,
      paymentMethod: classification.paymentMethod || row.paymentMethod,
      costCenter: classification.costCenter || row.costCenter,
      classificationSource: classification.source,
      suggestionConfidence: classification.confidence,
      counterpartyName: classification.counterpartyName,
      counterpartyDocument: classification.counterpartyDocument,
      notes: [row.notes, `Sugestao: ${classification.source}. ${classification.reason}`].filter(Boolean).join(" ")
    });
  }
  return enhanced as T[];
}

function pick(row: StatementRow, candidates: string[]) {
  const found = Object.keys(row).find((key) => {
    const normalized = normalize(key);
    return candidates.some((candidate) => normalized.includes(normalize(candidate)));
  });
  return found ? row[found] : "";
}

function pickAmountValue(row: StatementRow) {
  const entrada = pick(row, ["entrada", "credito", "credit", "receita", "creditos"]);
  const saida = pick(row, ["saida", "debito", "debit", "despesa", "debitos"]);
  if (entrada || saida) {
    const credit = Math.abs(parseBankAmount(entrada));
    const debit = Math.abs(parseBankAmount(saida));
    const total = credit - debit;
    if (total) return total;
  }

  const signed = pick(row, ["valor assinado", "valor lancamento", "valor", "amount", "quantia", "vlr", "valor r$", "movimentacao"]) || "";
  if (signed) return parseBankAmount(signed);

  const moneyLike = Object.values(row)
    .map(String)
    .filter((value) => /(?:R\$\s*)?-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?\s*(?:D|C|DEB|CRE)?$/i.test(value.trim()) || /^-?\d+[,.]\d{2}\s*(?:D|C)?$/i.test(value.trim()));
  return moneyLike.length ? parseBankAmount(moneyLike[0]) : 0;
}
function decodeFile(buffer: ArrayBuffer) {
  let csv = new TextDecoder("utf-8").decode(buffer);
  if (csv.includes("�")) csv = new TextDecoder("latin1").decode(buffer);
  return csv;
}

function fileHash(buffer: ArrayBuffer) {
  return crypto.createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}

function guessDelimiter(csv: string) {
  const candidates = [";", ",", "\t"];
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20);
  let best = { delimiter: ";", score: -1 };
  for (const delimiter of candidates) {
    const counts = lines.map((line) => {
      const parsed = Papa.parse<string[]>(line, { header: false, delimiter, skipEmptyLines: true });
      return parsed.data[0]?.length || 0;
    });
    const useful = counts.filter((count) => count > 1);
    const mode = useful.length
      ? useful.sort((a, b) => counts.filter((count) => count === b).length - counts.filter((count) => count === a).length)[0]
      : 0;
    const consistency = counts.filter((count) => count === mode).length;
    const score = mode * 10 + consistency - counts.filter((count) => count === 1).length;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function rowFromFields(data: { dateText: string; description: string; amount: number; source: string }) {
  const date = parseDate(data.dateText);
  if (Number.isNaN(date.getTime())) return null;

  const description = String(data.description || "").replace(/\s+/g, " ").trim();
  if (!description) return null;

  const rule = categorize(description, data.amount);
  const absAmount = Math.abs(data.amount);
  if (!Number.isFinite(absAmount) || absAmount <= 0) return null;

  const importHash = slugHash([date.toISOString().slice(0, 10), description, absAmount]);

  return {
    date,
    description,
    amount: absAmount,
    type: data.amount >= 0 ? "entrada" : "saida",
    category: rule.category,
    subcategory: "Importado",
    costCenter: rule.category === "Anuncios" ? "Empresa" : "A classificar",
    account: "PJ",
    status: "conferencia",
    paymentMethod: rule.paymentMethod,
    notes: `Importado de ${data.source}. Conferir classificacao.`,
    source: `Importacao ${data.source}`,
    importHash
  } satisfies ImportedRow;
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

function transformSantanderPdfText(text: string) {
  const rows: ImportedRow[] = [];
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
    const amount = parseBankAmount(amountMatch[0]);
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

    const parsed = rowFromFields({
      dateText,
      description: description || "Lancamento Santander",
      amount,
      source: "PDF Santander PJ"
    });
    if (parsed) rows.push({
      ...parsed,
      notes: [parsed.notes, "Extraido por parser Santander PJ."].filter(Boolean).join(" ")
    });
  }

  return {
    rows,
    errors: [],
    headers: ["Data", "Historico", "Valor", "Saldo"],
    diagnostics: {
      mode: "pdf-santander-pj",
      sample: cleanSantanderText(text).slice(0, 1200),
      detectedDates: lines.filter((line) => /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(line)).length,
      parsedRows: rows.length
    }
  };
}

function transformTable(rows: StatementRow[], source: string, headers: string[] = []) {
  const transformedRows = rows
    .map((row) => {
      const dateText =
        pick(row, ["data lancamento", "data movimento", "data", "date", "dt"]) ||
        Object.values(row).find(looksLikeDate) ||
        "";
      const description =
        pick(row, ["descricao", "descr", "historico", "hist", "lancamento", "detalhe", "titulo", "nome", "memo"]) ||
        Object.values(row).find((value) => String(value).trim() && !looksLikeDate(value) && !/[+-]?\d+[,.]\d{2}/.test(String(value))) ||
        "";
      const amount = pickAmountValue(row);

      return rowFromFields({ dateText, description: String(description), amount, source });
    })
    .filter((row): row is ImportedRow => Boolean(row));

  return { rows: transformedRows, errors: [], headers };
}

function transformCsv(csv: string) {
  const delimiter = guessDelimiter(csv);
  const parsed = Papa.parse<string[]>(csv, {
    header: false,
    skipEmptyLines: true,
    delimiter,
    transform: (value) => String(value).replace(/^\uFEFF/, "").trim()
  });

  const table = rowsFromMatrix(parsed.data);
  const transformed = transformTable(table.rows, "CSV", table.headers);
  if (!transformed.rows.length) {
    const loose = transformLooseText(csv, "CSV");
    if (loose.rows.length) return { ...loose, errors: parsed.errors, diagnostics: { mode: "texto livre", sample: csv.slice(0, 1200), headers: table.headers } };
  }
  return { ...transformed, errors: parsed.errors, diagnostics: { mode: "tabela", sample: parsed.data.slice(0, 8), headers: table.headers } };
}

function transformXlsx(buffer: ArrayBuffer) {
  const workbook = XLSX.read(Buffer.from(buffer), { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const table = rowsFromMatrix(matrix);
  const transformed = transformTable(table.rows, "XLSX", table.headers);
  if (!transformed.rows.length) {
    const text = matrix.map((row) => row.map(cleanCell).join(" ")).join("\n");
    const loose = transformLooseText(text, "XLSX");
    if (loose.rows.length) return { ...loose, errors: [], diagnostics: { mode: "texto livre", sample: text.slice(0, 1200), headers: table.headers } };
  }
  return { ...transformed, diagnostics: { mode: "tabela", sample: matrix.slice(0, 8), headers: table.headers } };
}

function getTag(block: string, tag: string) {
  const paired = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (paired) return paired[1].trim();
  const open = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
  return open ? open[1].trim() : "";
}

function parseOfxDate(value: string) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return value;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseOfxAmount(value: string) {
  const cleaned = String(value || "").trim().replace(",", ".");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : parseBankAmount(value);
}

function transformOfx(text: string) {
  const normalized = text.replace(/\r/g, "");
  const blocks = [...normalized.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi)].map((match) => match[1]);
  const rows = blocks
    .map((block) => {
      const amount = parseOfxAmount(getTag(block, "TRNAMT"));
      const dateText = parseOfxDate(getTag(block, "DTPOSTED") || getTag(block, "DTUSER"));
      const description = [getTag(block, "NAME"), getTag(block, "PAYEE"), getTag(block, "MEMO"), getTag(block, "CHECKNUM"), getTag(block, "TRNTYPE")]
        .filter(Boolean)
        .join(" - ");
      const parsed = rowFromFields({ dateText, description: description || "Lancamento OFX", amount, source: "OFX" });
      if (!parsed) return null;
      const fitId = getTag(block, "FITID");
      return fitId ? { ...parsed, importHash: slugHash([fitId, parsed.date.toISOString().slice(0, 10), parsed.amount]) } : parsed;
    })
    .filter((row): row is ImportedRow => Boolean(row));
  return { rows, errors: [], headers: ["DTPOSTED", "TRNAMT", "NAME", "PAYEE", "MEMO", "FITID"], diagnostics: { mode: "ofx", sample: text.slice(0, 1200), blocks: blocks.length } };
}

function transformLooseText(text: string, source: string) {
  const datePattern = /\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/g;
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const dateMatches = [...normalizedText.matchAll(datePattern)];
  const segments = dateMatches.map((match, index) => {
    const start = match.index || 0;
    const end = dateMatches[index + 1]?.index ?? normalizedText.length;
    return normalizedText.slice(start, end).trim();
  });
  const rows: ImportedRow[] = [];
  for (const line of segments) {
    const dateMatch = line.match(datePattern);
    if (!dateMatch) continue;
    const moneyMatches = [...line.matchAll(/(?:R\$\s*)?-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?\s*(?:D|C|DEB|CRE)?|(?:R\$\s*)?-?\(?\d+,\d{2}\)?\s*(?:D|C|DEB|CRE)?/gi)];
    if (!moneyMatches.length) continue;
    const moneyCandidates = moneyMatches.filter((match) => !/\bsaldo\b/i.test(line.slice(Math.max(0, (match.index || 0) - 20), (match.index || 0) + 20)));
    const moneyMatch = moneyCandidates[0] || moneyMatches[0];
    const amount = parseBankAmount(moneyMatch[0]);
    let description = line.replace(dateMatch[0], "").replace(/\bsaldo\b.*$/i, "");
    for (const match of moneyMatches) {
      description = description.replace(match[0], "");
    }
    description = description
      .replace(/\b(saldo|total|anterior|atual|disponivel|bloqueado|lançamento|lancamento|movimento)\b/gi, "")
      .replace(/\b(D|C|DEB|CRE)\b$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const parsed = rowFromFields({ dateText: dateMatch[0], description, amount, source });
    if (parsed && !/saldo/i.test(parsed.description)) rows.push(parsed);
  }
  return { rows, errors: [], headers: [`linha_${source.toLowerCase()}`] };
}

function transformPdfText(text: string) {
  if (isSantanderStatement(text)) return transformSantanderPdfText(text);
  const transformed = transformLooseText(text, "PDF");
  return { ...transformed, diagnostics: { mode: "pdf-texto", sample: text.slice(0, 1200) } };
}

async function extractPdfText(buffer: ArrayBuffer) {
  const PDFParser = (await import("pdf2json")).default;
  const parser = new PDFParser(null, true) as {
    on: (event: string, callback: (data: any) => void) => void;
    parseBuffer: (buffer: Buffer) => void;
    destroy?: () => void;
  };

  return new Promise<string>((resolve, reject) => {
    parser.on("pdfParser_dataError", (error) => reject(error?.parserError || error));
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
        resolve(lines.join("\n"));
      } catch (error) {
        reject(error);
      } finally {
        parser.destroy?.();
      }
    });
    parser.parseBuffer(Buffer.from(buffer));
  });
}

async function transformFile(file: File, buffer: ArrayBuffer) {
  const name = file.name.toLowerCase();
  const mime = file.type;
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("excel")) {
    return transformXlsx(buffer);
  }
  if (name.endsWith(".ofx") || name.endsWith(".qfx")) {
    return transformOfx(decodeFile(buffer));
  }
  if (name.endsWith(".pdf") || mime === "application/pdf") {
    let text = "";
    try {
      text = await extractPdfText(buffer);
    } catch {
      text = "";
    }
    return transformPdfText(text);
  }
  return transformCsv(decodeFile(buffer));
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  try {
  const form = await request.formData();
  const file = form.get("file");
  const confirm = form.get("confirm") === "true";
  const accountName = String(form.get("account") || "PJ");
  const useAi = form.get("useAi") !== "false";
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo obrigatorio" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const hash = fileHash(buffer);
  const transformed = await transformFile(file, buffer);
  const rows = transformed.rows.map((row) => ({
    ...row,
    account: accountName,
    tenantId: user.tenantId,
    importHash: `${user.tenantId}|${row.importHash}`
  }));

  if (!rows.length) {
    return NextResponse.json(
      {
        error: "Nao consegui identificar lancamentos nesse arquivo. Em CSV/XLSX procure colunas de data, descricao e valor. Em OFX use o arquivo original do banco. Em PDF, prefira o PDF com texto selecionavel.",
        detectedHeaders: transformed.headers,
        parserErrors: transformed.errors.slice(0, 3),
        diagnostics: (transformed as any).diagnostics
      },
      { status: 400 }
    );
  }

  const existing = await prisma.transaction.findMany({
    where: { importHash: { in: rows.map((row) => row.importHash) } },
    select: { importHash: true }
  });
  const existingHashes = new Set(existing.map((row) => row.importHash));
  const existingBankRows = await prisma.bankTransaction.findMany({
    where: { tenantId: user.tenantId, fingerprint: { in: rows.map((row) => row.importHash) } },
    select: { fingerprint: true }
  });
  for (const item of existingBankRows) existingHashes.add(item.fingerprint);
  let newRows = rows.filter((row) => !existingHashes.has(row.importHash));
  newRows = await enhanceWithLearning(newRows, user.tenantId, user.id);
  newRows = await enhanceWithAi(newRows, user.tenantId, useAi);

  const summary = {
    totalInputs: roundMoney(newRows.filter((row) => row.type === "entrada").reduce((sum, row) => sum + row.amount, 0)),
    totalOutputs: roundMoney(newRows.filter((row) => row.type === "saida").reduce((sum, row) => sum + row.amount, 0)),
    net: roundMoney(newRows.reduce((sum, row) => sum + (row.type === "entrada" ? row.amount : -row.amount), 0)),
    count: newRows.length,
    reviewCount: newRows.filter((row) => row.status === "conferencia").length,
    duplicates: rows.length - newRows.length
  };

  if (!confirm) {
    return NextResponse.json({
      summary,
      preview: newRows.slice(0, 50),
      batch: { filename: file.name, accountName, fileHash: hash, headers: transformed.headers, diagnostics: (transformed as any).diagnostics }
    });
  }

  const batch = await prisma.bankImportBatch.upsert({
    where: { tenantId_fileHash: { tenantId: user.tenantId, fileHash: hash } },
    update: {
      filename: file.name,
      accountName,
      totalRows: rows.length,
      insertedRows: newRows.length,
      duplicateRows: rows.length - newRows.length,
      totalInCents: cents(summary.totalInputs),
      totalOutCents: cents(summary.totalOutputs),
      status: "IMPORTED"
    },
    create: {
      tenantId: user.tenantId,
      filename: file.name,
      fileHash: hash,
      accountName,
      totalRows: rows.length,
      insertedRows: newRows.length,
      duplicateRows: rows.length - newRows.length,
      totalInCents: cents(summary.totalInputs),
      totalOutCents: cents(summary.totalOutputs),
      status: "IMPORTED"
    }
  });

  for (const row of newRows) {
    const {
      classificationSource,
      suggestionConfidence,
      counterpartyName,
      counterpartyDocument,
      ...transactionData
    } = row;
    const transaction = await prisma.transaction.create({ data: transactionData });
    const bankTransaction = await prisma.bankTransaction.create({
      data: {
        tenantId: user.tenantId,
        batchId: batch.id,
        date: row.date,
        description: row.description,
        amountCents: cents(row.amount),
        direction: row.type === "entrada" ? "IN" : "OUT",
        accountName,
        categorySuggestion: row.category,
        categorySuggestionSource: classificationSource || "Regra do sistema",
        suggestionConfidence: suggestionConfidence || null,
        counterpartyName: counterpartyName || null,
        counterpartyDocument: counterpartyDocument || null,
        paymentMethod: row.paymentMethod,
        fingerprint: row.importHash,
        status: "POSTED",
        transactionImportHash: row.importHash,
        notes: "Importado de extrato e postado automaticamente no fluxo."
      }
    });
    const cashMovement = await prisma.cashMovement.create({
      data: {
        tenantId: user.tenantId,
        date: row.date,
        direction: row.type === "entrada" ? "IN" : "OUT",
        amountCents: cents(row.amount),
        accountName,
        category: row.category,
        costCenter: row.costCenter,
        contactLegacyId: row.clientId,
        description: row.description,
        status: "ACTIVE",
        source: "IMPORT",
        legacyModel: "BankTransaction",
        legacyId: bankTransaction.id
      }
    });
    await prisma.bankTransaction.update({
      where: { id: bankTransaction.id },
      data: { cashMovementLegacyId: cashMovement.id, transactionImportHash: transaction.importHash }
    });
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "import_bank_statement",
    entity: "bankImportBatches",
    entityId: batch.id,
    request,
    metadata: { filename: file.name, inserted: newRows.length, summary, accountName }
  });
  return NextResponse.json({ summary, inserted: newRows.length, batchId: batch.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno ao importar arquivo.";
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "import_bank_statement",
      entity: "bankImportBatches",
      status: "error",
      message,
      request
    });
    return NextResponse.json(
      {
        error: `Nao foi possivel importar esse arquivo: ${message}`,
        diagnostics: {
          hint: "Tente enviar CSV com colunas de data, descricao e valor; OFX original do banco; XLSX com uma tabela; ou PDF com texto selecionavel."
        }
      },
      { status: 500 }
    );
  }
}
