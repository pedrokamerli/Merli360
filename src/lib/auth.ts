import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/crm";

const cookieName = "merli360_session";

function secret() {
  return process.env.AUTH_SECRET || process.env.BASIC_AUTH_PASSWORD || "merli360-local-secret";
}

export function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, createdAt: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: string; createdAt: number };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  const session = readSessionToken(token);
  if (!session?.userId) return null;

  return prisma.user.findUnique({
    where: { id: session.userId },
    include: { tenant: true }
  });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== "superadmin") redirect("/");
  return user;
}

export async function requireApiSuperAdmin() {
  const user = await requireApiUser();
  if (user.role !== "superadmin") throw new Error("FORBIDDEN");
  return user;
}

export async function requireApiModule(module: string) {
  const user = await requireApiUser();
  if (!hasModuleAccess(user, module)) throw new Error("FORBIDDEN_MODULE");
  return user;
}

export async function hostTenantKind() {
  const headerStore = await headers();
  const host = headerStore.get("host") || "";
  return host.startsWith("agro.") ? "agro" : "consultoria";
}

export const authCookieName = cookieName;
