import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicAccess, cents, dateOrNull, ensureGraphicDefaults } from "@/lib/graphic";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    assertGraphicAccess(user);
    await ensureGraphicDefaults(user.tenantId);
    const body = await request.json();
    const db = prisma as any;
    const clientName = String(body.clientName || "").trim();
    const title = String(body.title || clientName || "").trim();
    if (!clientName) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Informe a oportunidade." }, { status: 400 });
    if (!body.nextAction && !body.nextFollowUp) return NextResponse.json({ error: "Informe o proximo passo ou a data de retorno." }, { status: 400 });

    const client = await db.client.upsert({
      where: { id: String(body.clientId || "new") },
      update: {},
      create: {
        tenantId: user.tenantId,
        name: clientName,
        type: "grafica",
        phone: String(body.phone || "") || null,
        email: String(body.email || "") || null,
        city: String(body.city || "") || null,
        state: String(body.state || "") || null,
        segment: "Grafica"
      }
    }).catch(async () => db.client.create({
      data: {
        tenantId: user.tenantId,
        name: clientName,
        type: "grafica",
        phone: String(body.phone || "") || null,
        email: String(body.email || "") || null,
        city: String(body.city || "") || null,
        state: String(body.state || "") || null,
        segment: "Grafica"
      }
    }));

    const opportunity = await db.graphicOpportunity.create({
      data: {
        tenantId: user.tenantId,
        clientId: client.id,
        ownerId: user.id,
        title,
        source: String(body.source || "Atendimento") || null,
        productInterest: String(body.productInterest || "") || null,
        estimatedValueCents: cents(body.estimatedValue),
        nextAction: String(body.nextAction || "") || null,
        nextFollowUp: dateOrNull(body.nextFollowUp),
        qualityAlert: !body.nextAction || !body.nextFollowUp ? "Oportunidade aberta sem proximo passo completo." : null,
        createdById: user.id,
        updatedById: user.id
      }
    });

    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_create_opportunity", entity: "GraphicOpportunity", entityId: opportunity.id, request });
    return NextResponse.json({ item: opportunity, client });
  } catch (error: any) {
    return NextResponse.json({ error: "Nao foi possivel criar a oportunidade.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status: error?.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
