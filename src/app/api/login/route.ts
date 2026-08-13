import { NextRequest, NextResponse } from "next/server";
import { authCookieName, createSessionToken, hashPassword, hostTenantKind } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function publicUrl(request: NextRequest, path: string) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const proto = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const kind = await hostTenantKind();

  const user = await prisma.user.findUnique({ where: { username }, include: { tenant: true } });
  if (!user || user.passwordHash !== hashPassword(password)) {
    await audit({
      action: "login_failed",
      status: "error",
      message: `Tentativa de login invalida para ${username}`,
      request,
      metadata: { username, kind }
    });
    return NextResponse.redirect(publicUrl(request, "/login?error=1"));
  }

  if (kind === "agro" && user.tenant.kind !== "agro") {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "login_blocked_wrong_tenant",
      status: "error",
      message: "Usuario tentou acessar subdominio de outro perfil",
      request,
      metadata: { username, hostKind: kind, tenantKind: user.tenant.kind }
    });
    return NextResponse.redirect(publicUrl(request, "/login?error=1"));
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "login_success",
    entity: "User",
    entityId: user.id,
    request
  });

  const profile = await prisma.assistantProfile.findFirst({
    where: { tenantId: user.tenantId, userId: user.id },
    select: { onboardingCompleted: true }
  });
  const needsFirstSetup = user.mustChangePassword || !profile?.onboardingCompleted;

  const response = NextResponse.redirect(publicUrl(request, needsFirstSetup ? "/primeiro-acesso" : "/"));
  response.cookies.set(authCookieName, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  if (user.mustChangePassword) {
    response.cookies.set("merli360_must_change_password", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  } else {
    response.cookies.delete("merli360_must_change_password");
  }
  if (needsFirstSetup) {
    response.cookies.set("merli360_first_setup", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  } else {
    response.cookies.delete("merli360_first_setup");
  }
  return response;
}
