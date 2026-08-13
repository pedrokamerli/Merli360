import crypto from "crypto";
import { getAiToolDefinition } from "@/lib/ai-tool-registry";
import { evaluateAiPolicy } from "@/lib/ai-policy";

export type AiPlanStatus =
  | "Draft"
  | "MissingData"
  | "AwaitingConfirmation"
  | "Executing"
  | "Completed"
  | "PartiallyFailed"
  | "Failed"
  | "Cancelled"
  | "Reverted";

export function buildAiPlan(input: {
  operation: any;
  tenantId: string;
  userId?: string | null;
  userRole?: string | null;
  message: string;
  confirmed?: boolean;
  autoExecute?: boolean;
}) {
  const operation = input.operation || { action: "none" };
  const tool = getAiToolDefinition(operation.action);
  const policy = evaluateAiPolicy({
    operation,
    tenantId: input.tenantId,
    userRole: input.userRole,
    confirmed: input.confirmed,
    autoExecute: input.autoExecute
  });
  const idempotencyKey = crypto
    .createHash("sha1")
    .update([input.tenantId, input.userId || "", operation.action || "none", input.message, JSON.stringify(operation)].join("|"))
    .digest("hex");
  const status: AiPlanStatus = policy.allowed
    ? "Draft"
    : policy.requiresConfirmation && policy.reasons.some((reason) => /confirmacao/i.test(reason))
      ? "AwaitingConfirmation"
      : "MissingData";

  return {
    idempotencyKey,
    intent: operation.action || "none",
    tool: tool?.name || operation.action || "none",
    riskLevel: policy.riskLevel,
    requiresConfirmation: policy.requiresConfirmation,
    status,
    entities: {
      amount: operation.amount,
      type: operation.type,
      description: operation.description,
      category: operation.category,
      account: operation.account,
      paymentMethod: operation.paymentMethod,
      targetModel: operation.targetModel,
      targetId: operation.targetId
    },
    steps: planStepsForAction(operation.action),
    policy,
    originalMessage: input.message
  };
}

function planStepsForAction(action?: string | null) {
  if (action === "create_transaction") return ["validate_tenant", "validate_fields", "check_duplicate", "create_transaction", "create_cash_movement", "write_audit_log"];
  if (action === "create_payable") return ["validate_tenant", "validate_fields", "create_account_payable", "sync_financial_title", "write_audit_log"];
  if (action === "create_receivable") return ["validate_tenant", "validate_fields", "create_account_receivable", "sync_financial_title", "write_audit_log"];
  if (action === "create_report") return ["validate_tenant", "read_semantic_metrics", "generate_report", "write_audit_log"];
  if (action === "update_record") return ["validate_tenant", "locate_record", "validate_policy", "update_record", "sync_related_records", "write_audit_log"];
  if (action === "delete_record") return ["validate_tenant", "locate_record", "validate_policy", "cleanup_related_records", "delete_record", "write_audit_log"];
  if (action === "update_initial_balance") return ["validate_tenant", "validate_confirmation", "upsert_financial_account", "write_audit_log"];
  if (action === "reset_operational_data") return ["validate_superadmin", "validate_exact_command", "delete_operational_data", "write_audit_log"];
  if (action === "reset_ai_learning") return ["validate_tenant", "validate_exact_command", "delete_ai_memory", "write_audit_log"];
  return ["understand_message", "ask_missing_data_or_answer"];
}

