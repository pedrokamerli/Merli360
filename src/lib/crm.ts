import { prisma } from "@/lib/prisma";

export const CRM_MODULE = "crm";

export const defaultCrmStages = [
  "Novo", "Pesquisando", "Pronto para contato", "Contatado", "Respondeu", "Qualificado",
  "Reuniao marcada", "Diagnostico realizado", "Proposta enviada", "Negociacao", "Cliente",
  "Nutricao", "Sem interesse", "Nao respondeu", "Nao contatar"
];

export function parseModules(value?: string | null) {
  if (!value || value === "all") return ["all"];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : String(value).split(",").map((item) => item.trim()).filter(Boolean);
  } catch {
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  }
}

export function hasModuleAccess(user: { role: string; moduleAccess?: string | null }, module: string) {
  if (user.role === "superadmin") return true;
  const modules = parseModules(user.moduleAccess);
  return modules.includes("all") || modules.includes(module);
}

export async function ensureCrmDefaults(tenantId: string) {
  const count = await prisma.crmPipelineStage.count({ where: { tenantId } });
  if (!count) {
    await prisma.crmPipelineStage.createMany({
      data: defaultCrmStages.map((name, position) => ({
        tenantId,
        name,
        position,
        color: name === "Cliente" ? "emerald" : name === "Nao contatar" ? "red" : "violet",
        kind: ["Cliente"].includes(name) ? "won" : ["Sem interesse", "Nao contatar"].includes(name) ? "lost" : "active"
      }))
    });
  }

  const template = await prisma.crmMessageTemplate.findFirst({ where: { tenantId, isDefault: true } });
  if (!template) {
    await prisma.crmMessageTemplate.create({
      data: {
        tenantId,
        name: "Primeiro contato",
        isDefault: true,
        content: "Ola, tudo bem? Sou [NOME]. Encontrei o contato da sua empresa durante uma pesquisa sobre o mercado imobiliario de [CIDADE]. Posso te fazer uma pergunta rapida sobre a presenca digital da empresa?"
      }
    });
  }
}

export function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  const withoutCountry = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return withoutCountry.length >= 10 && withoutCountry.length <= 11 ? withoutCountry : "";
}

export function resolveTemplate(template: string, lead: { name: string; city?: string | null; companyName?: string | null }, senderName: string) {
  return template
    .replaceAll("[NOME]", senderName)
    .replaceAll("[CIDADE]", lead.city || "sua cidade")
    .replaceAll("[EMPRESA]", lead.companyName || lead.name);
}

export function brasilia(value?: Date | string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}
