import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
}

function configureWebPush() {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:pedromerli@hotmail.com", publicKey, privateKey);
  return true;
}

export async function sendPushToTenant(tenantId: string, payload: PushPayload) {
  if (!configureWebPush()) return { sent: 0, failed: 0, configured: false };

  const subscriptions = await prisma.webPushSubscription.findMany({
    where: { tenantId, active: true }
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch {
        failed += 1;
        await prisma.webPushSubscription.update({
          where: { id: subscription.id },
          data: { active: false }
        });
      }
    })
  );

  return { sent, failed, configured: true };
}
