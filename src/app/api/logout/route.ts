import { NextResponse } from "next/server";
import { authCookieName, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "logout",
      entity: "User",
      entityId: user.id,
      request
    });
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  const proto = forwardedProto || new URL(request.url).protocol.replace(":", "") || "https";
  const response = NextResponse.redirect(new URL("/login", `${proto}://${host}`));
  response.cookies.delete(authCookieName);
  response.cookies.delete("merli360_must_change_password");
  return response;
}
