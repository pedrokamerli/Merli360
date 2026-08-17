import Papa from "papaparse";

export type CatalogImportVariant = {
  label: string;
  sku?: string;
  options: Array<{ name: string; value: string }>;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number;
  priceCents: number;
  costCents: number;
  sourcePriceCents: number;
  productName: string | null;
  validationStatus: "CALCULATED_FROM_PRICE";
  sourceData: string;
};

export type CatalogImportItem = {
  slug: string;
  name: string;
  category: string;
  description: string;
  imageUrl: string | null;
  imagePosition: string | null;
  status: "ACTIVE" | "INACTIVE";
  featured: boolean;
  sortOrder: number;
  variants: CatalogImportVariant[];
};

const quantityBands = [
  { maxQuantity: 20, multiplier: 1.9 },
  { maxQuantity: 50, multiplier: 1.8 },
  { maxQuantity: 100, multiplier: 1.45 },
  { maxQuantity: 200, multiplier: 1.35 },
  { maxQuantity: 500, multiplier: 1.32 },
  { maxQuantity: Number.MAX_SAFE_INTEGER, multiplier: 1.25 }
];

const catalogPresentation: Record<string, { description: string; imagePosition: string; order: number }> = {
  "banner-lona-ilhos": { description: "Banner em lona impresso, com acabamento reforcado e ilhoses.", imagePosition: "0% 0%", order: 1 },
  "placa-psai": { description: "Placa em PSAI impressa para comunicacao imobiliaria e sinalizacao.", imagePosition: "50% 0%", order: 2 },
  "faixa-lona-madeira": { description: "Faixa em lona impressa com acabamento em madeira.", imagePosition: "100% 0%", order: 3 },
  "placa-polionda": { description: "Placa leve em polionda impressa, pronta para uso externo.", imagePosition: "0% 100%", order: 4 },
  "chaveiros-imobiliarios": { description: "Chaveiros imobiliarios personalizados em PVC com argola.", imagePosition: "50% 100%", order: 5 },
  "banner-polietileno-ilhos": { description: "Banner em polietileno impresso com ilhoses, disponivel em kits.", imagePosition: "100% 100%", order: 6 },
  "faixa-polietileno-madeira": { description: "Faixa em polietileno impressa com madeira, disponivel em kits.", imagePosition: "100% 0%", order: 7 },
  "adesivos-impressos": { description: "Adesivos impressos com corte reto em diversos tamanhos e kits.", imagePosition: "0% 0%", order: 8 }
};

function decodeCsv(buffer: Buffer) {
  const utf8 = buffer.toString("utf8");
  return utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

function moneyToCents(value: unknown) {
  const raw = String(value || "").trim().replace(/\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(".")
    ? raw.replace(/,/g, "")
    : raw.includes(",")
      ? raw.replace(",", ".")
      : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function catalogQuantityMultiplier(quantity: number) {
  const normalized = Math.max(1, Math.round(Number(quantity || 1)));
  return quantityBands.find((band) => normalized <= band.maxQuantity)?.multiplier || 1.25;
}

function parseDimensions(value: string) {
  const match = String(value || "").match(/([\d.,]+)\s*x\s*([\d.,]+)/i);
  if (!match) return { widthMm: null, heightMm: null };
  const widthCm = Number(match[1].replace(",", "."));
  const heightCm = Number(match[2].replace(",", "."));
  return {
    widthMm: Number.isFinite(widthCm) ? Math.round(widthCm * 10) : null,
    heightMm: Number.isFinite(heightCm) ? Math.round(heightCm * 10) : null
  };
}

function parseQuantity(value: string) {
  const match = String(value || "").match(/(\d[\d.]*)/);
  return match ? Math.max(1, Number(match[1].replace(/\./g, ""))) : 1;
}

function technicalProduct(slug: string, options: Array<{ name: string; value: string }>) {
  const option = (name: string) => options.find((item) => item.name === name)?.value || "";
  if (slug === "banner-lona-ilhos") return option("Gramatura").includes("480") ? "Banner 440g com ilhos" : "Banner 280g com ilhos";
  if (slug === "faixa-lona-madeira") return "Banner 440g com madeira";
  if (slug === "placa-psai") return option("Espessura").startsWith("2") ? "PS 2mm impresso" : "PS 1mm impresso";
  if (slug === "placa-polionda") return "Polionda 3mm impresso";
  if (slug === "chaveiros-imobiliarios") return "Chaveiro imobiliario";
  if (slug === "adesivos-impressos") return "Adesivo impresso";
  return null;
}

function normalizeForMatch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function parseTiendanubeCatalog(buffer: Buffer): CatalogImportItem[] {
  const parsed = Papa.parse<Record<string, string>>(decodeCsv(buffer), { header: true, delimiter: ";", skipEmptyLines: true, transformHeader: (header) => header.trim() });
  if (parsed.errors.length) throw new Error(`CSV do catalogo invalido: ${parsed.errors[0].message}`);

  const groups = new Map<string, CatalogImportItem>();
  let currentSlug = "";
  for (const row of parsed.data) {
    currentSlug = String(row["Identificador URL"] || currentSlug).trim();
    if (!currentSlug) continue;
    const presentation = catalogPresentation[currentSlug] || { description: "Produto grafico personalizado.", imagePosition: "0% 0%", order: groups.size + 1 };
    const current = groups.get(currentSlug) || {
      slug: currentSlug,
      name: String(row.Nome || currentSlug).trim(),
      category: String(row.Categorias || "Catalogo").trim(),
      description: String(row["Descricao"] || presentation.description).trim() || presentation.description,
      imageUrl: "/catalog-studium-products.png",
      imagePosition: presentation.imagePosition,
      status: String(row["Exibir na loja"] || "").toUpperCase() === "SIM" ? "ACTIVE" as const : "INACTIVE" as const,
      featured: String(row["Exibir na loja"] || "").toUpperCase() === "SIM",
      sortOrder: presentation.order,
      variants: []
    };
    if (row.Nome) current.name = row.Nome.trim();
    if (row.Categorias) current.category = row.Categorias.trim();
    if (row["Exibir na loja"]) current.status = row["Exibir na loja"].toUpperCase() === "SIM" ? "ACTIVE" : "INACTIVE";

    const options = [1, 2, 3].flatMap((index) => {
      const name = String(row[`Nome da variacao ${index}`] || row[`Nome da variação ${index}`] || "").trim();
      const value = String(row[`Valor da variacao ${index}`] || row[`Valor da variação ${index}`] || "").trim();
      return name && value ? [{ name, value }] : [];
    });
    const size = options.find((item) => item.name === "Tamanho")?.value || "";
    const quantityLabel = options.find((item) => item.name === "Quantidade")?.value || "1 unidade";
    const quantity = parseQuantity(quantityLabel);
    const priceCents = moneyToCents(row["Preco"] || row["Preço"]);
    if (!priceCents) continue;
    const dimensions = parseDimensions(size);
    const label = options.map((item) => item.value).join(" | ") || `Opcao ${current.variants.length + 1}`;
    const productName = technicalProduct(currentSlug, options);
    current.variants.push({
      label,
      sku: String(row.SKU || "").trim() || undefined,
      options,
      ...dimensions,
      quantity,
      priceCents,
      costCents: Math.round(priceCents / catalogQuantityMultiplier(quantity)),
      sourcePriceCents: priceCents,
      productName: productName ? normalizeForMatch(productName) : null,
      validationStatus: "CALCULATED_FROM_PRICE",
      sourceData: JSON.stringify(row)
    });
    groups.set(currentSlug, current);
  }

  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}
