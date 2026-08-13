const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const file = process.argv[2];
if (!file) throw new Error("Informe o arquivo XLSX.");

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const plain = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return plain.length >= 10 && plain.length <= 11 ? plain : null;
}

function get(row, names) {
  const key = Object.keys(row).find((item) => names.includes(item.toLowerCase().trim()));
  return key ? String(row[key] || "").trim() : "";
}

function rowsFromLeadsSheet(workbook) {
  const sheet = workbook.Sheets.Leads || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Nenhuma aba encontrada.");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) => row.some((cell) => ["Nome / Empresa", "Nome", "Lead"].includes(String(cell).trim())));
  if (headerIndex < 0) throw new Error("Cabecalho de leads nao encontrado.");
  const headers = rows[headerIndex].map((value) => String(value).trim());
  return rows.slice(headerIndex + 1)
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])))
    .filter((row) => Object.values(row).some(Boolean));
}

function date(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function yes(value) {
  return ["sim", "true", "1"].includes(String(value || "").trim().toLowerCase());
}

function statusFrom(row) {
  const source = get(row, ["etapa", "etapa do funil", "status", "status da prospeccao", "status da prospecção"]);
  return ["nao contatado", "não contatado", "novo"].includes(source.toLowerCase()) ? "Novo" : source || "Novo";
}

function mergeText(existing, incoming) {
  const parts = [...String(existing || "").split(/[\/,;|\n]+/), ...String(incoming || "").split(/[\/,;|\n]+/)]
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(parts)].join(" / ") || null;
}

function mapRow(row) {
  const name = get(row, ["nome", "nome / empresa", "nome da empresa", "empresa", "lead"]);
  const phoneValues = [
    get(row, ["celular / whatsapp provável", "celular / whatsapp provavel", "whatsapp", "celular"]),
    get(row, ["telefone", "telefone / whatsapp", "contato"])
  ].filter(Boolean);
  const contact = [...new Set(phoneValues)].join(" / ");
  return {
    name,
    companyName: name,
    type: get(row, ["tipo"]) || "Imobiliaria",
    city: get(row, ["cidade", "municipio"]) || null,
    state: get(row, ["uf", "estado"]) || null,
    contact: contact || null,
    normalizedPhone: phoneValues.map(normalizePhone).find(Boolean) || null,
    email: get(row, ["email", "e-mail"]).toLowerCase() || null,
    address: get(row, ["endereço", "endereco"]) || null,
    website: get(row, ["site", "website"]) || null,
    socialLink: get(row, ["instagram", "facebook", "rede social", "social"]) || null,
    googleMapsUrl: get(row, ["google maps", "maps"]) || null,
    publicSource: get(row, ["fonte principal", "fonte", "fonte pública", "fonte publica"]) || null,
    sourceCriteria: get(row, ["fonte complementar", "critério", "criterio", "criterio da fonte", "critério da fonte"]) || null,
    status: statusFrom(row),
    temperature: get(row, ["temperatura"]) || "Morno",
    priority: get(row, ["prioridade"]) || "Media",
    proposedValue: Number(String(get(row, ["potencial (r$)", "potencial", "valor proposto"])).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0,
    interestService: get(row, ["serviço de interesse", "servico de interesse", "categoria"]) || null,
    origin: get(row, ["origem", "fonte principal"]) || "Planilha",
    verifiedAt: date(get(row, ["verificado em"])),
    lastContactAt: date(get(row, ["último contato", "ultimo contato"])),
    nextAction: get(row, ["próxima ação", "proxima acao"]) || null,
    nextFollowUp: date(get(row, ["data próxima ação", "data proxima acao"])),
    attempts: Number(get(row, ["tentativas"])) || 0,
    lastContactResult: get(row, ["resultado do último contato", "resultado do ultimo contato"]) || null,
    notes: get(row, ["observações", "observacoes", "anotações comerciais", "anotacoes comerciais"]) || null,
    optOut: yes(get(row, ["opt-out", "opt out"])),
    doNotContact: yes(get(row, ["não contatar", "nao contatar"]))
  };
}

function enrichmentUpdate(existing, incoming) {
  const update = {};
  for (const field of ["name", "companyName", "type", "city", "state", "email", "address", "website", "socialLink", "googleMapsUrl", "publicSource", "sourceCriteria", "priority", "interestService", "origin", "verifiedAt", "notes"]) {
    if (incoming[field] !== null && incoming[field] !== "" && incoming[field] !== undefined) update[field] = incoming[field];
  }
  const contact = mergeText(existing.contact, incoming.contact);
  if (contact) {
    update.contact = contact;
    update.normalizedPhone = normalizePhone(contact) || incoming.normalizedPhone || existing.normalizedPhone || null;
  }
  return update;
}

async function main() {
  const workbook = XLSX.readFile(file, { cellDates: true });
  const rows = rowsFromLeadsSheet(workbook).map(mapRow).filter((row) => row.name);
  const tenant = await prisma.tenant.upsert({
    where: { slug: "studium" },
    update: { name: "Studium", brandName: "Studium", kind: "consultoria" },
    create: { name: "Studium", brandName: "Studium", kind: "consultoria", slug: "studium" }
  });
  const stageCount = await prisma.crmPipelineStage.count({ where: { tenantId: tenant.id } });
  if (!stageCount) {
    await prisma.crmPipelineStage.createMany({ data: ["Novo", "Pesquisando", "Pronto para contato", "Contatado", "Respondeu", "Qualificado", "Reuniao marcada", "Diagnostico realizado", "Proposta enviada", "Negociacao", "Cliente", "Nutricao", "Sem interesse", "Nao respondeu", "Nao contatar"].map((name, position) => ({ tenantId: tenant.id, name, position })) });
  }

  let inserted = 0;
  let updated = 0;
  for (const data of rows) {
    const existing = await prisma.lead.findFirst({
      where: {
        tenantId: tenant.id,
        archivedAt: null,
        OR: [
          ...(data.normalizedPhone ? [{ normalizedPhone: data.normalizedPhone }] : []),
          ...(data.email ? [{ email: data.email }] : []),
          { name: data.name, city: data.city }
        ]
      }
    });
    if (existing) {
      await prisma.lead.update({ where: { id: existing.id }, data: enrichmentUpdate(existing, data) });
      updated++;
    } else {
      await prisma.lead.create({ data: { tenantId: tenant.id, ...data } });
      inserted++;
    }
  }
  console.log(JSON.stringify({ tenantId: tenant.id, leads: rows.length, inserted, updated }));
}

main().finally(() => prisma.$disconnect());
