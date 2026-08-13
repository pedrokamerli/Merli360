import { prisma } from "@/lib/prisma";

export function initialStructuredMemory(user: { name: string; tenant: { kind: string; brandName: string } }) {
  const profileType = user.tenant.kind === "agro" ? "produtor rural / gestao rural" : "financeiro pessoal, MEI, empresa ou servicos";
  return [
    "MEMORIA ESTRUTURADA",
    `Perfil inicial: ${user.name} usa o sistema ${user.tenant.brandName} para ${profileType}.`,
    "Profissao/atividade: a descobrir naturalmente.",
    "Tipo de renda: a descobrir.",
    "Fontes de renda: a descobrir.",
    "Clientes/fornecedores recorrentes: a descobrir.",
    "Contas e carteiras: a descobrir ou cadastradas no primeiro acesso.",
    "Cartoes: a descobrir.",
    "Despesas fixas e variaveis: a descobrir.",
    "Dividas e parcelamentos: a descobrir.",
    "Compromissos recorrentes: a descobrir.",
    "Metas e prioridades: a descobrir.",
    "Reserva financeira e limites de gastos: a descobrir.",
    "Preferencias de comunicacao: acompanhamento equilibrado, com alertas importantes e resumos quando solicitado.",
    "Regra: aprender progressivamente com conversas, correcoes e confirmacoes; nao transformar suposicoes em fatos sem confirmar."
  ].join("\n");
}

export async function getOrCreateAssistantProfile(user: {
  id: string;
  name: string;
  tenantId: string;
  tenant: { kind: string; brandName: string };
}) {
  const existing = await prisma.assistantProfile.findFirst({ where: { tenantId: user.tenantId, userId: user.id } });
  if (existing) {
    const registeredName = String(user.name || "").trim();
    const profileName = String(existing.ownerName || "").trim();
    if (registeredName && !profileName) {
      return prisma.assistantProfile.update({
        where: { id: existing.id },
        data: { ownerName: registeredName }
      });
    }
    return existing;
  }

  return prisma.assistantProfile.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      assistantName: user.tenant.kind === "agro" ? "Assistente Rural 360" : "Assistente Merli360",
      ownerName: user.name,
      businessName: user.tenant.brandName,
      goalsText: "",
      preferences: "Nivel de acompanhamento: equilibrado. Perguntar somente o necessario no momento e evitar questionarios longos.",
      personality: "Natural, proxima, profissional, direta, organizada, proativa sem ser invasiva e sem julgamentos.",
      memoryText: initialStructuredMemory(user),
      onboardingStep: 0,
      onboardingCompleted: false
    }
  });
}
