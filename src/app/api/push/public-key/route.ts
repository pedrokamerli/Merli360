import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push";
import { requireApiUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireApiUser();
  const publicKey = getVapidPublicKey();
  return NextResponse.json({ configured: Boolean(publicKey), publicKey });
}
