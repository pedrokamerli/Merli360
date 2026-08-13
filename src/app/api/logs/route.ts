import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (user.role !== "admin") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const status = request.nextUrl.searchParams.get("status") || "";
  const action = request.nextUrl.searchParams.get("action") || "";
  const entity = request.nextUrl.searchParams.get("entity") || "";
  const take = Math.min(Number(request.nextUrl.searchParams.get("take") || 200), 500);

  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId: user.tenantId,
      ...(status ? { status } : {}),
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {})
    },
    include: { user: { select: { name: true, username: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take
  });

  return NextResponse.json({ logs });
}
