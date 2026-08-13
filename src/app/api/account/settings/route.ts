import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  return NextResponse.json({
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      whatsapp: user.whatsapp,
      phone: user.phone,
      document: user.document,
      address: user.address,
      addressNumber: user.addressNumber,
      district: user.district,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      notes: user.notes
    }
  });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const body = await request.json();
  const name = String(body.name || "").trim();

  if (!name) return NextResponse.json({ error: "Nome obrigatorio." }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      email: String(body.email || "").trim() || null,
      whatsapp: String(body.whatsapp || "").trim() || null,
      phone: String(body.phone || "").trim() || null,
      document: String(body.document || "").trim() || null,
      address: String(body.address || "").trim() || null,
      addressNumber: String(body.addressNumber || "").trim() || null,
      district: String(body.district || "").trim() || null,
      city: String(body.city || "").trim() || null,
      state: String(body.state || "").trim() || null,
      zipCode: String(body.zipCode || "").trim() || null,
      notes: String(body.notes || "").trim() || null
    },
    include: { tenant: true }
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "user_update_account_settings",
    entity: "User",
    entityId: user.id,
    request,
    metadata: { fields: ["profile"] }
  });

  return NextResponse.json({
    account: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      whatsapp: updated.whatsapp,
      phone: updated.phone,
      document: updated.document,
      address: updated.address,
      addressNumber: updated.addressNumber,
      district: updated.district,
      city: updated.city,
      state: updated.state,
      zipCode: updated.zipCode,
      notes: updated.notes
    }
  });
}
