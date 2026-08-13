import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getDueNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  return NextResponse.json(await getDueNotifications(user.tenantId, 3));
}
