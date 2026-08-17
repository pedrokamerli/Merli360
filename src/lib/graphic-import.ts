import * as XLSX from "xlsx";

export type GraphicImportItem = {
  type: "product" | "material" | "process" | "setting";
  key: string;
  name?: string;
  code?: string;
  value?: string;
  unit?: string;
  category?: string;
  description?: string;
  costCents?: number;
  wastePercent?: number;
  processType?: string;
  materialCode?: string;
  processCode?: string;
  extraCostCents?: number;
  laborHours?: number;
  safetyPercent?: number;
  finishingCostCents?: number;
  calculationType?: string;
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

function toNumber(value: unknown) {
  const raw = String(value ?? "").trim().replace("%", "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentToNumber(value: unknown) {
  const parsed = toNumber(value);
  return parsed > 0 && parsed <= 1 && String(value ?? "").includes("%") ? parsed * 100 : parsed;
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
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const knownHeaders = new Set(["parametro", "valor", "material", "produto", "processo", "unidade", "venda por", "custo", "custo unitario", "codigo", "cliente", "ate quantidade", "multiplicador", "uso"]);
  const headerIndex = matrix.findIndex((row) => {
    const labels = row.map((value) => normalize(String(value ?? ""))).filter(Boolean);
    return labels.filter((label) => knownHeaders.has(label)).length >= 2;
  });
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex].map((value, column) => String(value || `COL${column + 1}`).trim());
  return matrix.slice(headerIndex + 1).flatMap((values, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    return Object.values(row).some((value) => String(value ?? "").trim()) ? [{ ...row, __rowNumber: headerIndex + index + 2 }] : [];
  });
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
  const items = rows.flatMap((row, index) => {
    if (isTemplateRow(row)) return [];
    const rawKey = get(row, ["parametro", "chave", "nome", "configuracao"]);
    const value = get(row, ["valor", "percentual", "%"]);
    const key = keys[normalize(rawKey)] || rawKey;
    if (!key || !value) return [];
    return [{ type: "setting" as const, key, value, rowNumber: Number(row.__rowNumber || index + 2), sheet, validationStatus: "PENDING_VALIDATION" as const }];
  });
  const values = new Map(rows.map((row) => [normalize(get(row, ["parametro", "chave", "nome", "configuracao"])), moneyToCents(get(row, ["valor", "percentual", "%"]))]));
  const days = toNumber(get(rows.find((row) => normalize(get(row, ["parametro", "chave", "nome", "configuracao"])).includes("dias uteis")) || {}, ["valor"]));
  const hours = toNumber(get(rows.find((row) => normalize(get(row, ["parametro", "chave", "nome", "configuracao"])).includes("horas/dia")) || {}, ["valor"]));
  const monthlyFixedCents = ["aluguel", "energia", "administrativo", "outros", "funcionarios"].reduce((sum, key) => sum + (values.get(key) || 0), 0);
  if (days > 0 && hours > 0 && monthlyFixedCents > 0) items.push({ type: "setting", key: "fixedHourlyCostCents", value: String(Math.round(monthlyFixedCents / (days * hours))), rowNumber: 0, sheet, validationStatus: "PENDING_VALIDATION" });
  return items;
}

function mapQuantityBands(rows: Record<string, unknown>[], sheet: string) {
  const bands = rows.flatMap((row) => {
    const use = normalize(get(row, ["uso", "tipo"]));
    if (use && !use.includes("padrao")) return [];
    const maxQuantity = toNumber(get(row, ["ate quantidade", "quantidade", "ate qtd"]));
    const multiplier = toNumber(get(row, ["multiplicador", "multiplicador de venda"]));
    return maxQuantity > 0 && multiplier > 0 ? [{ maxQuantity, multiplier }] : [];
  }).sort((a, b) => a.maxQuantity - b.maxQuantity);
  return bands.length ? [{ type: "setting" as const, key: "quantityMultiplierBands", value: JSON.stringify(bands), rowNumber: 0, sheet, validationStatus: "PENDING_VALIDATION" as const }] : [];
}

function mapMaterials(rows: Record<string, unknown>[], sheet: string) {
  return rows.flatMap((row, index) => {
    if (isTemplateRow(row)) return [];
    const name = get(row, ["material", "nome", "descricao", "insumo"]);
    if (!name) return [];
    const code = get(row, ["codigo", "cod"]);
    return [{
      type: "material" as const,
      key: code || name,
      name,
      code: code || undefined,
      unit: get(row, ["unidade", "un", "unit"]) || "unidade",
      costCents: moneyToCents(get(row, ["custo unitario", "custo", "valor", "preco"])),
      wastePercent: percentToNumber(get(row, ["perda", "perda %", "desperdicio"])),
      rowNumber: Number(row.__rowNumber || index + 2),
      sheet,
      validationStatus: "PENDING_VALIDATION" as const
    }];
  });
}

function mapProcesses(rows: Record<string, unknown>[], sheet: string) {
  return rows.flatMap((row, index) => {
    if (isTemplateRow(row)) return [];
    const name = get(row, ["processo", "nome", "descricao", "servico"]);
    if (!name) return [];
    const code = get(row, ["codigo", "cod"]);
    return [{
      type: "process" as const,
      key: code || name,
      name,
      code: code || undefined,
      processType: get(row, ["tipo", "origem"]) || "INTERNAL",
      unit: get(row, ["unidade", "un", "unit"]) || "hora",
      costCents: moneyToCents(get(row, ["custo unitario", "custo", "valor", "preco"])),
      rowNumber: Number(row.__rowNumber || index + 2),
      sheet,
      validationStatus: "PENDING_VALIDATION" as const
    }];
  });
}

function mapProducts(rows: Record<string, unknown>[], sheet: string) {
  return rows.flatMap((row, index) => {
    if (isTemplateRow(row)) return [];
    const name = get(row, ["produto", "nome", "descricao"]);
    if (!name) return [];
    const code = get(row, ["codigo", "cod"]);
    return [{
      type: "product" as const,
      key: code || name,
      name,
      code: code || undefined,
      category: get(row, ["categoria", "grupo", "tipo calculo", "tipo"]) || "Grafica",
      unit: get(row, ["venda por", "unidade", "un", "unit"]) || "unidade",
      description: get(row, ["observacao", "descricao"]) || undefined,
      materialCode: get(row, ["material principal", "material", "material cod"]) || undefined,
      processCode: get(row, ["processo principal", "processo", "processo cod"]) || undefined,
      wastePercent: percentToNumber(get(row, ["perda %", "perda"])),
      extraCostCents: moneyToCents(get(row, ["custo extra fixo", "extra", "custo extra"])),
      laborHours: toNumber(get(row, ["horas mao de obra", "mao de obra"])),
      finishingCostCents: moneyToCents(get(row, ["acabamento r$/un", "acabamento", "acabamento r$ / un"])),
      safetyPercent: percentToNumber(get(row, ["margem seguranca %", "margem de seguranca %", "margem seguranca"])),
      calculationType: get(row, ["tipo calculo", "tipo de calculo"]) || undefined,
      rowNumber: Number(row.__rowNumber || index + 2),
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
    else if (sheetKey.includes("faixasqtd")) items.push(...mapQuantityBands(rows, sheet));
    else if (sheetKey.includes("materiai") || sheetKey.includes("material")) items.push(...mapMaterials(rows, sheet));
    else if (sheetKey.includes("process")) items.push(...mapProcesses(rows, sheet));
    else if (sheetKey.includes("produto")) items.push(...mapProducts(rows, sheet));
    else if (["clientes", "pedidos", "producao"].some((known) => sheetKey.includes(known))) warnings.push(`Aba ${sheet} reconhecida, mas ainda nao e gravada neste ciclo.`);
  }

  if (!items.length) errors.push("Nao encontrei itens importaveis nas abas PARAMETROS, MATERIAIS, PROCESSOS ou PRODUTOS.");
  const summary = items.reduce((acc, item) => ({ ...acc, [item.type]: (acc[item.type] || 0) + 1 }), {} as Record<string, number>);
  return { items, errors, warnings, summary, sheets: workbook.SheetNames };
}
