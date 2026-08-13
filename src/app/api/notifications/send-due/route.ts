import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getDueNotifications } from "@/lib/notifications";
import { sendPushToTenant } from "@/lib/push";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const due = await getDueNotifications(user.tenantId, 1);
  if (due.summary.total === 0) {
    return NextResponse.json({ sent: 0, failed: 0, configured: true, message: "Nenhuma conta vencendo agora." });
  }

  const result = await sendPushToTenant(user.tenantId, {
    title: user.tenant.brandName,
    body: `${due.summary.total} conta(s) vencendo ou atrasada(s). Abra para conferir.`,
    url: "/notificacoes",
    tag: `due-${new Date().toISOString().slice(0, 10)}`
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "send_due_notifications",
    entity: "notificationRules",
    request,
    metadata: { due: due.summary, result }
  });

  return NextResponse.json({ ...result, due: due.summary });
}
