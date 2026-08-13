import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission } from "@/lib/graphic";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "post-sale:update");
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Informe o pos-venda." }, { status: 400 });
    const satisfaction = body.satisfaction === undefined || body.satisfaction === "" ? null : Number(body.satisfaction);
    if (satisfaction !== null && (satisfaction < 1 || satisfaction > 5)) return NextResponse.json({ error: "Satisfacao deve ser de 1 a 5." }, { status: 400 });
    const db = prisma as any;
    const existing = await db.graphicPostSale.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return NextResponse.json({ error: "Pos-venda nao encontrado." }, { status: 404 });
    const item = await db.graphicPostSale.update({
      where: { id },
      data: {
        satisfaction,
        note: String(body.note || existing.note || "") || null,
        status: String(body.status || "DONE"),
        updatedById: user.id
      }
    });
    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_update_post_sale", entity: "GraphicPostSale", entityId: id, request, metadata: { satisfaction, status: item.status } });
    return NextResponse.json({ item });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite atualizar pos-venda." : "Nao foi possivel atualizar o pos-venda.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
