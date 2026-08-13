import { prisma } from "@/lib/prisma";
import { buildAiPlan } from "@/lib/ai-plan";

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "json_serialization_failed" });
  }
}

export async function saveAssistantPlan(input: {
  tenantId: string;
  userId: string;
  userRole?: string | null;
  message: string;
  operation: any;
  confirmed?: boolean;
  autoExecute?: boolean;
  conversationId?: string | null;
}) {
  const plan = buildAiPlan({
    operation: input.operation,
    tenantId: input.tenantId,
    userId: input.userId,
    userRole: input.userRole,
    message: input.message,
    confirmed: input.confirmed,
    autoExecute: input.autoExecute
  });
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  const record = await prisma.assistantPlan.upsert({
    where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: plan.idempotencyKey } },
    update: {
      userId: input.userId,
      conversationId: input.conversationId || undefined,
      intent: plan.intent,
      tool: plan.tool,
      riskLevel: plan.riskLevel,
      status: plan.status,
      originalMessage: input.message,
      operation: safeJson(input.operation),
      plan: safeJson(plan),
      expiresAt
    },
    create: {
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId || undefined,
      idempotencyKey: plan.idempotencyKey,
      intent: plan.intent,
      tool: plan.tool,
      riskLevel: plan.riskLevel,
      status: plan.status,
      originalMessage: input.message,
      operation: safeJson(input.operation),
      plan: safeJson(plan),
      expiresAt
    }
  });
  return { record, plan };
}

export async function getAssistantPlanForConfirmation(input: { tenantId: string; userId: string; planId: string }) {
  const record = await prisma.assistantPlan.findFirst({
    where: {
      id: input.planId,
      tenantId: input.tenantId,
      userId: input.userId,
      status: { in: ["Draft", "AwaitingConfirmation", "MissingData"] }
    }
  });
  if (!record) return null;
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    await prisma.assistantPlan.update({ where: { id: record.id }, data: { status: "Cancelled", error: "Plano expirado." } });
    return null;
  }
  try {
    return { record, operation: JSON.parse(record.operation), plan: JSON.parse(record.plan) };
  } catch {
    return null;
  }
}

export async function markAssistantPlanExecuting(planId: string) {
  return prisma.assistantPlan.update({
    where: { id: planId },
    data: { status: "Executing", confirmedAt: new Date() }
  });
}

export async function markAssistantPlanFinished(input: { planId: string; executed: boolean; result: any; error?: string | null }) {
  return prisma.assistantPlan.update({
    where: { id: input.planId },
    data: {
      status: input.executed ? "Completed" : "Failed",
      executedAt: new Date(),
      result: safeJson(input.result),
      error: input.error || undefined
    }
  });
}

