import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { getVapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!getVapidPublicKey()) return NextResponse.json({ error: "Chaves VAPID nao configuradas no servidor." }, { status: 400 });

  const body = await request.json();
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Assinatura push invalida." }, { status: 400 });
  }

  const item = await prisma.webPushSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: {
      tenantId: user.tenantId,
      userId: user.id,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: request.headers.get("user-agent"),
      active: true
    },
    create: {
      tenantId: user.tenantId,
      userId: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: request.headers.get("user-agent"),
      active: true
    }
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "push_subscribe",
    entity: "webPushSubscriptions",
    entityId: item.id,
    request
  });

  return NextResponse.json({ ok: true });
}
