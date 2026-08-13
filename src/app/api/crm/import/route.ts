import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireApiModule } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { CRM_MODULE, normalizePhone } from "@/lib/crm";

function value(row: Record<string, unknown>, names: string[]) {
  const key = Object.keys(row).find((item) => names.includes(item.toLowerCase().trim()));
  return key ? String(row[key] ?? "").trim() : "";
}

function dateValue(row: Record<string, unknown>, names: string[]) {
  const key = Object.keys(row).find((item) => names.includes(item.toLowerCase().trim()));
  const raw = key ? row[key] : null;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapRow(row: Record<string, unknown>) {
  const name = value(row, ["nome", "nome da empresa", "empresa", "lead", "nome/profissional", "nome / empresa", "profissional"]);
  const phoneValues = [
    value(row, ["celular / whatsapp provavel", "celular / whatsapp provável", "whatsapp", "celular"]),
    value(row, ["telefone", "contato"])
  ].filter(Boolean);
  const contact = [...new Set(phoneValues)].join(" / ");
  const email = value(row, ["email", "e-mail"]);
  const city = value(row, ["cidade", "municipio"]);
  return {
    name,
    companyName: value(row, ["empresa", "nome da empresa", "nome / empresa"]),
    type: value(row, ["tipo"]) || "Imobiliaria",
    city,
    state: value(row, ["estado", "uf"]),
    contact,
    normalizedPhone: phoneValues.map(normalizePhone).find(Boolean) || null,
    email: email.toLowerCase() || null,
    address: value(row, ["endereco", "endereço"]),
    website: value(row, ["site", "website"]),
    socialLink: value(row, ["instagram", "rede social", "social"]),
    googleMapsUrl: value(row, ["google maps", "maps"]),
    publicSource: value(row, ["fonte", "fonte publica", "fonte pública"]),
    sourceCriteria: value(row, ["criterio", "critério"]),
    ownerName: value(row, ["responsavel", "responsável"]),
    status: (() => {
      const source = value(row, ["etapa", "etapa do funil", "status", "status da prospeccao", "status da prospecção"]);
      return ["nao contatado", "não contatado", "novo"].includes(source.toLowerCase()) ? "Novo" : source || "Novo";
    })(),
    temperature: value(row, ["temperatura"]) || "Morno",
    priority: value(row, ["prioridade"]) || "Media",
    proposedValue: Number(String(value(row, ["potencial (r$)", "potencial", "valor proposto"])).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0,
    interestService: value(row, ["servico", "serviço", "servico de interesse", "serviço de interesse"]) || null,
    origin: value(row, ["origem", "fonte principal"]) || "Planilha",
    verifiedAt: dateValue(row, ["verificado em"]),
    lastContactAt: dateValue(row, ["último contato", "ultimo contato"]),
    nextFollowUp: dateValue(row, ["data próxima ação", "data proxima acao"]),
    attempts: Number(value(row, ["tentativas"])) || 0,
    lastContactResult: value(row, ["resultado do último contato", "resultado do ultimo contato"]) || null,
    nextAction: value(row, ["proxima acao", "próxima ação"]) || null,
    notes: value(row, ["observacoes", "observações", "anotações comerciais", "notas"]) || null,
    optOut: ["sim", "true", "1"].includes(value(row, ["opt-out", "opt out"]).toLowerCase()),
    doNotContact: ["sim", "true", "1"].includes(value(row, ["não contatar", "nao contatar"]).toLowerCase())
  };
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [] as Record<string, unknown>[];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = raw.findIndex((row) => row.some((cell) => ["Nome / Empresa", "Nome", "Lead"].includes(String(cell).trim())));
  if (headerIndex < 0) return [];
  const headers = raw[headerIndex].map((cell) => String(cell).trim());
  return raw.slice(headerIndex + 1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))).filter((row) => Object.values(row).some(Boolean));
}

function mergeText(existing?: string | null, incoming?: string | null) {
  const parts = [...String(existing || "").split(/[\/,;|\n]+/), ...String(incoming || "").split(/[\/,;|\n]+/)]
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(parts)].join(" / ") || null;
}

function enrichmentUpdate(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const update: Record<string, unknown> = {};
  const directFields = ["name", "companyName", "type", "segment", "city", "state", "email", "address", "website", "socialLink", "googleMapsUrl", "publicSource", "sourceCriteria", "priority", "interestService", "origin", "verifiedAt", "notes"];
  for (const field of directFields) {
    const value = incoming[field];
    if (value !== null && value !== "" && value !== undefined) update[field] = value;
  }
  const contact = mergeText(existing.contact as string | null, incoming.contact as string | null);
  if (contact) {
    update.contact = contact;
    update.normalizedPhone = normalizePhone(contact) || incoming.normalizedPhone || existing.normalizedPhone || null;
  } else if (incoming.normalizedPhone) {
    update.normalizedPhone = incoming.normalizedPhone;
  }
  return update;
}

export async function POST(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  const form = await request.formData();
  const file = form.get("file");
  const confirm = form.get("confirm") === "true";
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie uma planilha XLSX ou CSV." }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const preferredSheet = workbook.SheetNames.find((name) => name.trim().toLowerCase() === "leads") || workbook.SheetNames[0];
  const sourceRows = sheetRows(workbook, preferredSheet);
  const mapped = sourceRows.map(mapRow).filter((item) => item.name);
  if (!mapped.length) return NextResponse.json({ error: "Nao encontrei a tabela de leads. A planilha precisa ter uma aba Leads e uma coluna Nome / Empresa." }, { status: 400 });
  if (!confirm) return NextResponse.json({ preview: mapped.slice(0, 20), total: mapped.length, columns: Object.keys(sourceRows[0] || {}), sheet: preferredSheet });

  let inserted = 0;
  let updated = 0;
  let rejected = 0;
  for (const item of mapped) {
    try {
      const duplicate = await prisma.lead.findFirst({
        where: {
          tenantId: user.tenantId,
          archivedAt: null,
          OR: [
            ...(item.normalizedPhone ? [{ normalizedPhone: item.normalizedPhone }] : []),
            ...(item.email ? [{ email: item.email }] : []),
            { name: item.name, city: item.city || null }
          ]
        }
      });
      if (duplicate) {
        await prisma.lead.update({ where: { id: duplicate.id }, data: enrichmentUpdate(duplicate as any, item as any) as any });
        updated++;
      } else {
        await prisma.lead.create({ data: { ...item, tenantId: user.tenantId } as any });
        inserted++;
      }
    } catch {
      rejected++;
    }
  }
  await audit({ tenantId: user.tenantId, userId: user.id, action: "crm_import", entity: "lead", request, metadata: { file: file.name, inserted, updated, rejected } });
  return NextResponse.json({ inserted, updated, rejected, total: mapped.length, fileName: file.name });
}
