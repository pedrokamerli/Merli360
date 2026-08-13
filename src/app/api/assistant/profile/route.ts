import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { getOrCreateAssistantProfile } from "@/lib/assistant-profile";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET() {
  const user = await requireApiUser();
  const profile = await getOrCreateAssistantProfile(user);
  return NextResponse.json({ profile });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const body = await request.json();
  const existing = await prisma.assistantProfile.findFirst({ where: { tenantId: user.tenantId, userId: user.id } });
  const data = {
      tenantId: user.tenantId,
      userId: user.id,
      assistantName: text(body.assistantName) || "Assistente 360",
      ownerName: text(body.ownerName),
      businessName: text(body.businessName),
      goalsText: text(body.goalsText),
      preferences: text(body.preferences),
      personality: text(body.personality),
      memoryText: text(body.memoryText),
      onboardingStep: Number(body.onboardingStep || 0),
      onboardingCompleted: Boolean(body.onboardingCompleted)
  };
  const profile = existing
    ? await prisma.assistantProfile.update({ where: { id: existing.id }, data })
    : await prisma.assistantProfile.create({ data });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "update_ai_assistant_profile",
    entity: "assistantProfile",
    entityId: profile.id,
    request,
    metadata: { assistantName: profile.assistantName }
  });

  return NextResponse.json({ profile });
}
