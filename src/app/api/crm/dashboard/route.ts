import { NextRequest, NextResponse } from "next/server";
import { requireApiModule } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CRM_MODULE } from "@/lib/crm";

export const dynamic = "force-dynamic";

type LeadDashboardRow = {
  id: string;
  status: string;
  city?: string | null;
  segment?: string | null;
  ownerName?: string | null;
  origin?: string | null;
  nextFollowUp?: Date | null;
  attempts: number;
  proposedValue: number;
  closeChance: number;
  wonValue: number;
  opportunityStatus: string;
  hasOpportunity: boolean;
};

function sum(items: Array<{ proposedValue: number; closeChance: number; wonValue: number }>) {
  return items.reduce((total, item) => total + item.proposedValue, 0);
}

export async function GET(request: NextRequest) {
  const user = await requireApiModule(CRM_MODULE);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const params = request.nextUrl.searchParams;
  const filter: any = { tenantId: user.tenantId, archivedAt: null };
  for (const key of ["city", "ownerName", "status", "origin", "segment"]) if (params.get(key)) filter[key] = params.get(key);
  const [leads, activities] = await Promise.all([
    prisma.lead.findMany({ where: filter, select: { id: true, name: true, companyName: true, city: true, segment: true, status: true, temperature: true, priority: true, ownerName: true, origin: true, contact: true, nextAction: true, nextFollowUp: true, attempts: true, proposedValue: true, closeChance: true, wonValue: true, opportunityStatus: true, hasOpportunity: true, createdAt: true } }),
    prisma.crmActivity.findMany({ where: { tenantId: user.tenantId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, select: { type: true, createdAt: true } })
  ]) as [LeadDashboardRow[], Array<{ type: string; createdAt: Date }>];
  const stage = (name: string) => leads.filter((lead) => lead.status === name).length;
  const active = leads.filter((lead) => !["Cliente", "Sem interesse", "Nao contatar", "Nutricao"].includes(lead.status));
  const won = leads.filter((lead) => lead.opportunityStatus === "ganha" || lead.status === "Cliente");
  const lost = leads.filter((lead) => lead.opportunityStatus === "perdida" || lead.status === "Sem interesse");
  const open = leads.filter((lead) => lead.hasOpportunity && lead.opportunityStatus === "aberta");
  const overdue = active.filter((lead) => lead.nextFollowUp && lead.nextFollowUp < today);
  const metrics = {
    total: leads.length, new: stage("Novo"), contacted: stage("Contatado"), replied: stage("Respondeu"), qualified: stage("Qualificado"), meetings: stage("Reuniao agendada") + stage("Reunião agendada"), proposals: stage("Proposta enviada"), won: won.length, open: open.length,
    overdue: overdue.length, noNextAction: active.filter((lead) => !lead.nextFollowUp).length, noOwner: active.filter((lead) => !lead.ownerName).length,
    opportunityValue: sum(open), weightedRevenue: open.reduce((total, lead) => total + lead.proposedValue * (lead.closeChance / 100), 0), wonValue: won.reduce((total, lead) => total + (lead.wonValue || lead.proposedValue), 0), lostValue: sum(lost),
    conversion: active.length + won.length ? (won.length / Math.max(1, active.length + won.length)) * 100 : 0, averageTicket: won.length ? won.reduce((total, lead) => total + (lead.wonValue || lead.proposedValue), 0) / won.length : 0
  };
  const group = (field: "status" | "city" | "segment" | "ownerName" | "origin") => Object.entries(leads.reduce<Record<string, number>>((acc, lead: any) => { const key = lead[field] || "Nao informado"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const dueToday = active.filter((lead) => lead.nextFollowUp && lead.nextFollowUp >= today && lead.nextFollowUp < tomorrow);
  const workQueue = [...overdue, ...dueToday].filter((lead, index, list) => list.findIndex((item) => item.id === lead.id) === index).sort((a, b) => Number(Boolean(b.nextFollowUp && b.nextFollowUp < today)) - Number(Boolean(a.nextFollowUp && a.nextFollowUp < today))).slice(0, 30);
  return NextResponse.json({ metrics: { ...metrics, dueToday: dueToday.length, leadsWithoutTask: active.filter((lead) => !lead.nextFollowUp && lead.attempts === 0).length }, groups: { stages: group("status"), cities: group("city"), segments: group("segment"), owners: group("ownerName"), origins: group("origin") }, activityCount: activities.length, workQueue });
}
