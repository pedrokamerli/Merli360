import { getAiToolDefinition } from "@/lib/ai-tool-registry";

type PolicyInput = {
  operation: any;
  tenantId?: string | null;
  userRole?: string | null;
  confirmed?: boolean;
  autoExecute?: boolean;
};

export type AiPolicyDecision = {
  allowed: boolean;
  requiresConfirmation: boolean;
  riskLevel: "consulta" | "reversivel" | "sensivel";
  reasons: string[];
  toolName: string;
};

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function evaluateAiPolicy(input: PolicyInput): AiPolicyDecision {
  const operation = input.operation || { action: "none" };
  const toolName = String(operation.action || "none");
  const tool = getAiToolDefinition(toolName);
  const reasons: string[] = [];

  if (!tool) {
    return {
      allowed: false,
      requiresConfirmation: true,
      riskLevel: "sensivel",
      reasons: [`Ferramenta nao registrada: ${toolName}`],
      toolName
    };
  }

  if (tool.requiresTenant && !input.tenantId) reasons.push("Tenant obrigatorio ausente.");
  if (!tool.permissions.includes((input.userRole as "user" | "superadmin") || "user")) reasons.push("Usuario sem permissao para esta ferramenta.");

  for (const field of tool.requiredFields) {
    if (!hasValue(operation[field])) reasons.push(`Campo obrigatorio ausente: ${field}.`);
  }

  if (toolName === "create_transaction") {
    if (!["entrada", "saida"].includes(operation.type)) reasons.push("Tipo da movimentacao precisa ser entrada ou saida.");
    if (!Number.isFinite(Number(operation.amount)) || Number(operation.amount) <= 0) reasons.push("Valor da movimentacao precisa ser maior que zero.");
  }

  if (["create_payable", "create_receivable"].includes(toolName)) {
    if (!Number.isFinite(Number(operation.amount)) || Number(operation.amount) <= 0) reasons.push("Valor do titulo precisa ser maior que zero.");
  }

  const requiresConfirmation = tool.requiresConfirmation || (tool.riskLevel === "sensivel" && !input.confirmed);
  if (requiresConfirmation && input.autoExecute) reasons.push("Acao sensivel nao pode ser executada automaticamente.");
  if (requiresConfirmation && !input.confirmed) reasons.push("Confirmacao explicita obrigatoria.");

  return {
    allowed: reasons.length === 0,
    requiresConfirmation,
    riskLevel: tool.riskLevel,
    reasons,
    toolName
  };
}

