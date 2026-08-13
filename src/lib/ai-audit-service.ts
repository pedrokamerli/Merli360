import { audit } from "@/lib/audit";

export async function auditAiPlan(input: {
  tenantId: string;
  userId: string;
  action: string;
  status?: "ok" | "error";
  entity?: string | null;
  entityId?: string | null;
  message?: string | null;
  plan?: any;
  operation?: any;
  result?: any;
  request?: Request;
}) {
  await audit({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    entity: input.entity || input.plan?.tool || input.operation?.action || "ai",
    entityId: input.entityId || input.result?.item?.id || undefined,
    status: input.status || "ok",
    message: input.message,
    request: input.request,
    metadata: {
      plan: input.plan,
      operation: input.operation,
      result: input.result
        ? {
            executed: input.result.executed,
            action: input.result.action,
            message: input.result.message,
            itemId: input.result.item?.id,
            redirectTo: input.result.redirectTo
          }
        : undefined
    }
  });
}

