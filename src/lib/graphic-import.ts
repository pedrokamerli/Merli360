import * as XLSX from "xlsx";

export type GraphicImportItem = {
  type: "product" | "material" | "process" | "setting";
  key: string;
  name?: string;
  value?: string;
  unit?: string;
  category?: string;
  description?: string;
  costCents?: number;
  wastePercent?: number;
  processType?: string;
  rowNumber: number;
  sheet: string;
  validationStatus: "PENDING_VALIDATION";
};

export type GraphicImportPreview = {
  items: GraphicImportItem[];
  errors: string[];
  warnings: string[];
  summary: Record<string, number>;
  sheets: string[];
};

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function get(row: Record<string, unknown>, names: string[]) {
  const normalized = names.map(normalize);
  const key = Object.keys(row).find((item) => normalized.includes(normalize(item)));
  return key ? String(row[key] ?? "").trim() : "";
}

export function moneyToCents(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function isTemplateRow(row: Record<string, unknown>) {
  const text = Object.values(row).join(" ").toUpperCase();
  return /\b(PED0+1|CLI0+1)\b/.test(text);
}

function rowsFromSheet(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [] as Record<string, unknown>[];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  return raw.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
}

function mapSettings(rows: Record<string, unknown>[], sheet: string) {
  const keys: Record<string, string> = {
    margem: "minMarginPercent",
    "margem minima": "minMarginPercent",
    desconto: "maxDiscountPercent",
    "desconto maximo": "maxDiscountPercent",
    "custo fixo": "fixedCostRatePercent",
    imposto: "taxRatePercent",
    impostos: "taxRatePercent",
    comissao: "commissionPercent"
  };
  return rows.flatMap((row, index) => {
    if (isTemplateRow(row)) return [];
    const rawKey = get(row, ["parametro", "parÃ¢metro", "chave", "nome", "configuracao", "configuraÃ§Ã£o"]);
    const value = get(row, ["valor", "percentual", "%"]);
    const key = keys[normalize(rawKey)] || rawKey;
    if (!key || !value) return [];
    return [{ type: "setting" as const, key, value, rowNumber: index + 2, sheet, validationStatus: "PENDING_VALIDATION" as const }];
  });
}

function mapMaterials(rows: Record<string, unknown>[], sheet: string) {
  return rows.flatMap((row, index) => {
    if (isTemplateRow(row)) return [];
    const name = get(row, ["material", "nome", "descricao", "descriÃ§Ã£o", "insumo"]);
    if (!name) return [];
    const wastePercent = Number(String(get(row, ["perda", "perda %", "desperdicio", "desperdÃ­cio"]) || "0").replace(",", ".")) || 0;
    return [{
      type: "material" as const,
      key: name,
      name,
      unit: get(row, ["unidade", "un", "unit"]) || "unidade",
      costCents: moneyToCents(get(row, ["custo", "custo unitario", "custo unitÃ¡rio", "valor", "preco", "preÃ§o"])),
      wastePercent,
      rowNumber: index + 2,
      sheet,
      validationStatus: "PENDING_VALIDATION" as const
    }];
  });
}

function mapProcesses(rows: Record<string, unknown>[], sheet: string) {
  return rows.flatMap((row, index) => {
    if (isTemplateRow(row)) return [];
    const name = get(row, ["processo", "nome", "descricao", "descriÃ§Ã£o", "servico", "serviÃ§o"]);
    if (!name) return [];
    return [{
      type: "process" as const,
      key: name,
      name,
      processType: get(row, ["tipo", "origem"]) || "INTERNAL",
      unit: get(row, ["unidade", "un", "unit"]) || "hora",
      costCents: moneyToCents(get(row, ["custo", "valor", "preco", "preÃ§o"])),
      rowNumber: index + 2,
      sheet,
      validationStatus: "PENDING_VALIDATION" as const
    }];
  });
}

function mapProducts(rows: Record<string, unknown>[], sheet: string) {
  return rows.flatMap((row, index) => {
    if (isTemplateRow(row)) return [];
    const name = get(row, ["produto", "nome", "descricao", "descriÃ§Ã£o"]);
    if (!name) return [];
    return [{
      type: "product" as const,
      key: name,
      name,
      category: get(row, ["categoria", "grupo", "tipo"]) || "Grafica",
      unit: get(row, ["unidade", "un", "unit"]) || "unidade",
      description: get(row, ["observacao", "observaÃ§Ã£o", "descricao", "descriÃ§Ã£o"]) || null || undefined,
      rowNumber: index + 2,
      sheet,
      validationStatus: "PENDING_VALIDATION" as const
    }];
  });
}

export function parseGraphicWorkbook(buffer: Buffer): GraphicImportPreview {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const items: GraphicImportItem[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const sheet of workbook.SheetNames) {
    const sheetKey = normalize(sheet).replace(/[^a-z0-9]/g, "");
    const rows = rowsFromSheet(workbook, sheet);
    if (!rows.length) continue;
    if (sheetKey.includes("parametro")) items.push(...mapSettings(rows, sheet));
    else if (sheetKey.includes("materiai") || sheetKey.includes("material")) items.push(...mapMaterials(rows, sheet));
    else if (sheetKey.includes("process")) items.push(...mapProcesses(rows, sheet));
    else if (sheetKey.includes("produto")) items.push(...mapProducts(rows, sheet));
    else if (["clientes", "pedidos", "producao", "faixasqtd"].some((known) => sheetKey.includes(known))) warnings.push(`Aba ${sheet} reconhecida, mas ainda nao e gravada neste ciclo.`);
  }

  if (!items.length) errors.push("Nao encontrei itens importaveis nas abas PARAMETROS, MATERIAIS, PROCESSOS ou PRODUTOS.");
  const summary = items.reduce((acc, item) => ({ ...acc, [item.type]: (acc[item.type] || 0) + 1 }), {} as Record<string, number>);
  return { items, errors, warnings, summary, sheets: workbook.SheetNames };
}
