export type AiRiskLevel = "consulta" | "reversivel" | "sensivel";

export type AiToolDefinition = {
  name: string;
  description: string;
  riskLevel: AiRiskLevel;
  requiresTenant: boolean;
  requiresConfirmation: boolean;
  supportsUndo: boolean;
  entity: string;
  idempotent: boolean;
  permissions: Array<"user" | "superadmin">;
  requiredFields: string[];
};

const tools: Record<string, AiToolDefinition> = {
  none: {
    name: "none",
    description: "Sem acao operacional. Usado para conversa, perguntas ou dados insuficientes.",
    riskLevel: "consulta",
    requiresTenant: true,
    requiresConfirmation: false,
    supportsUndo: false,
    entity: "assistantMessages",
    idempotent: true,
    permissions: ["user", "superadmin"],
    requiredFields: []
  },
  create_report: {
    name: "create_report",
    description: "Gera relatorio usando dados reais do banco.",
    riskLevel: "consulta",
    requiresTenant: true,
    requiresConfirmation: false,
    supportsUndo: false,
    entity: "reports",
    idempotent: true,
    permissions: ["user", "superadmin"],
    requiredFields: []
  },
  create_transaction: {
    name: "create_transaction",
    description: "Cria entrada ou saida realizada no fluxo de caixa e sincroniza CashMovement.",
    riskLevel: "reversivel",
    requiresTenant: true,
    requiresConfirmation: false,
    supportsUndo: true,
    entity: "transactions",
    idempotent: true,
    permissions: ["user", "superadmin"],
    requiredFields: ["type", "amount", "description"]
  },
  create_payable: {
    name: "create_payable",
    description: "Cria conta a pagar e sincroniza titulo financeiro.",
    riskLevel: "reversivel",
    requiresTenant: true,
    requiresConfirmation: false,
    supportsUndo: true,
    entity: "payables",
    idempotent: false,
    permissions: ["user", "superadmin"],
    requiredFields: ["amount", "description", "dueDate"]
  },
  create_receivable: {
    name: "create_receivable",
    description: "Cria conta a receber e sincroniza titulo financeiro.",
    riskLevel: "reversivel",
    requiresTenant: true,
    requiresConfirmation: false,
    supportsUndo: true,
    entity: "receivables",
    idempotent: false,
    permissions: ["user", "superadmin"],
    requiredFields: ["amount", "description", "dueDate"]
  },
  create_record: {
    name: "create_record",
    description: "Cria cadastro operacional permitido pela IA.",
    riskLevel: "reversivel",
    requiresTenant: true,
    requiresConfirmation: false,
    supportsUndo: true,
    entity: "operationalRecord",
    idempotent: false,
    permissions: ["user", "superadmin"],
    requiredFields: ["targetModel", "data"]
  },
  update_record: {
    name: "update_record",
    description: "Atualiza cadastro operacional existente.",
    riskLevel: "sensivel",
    requiresTenant: true,
    requiresConfirmation: true,
    supportsUndo: true,
    entity: "operationalRecord",
    idempotent: false,
    permissions: ["user", "superadmin"],
    requiredFields: ["targetModel"]
  },
  delete_record: {
    name: "delete_record",
    description: "Remove registro com alvo claro.",
    riskLevel: "sensivel",
    requiresTenant: true,
    requiresConfirmation: true,
    supportsUndo: false,
    entity: "operationalRecord",
    idempotent: false,
    permissions: ["user", "superadmin"],
    requiredFields: ["targetModel"]
  },
  update_initial_balance: {
    name: "update_initial_balance",
    description: "Atualiza saldo inicial de conta/carteira.",
    riskLevel: "sensivel",
    requiresTenant: true,
    requiresConfirmation: true,
    supportsUndo: true,
    entity: "financialAccounts",
    idempotent: true,
    permissions: ["user", "superadmin"],
    requiredFields: []
  },
  update_profile: {
    name: "update_profile",
    description: "Atualiza memoria/configuracao da IA do usuario.",
    riskLevel: "reversivel",
    requiresTenant: true,
    requiresConfirmation: false,
    supportsUndo: true,
    entity: "assistantProfiles",
    idempotent: false,
    permissions: ["user", "superadmin"],
    requiredFields: []
  },
  reset_operational_data: {
    name: "reset_operational_data",
    description: "Apaga registros operacionais do tenant para testes.",
    riskLevel: "sensivel",
    requiresTenant: true,
    requiresConfirmation: true,
    supportsUndo: false,
    entity: "tenantOperationalData",
    idempotent: false,
    permissions: ["superadmin"],
    requiredFields: []
  },
  reset_ai_learning: {
    name: "reset_ai_learning",
    description: "Apaga memoria e aprendizado da IA do usuario.",
    riskLevel: "sensivel",
    requiresTenant: true,
    requiresConfirmation: true,
    supportsUndo: false,
    entity: "assistantProfiles",
    idempotent: false,
    permissions: ["user", "superadmin"],
    requiredFields: []
  }
};

export function getAiToolDefinition(action?: string | null) {
  return tools[String(action || "none")] || null;
}

export function listAiToolDefinitions() {
  return Object.values(tools);
}

