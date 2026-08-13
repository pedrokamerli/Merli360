import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { sendPushToTenant } from "@/lib/push";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const result = await sendPushToTenant(user.tenantId, {
    title: user.tenant.brandName,
    body: "Notificacoes ativadas. Quando houver conta vencendo, o celular pode receber o aviso.",
    url: "/notificacoes",
    tag: "merli360-test"
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "push_test",
    entity: "webPushSubscriptions",
    request,
    metadata: result
  });

  return NextResponse.json(result);
}
