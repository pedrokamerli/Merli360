import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  status?: "ok" | "error";
  message?: string | null;
  metadata?: unknown;
  request?: NextRequest | Request;
};

function safeJson(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value).slice(0, 5000);
  } catch {
    return String(value).slice(0, 5000);
  }
}

export async function audit(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId || undefined,
        userId: input.userId || undefined,
        action: input.action,
        entity: input.entity || undefined,
        entityId: input.entityId || undefined,
        status: input.status || "ok",
        message: input.message || undefined,
        metadata: safeJson(input.metadata) || undefined,
        ip:
          input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          input.request?.headers.get("x-real-ip") ||
          undefined,
        userAgent: input.request?.headers.get("user-agent") || undefined
      }
    });
  } catch (error) {
    console.error("audit log failed", error);
  }
}
