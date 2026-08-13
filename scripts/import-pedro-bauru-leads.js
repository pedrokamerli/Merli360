const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizePhone(value) {
  const digits = clean(value).replace(/\D/g, "").replace(/^55/, "");
  return digits.length >= 10 ? digits : "";
}

function statusFrom(value) {
  const text = normalizeText(value);
  if (!text || text.includes("nao contatado")) return "Novo";
  if (text.includes("contatado")) return "Contatado";
  if (text.includes("respondeu")) return "Respondeu";
  if (text.includes("reuniao")) return "Reuniao marcada";
  if (text.includes("proposta")) return "Proposta enviada";
  if (text.includes("sem interesse")) return "Sem interesse";
  return clean(value) || "Novo";
}

function priorityFrom(value) {
  const text = normalizeText(value);
  if (text.includes("alta")) return "Alta";
  if (text.includes("baixa")) return "Baixa";
  return "Media";
}

function firstUrl(...values) {
  return values.map(clean).find((value) => value.startsWith("http")) || "";
}

function get(row, header, name) {
  return clean(row[header.indexOf(name)]);
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Informe o caminho da planilha .xlsx.");

  const user = await prisma.user.findUnique({ where: { username: "pedro" }, include: { tenant: true } });
  if (!user) throw new Error("Usuario pedro nao encontrado.");

  let dataRows;
  if (path.extname(file).toLowerCase() === ".json") {
    dataRows = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  } else {
    const XLSX = require("xlsx");
    const workbook = XLSX.readFile(path.resolve(file));
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const headerIndex = rows.findIndex((row) => normalizeText(row[0]).includes("nome") && normalizeText(row[0]).includes("negocio"));
    const header = rows[headerIndex].map(clean);
    dataRows = rows.slice(headerIndex + 1).filter((row) => clean(row[0])).map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] || ""])));
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const name = clean(row["Nome do negócio"]);
    const city = clean(row["Cidade"]) || "Bauru";
    if (!name) {
      skipped += 1;
      continue;
    }

    const responsible = clean(row["Responsável / contato"]);
    const type = clean(row["Tipo"]) || "Comercio local";
    const segment = clean(row["Segmento"]);
    const region = clean(row["Bairro / região"]);
    const priority = priorityFrom(row["Prioridade"]);
    const contact = clean(row["Telefone"]);
    const normalizedPhone = normalizePhone(contact);
    const whatsappConfirmed = clean(row["WhatsApp confirmado?"]);
    const email = clean(row["E-mail"]);
    const address = clean(row["Endereço"]);
    const website = clean(row["Site"]);
    const instagram = clean(row["Instagram"]);
    const facebook = clean(row["Facebook"]);
    const googleMapsUrl = clean(row["Google Maps"]);
    const validationStatus = clean(row["Status de validação"]);
    const prospectStatus = clean(row["Status da prospecção"]);
    const lastContact = clean(row["Último contato"]);
    const nextAction = clean(row["Próxima ação"]);
    const opportunity = clean(row["Dor / oportunidade percebida"]);
    const observations = clean(row["Observações"]);
    const primarySource = clean(row["Fonte principal"]);
    const complementarySource = clean(row["Fonte complementar"]);
    const status = statusFrom(prospectStatus);
    const socialLink = firstUrl(instagram, facebook);
    const publicSource = [primarySource, complementarySource, observations].filter(Boolean).join("\n");
    const notes = [
      responsible ? `Responsavel/contato: ${responsible}` : "",
      region ? `Regiao: ${region}` : "",
      whatsappConfirmed ? `WhatsApp confirmado: ${whatsappConfirmed}` : "",
      validationStatus ? `Validacao: ${validationStatus}` : "",
      lastContact ? `Ultimo contato anterior: ${lastContact}` : "",
      opportunity ? `Oportunidade: ${opportunity}` : "",
      observations ? `Observacoes da base: ${observations}` : "",
      primarySource ? `Fonte principal: ${primarySource}` : "",
      complementarySource ? `Fonte complementar: ${complementarySource}` : ""
    ].filter(Boolean).join("\n");

    const duplicateWhere = [];
    if (normalizedPhone) duplicateWhere.push({ normalizedPhone });
    if (email) duplicateWhere.push({ email });
    duplicateWhere.push({ name, city });

    const existing = await prisma.lead.findFirst({
      where: { tenantId: user.tenantId, archivedAt: null, OR: duplicateWhere }
    });

    const payload = {
      tenantId: user.tenantId,
      name,
      companyName: name,
      type,
      segment,
      city,
      state: "SP",
      contact,
      normalizedPhone: normalizedPhone || null,
      email: email || null,
      address: address || null,
      website: website || null,
      socialLink: socialLink || null,
      googleMapsUrl: googleMapsUrl || null,
      publicSource: publicSource || null,
      sourceCriteria: "Base publica Bauru/SP - importada em 07/08/2026",
      verifiedAt: validationStatus ? new Date() : null,
      status,
      priority,
      temperature: priority === "Alta" ? "Morno" : "Frio",
      nextAction: nextAction || "Validar contato e fazer abordagem personalizada",
      origin: "Importacao planilha Bauru 07/08/2026",
      interestService: "CRM / prospeccao comercial",
      notes: notes || null
    };

    if (existing) {
      await prisma.lead.update({ where: { id: existing.id }, data: payload });
      await prisma.crmActivity.create({
        data: {
          tenantId: user.tenantId,
          leadId: existing.id,
          userId: user.id,
          type: "Importacao de lead",
          channel: "Sistema",
          result: "Lead atualizado pela planilha Bauru 65 unicos"
        }
      });
      updated += 1;
    } else {
      const lead = await prisma.lead.create({ data: payload });
      await prisma.crmActivity.create({
        data: {
          tenantId: user.tenantId,
          leadId: lead.id,
          userId: user.id,
          type: "Importacao de lead",
          channel: "Sistema",
          result: "Lead criado pela planilha Bauru 65 unicos"
        }
      });
      inserted += 1;
    }
  }

  const total = await prisma.lead.count({ where: { tenantId: user.tenantId, archivedAt: null } });
  console.log(JSON.stringify({ tenant: user.tenant.slug, rows: dataRows.length, inserted, updated, skipped, totalActiveLeads: total }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
