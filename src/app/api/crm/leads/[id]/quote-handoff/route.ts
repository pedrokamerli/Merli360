import { NextRequest, NextResponse } from "next/server";
import { requireApiModule } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { normalizePhone, CRM_MODULE } from "@/lib/crm";
import { assertGraphicPermission, ensureGraphicDefaults } from "@/lib/graphic";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiModule(CRM_MODULE);
    await assertGraphicPermission(user, "quote:create");
    await ensureGraphicDefaults(user.tenantId);
    const { id } = await params;
    const db = prisma as any;
    const lead = await db.lead.findFirst({ where: { id, tenantId: user.tenantId, archivedAt: null } });
    if (!lead) return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });

    const clientName = String(lead.companyName || lead.name || "").trim();
    if (!clientName) return NextResponse.json({ error: "Informe o nome do cliente antes de criar o orcamento." }, { status: 400 });
    const phone = normalizePhone(String(lead.normalizedPhone || lead.contact || "")) || null;
    const email = String(lead.email || "").trim() || null;
    const city = String(lead.city || "").trim() || null;
    const title = `Orcamento - ${clientName}`;
    const nextFollowUp = lead.nextFollowUp || new Date(Date.now() + 86_400_000);

    const result = await db.$transaction(async (tx: any) => {
      const client = await tx.client.findFirst({
        where: {
          tenantId: user.tenantId,
          OR: [
            ...(email ? [{ email }] : []),
            { name: clientName, city }
          ]
        }
      }) || await tx.client.create({
        data: {
          tenantId: user.tenantId,
          name: clientName,
          type: "grafica",
          phone,
          whatsapp: phone,
          email,
          city,
          state: String(lead.state || "") || null,
          segment: String(lead.segment || lead.type || "Grafica"),
          website: String(lead.website || "") || null,
          instagram: String(lead.socialLink || "") || null,
          notes: String(lead.notes || "") || null
        }
      });

      const existingOpportunity = await tx.graphicOpportunity.findFirst({
        where: { tenantId: user.tenantId, leadId: lead.id, status: { in: ["OPEN", "QUOTE_CREATED"] } },
        orderBy: { updatedAt: "desc" }
      });
      const opportunity = existingOpportunity || await tx.graphicOpportunity.create({
        data: {
          tenantId: user.tenantId,
          clientId: client.id,
          leadId: lead.id,
          ownerId: user.id,
          title,
          source: "CRM Comercial",
          productInterest: String(lead.interestService || lead.segment || "") || null,
          estimatedValueCents: Math.round(Number(lead.proposedValue || 0) * 100),
          nextAction: "Montar orcamento para o cliente",
          nextFollowUp,
          status: "OPEN",
          createdById: user.id,
          updatedById: user.id
        }
      });

      if (!existingOpportunity) {
        await tx.graphicActivity.create({
          data: { tenantId: user.tenantId, opportunityId: opportunity.id, userId: user.id, type: "QUOTE_STARTED", channel: "CRM", result: "Orcamento iniciado a partir do lead", createdById: user.id, updatedById: user.id }
        });
        await tx.crmActivity.create({
          data: { tenantId: user.tenantId, leadId: lead.id, userId: user.id, type: "Orcamento iniciado", channel: "Sistema", result: "Cliente e oportunidade vinculados a gestao da grafica", nextAction: "Montar orcamento" }
        });
      }
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          hasOpportunity: true,
          opportunityName: opportunity.title,
          opportunityStatus: "aberta",
          nextAction: "Montar orcamento para o cliente",
          nextFollowUp,
          ownerName: lead.ownerName || user.name || user.username,
          lastActionByUserId: user.id,
          lastActionByName: user.name || user.username,
          lastActionAt: new Date()
        }
      });
      return { client, opportunity, reused: Boolean(existingOpportunity) };
    });

    await audit({ tenantId: user.tenantId, userId: user.id, action: "crm_start_graphic_quote", entity: "lead", entityId: lead.id, request, metadata: { clientId: result.client.id, opportunityId: result.opportunity.id, reused: result.reused } });
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite criar orcamentos da grafica." : "Nao foi possivel preparar o orcamento." }, { status });
  }
}
