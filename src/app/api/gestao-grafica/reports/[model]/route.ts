import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicAccess, getGraphicRole } from "@/lib/graphic";
import { buildGraphicCsv, canAccessGraphicReport, graphicReportConfigs, isGraphicReportModel } from "@/lib/graphic-reports";

export const dynamic = "force-dynamic";

function centsToMoney(cents: number) {
  return Number(cents || 0) / 100;
}

function normalizeStatus(value: string | null) {
  return String(value || "");
}

export async function GET(request: NextRequest, context: { params: Promise<{ model: string }> }) {
  try {
    const user = await requireApiUser();
    assertGraphicAccess(user);
    const role = await getGraphicRole(user);
    const { model } = await context.params;
    if (!isGraphicReportModel(model)) return NextResponse.json({ error: "Relatorio da grafica nao encontrado." }, { status: 404 });
    if (!canAccessGraphicReport(role, model)) return NextResponse.json({ error: "Seu perfil nao permite exportar este relatorio." }, { status: 403 });

    const db = prisma as any;
    const status = request.nextUrl.searchParams.get("status") || "";
    const rows = await loadRows(db, user.tenantId, model, status);
    const csv = buildGraphicCsv(model, rows);

    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_export_report", entity: "GraphicReport", entityId: model, request, metadata: { model, rows: rows.length } });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${graphicReportConfigs[model].filename}.csv"`
      }
    });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite acessar relatorios da grafica." : "Nao foi possivel exportar o relatorio da grafica.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}

async function loadRows(db: any, tenantId: string, model: string, status: string) {
  const statusWhere = status ? { status } : {};
  if (model === "opportunities") {
    const rows = await db.graphicOpportunity.findMany({ where: { tenantId, ...statusWhere }, orderBy: { createdAt: "desc" }, take: 1000 });
    const clients = await db.client.findMany({ where: { tenantId, id: { in: rows.map((row: any) => row.clientId).filter(Boolean) } }, select: { id: true, name: true } });
    const clientById = new Map(clients.map((client: any) => [client.id, client.name]));
    return rows.map((row: any) => ({ ...row, clientName: clientById.get(row.clientId) || "", estimatedValue: centsToMoney(row.estimatedValueCents), status: normalizeStatus(row.status) }));
  }

  if (model === "quotes") {
    const rows = await db.graphicQuote.findMany({ where: { tenantId, ...statusWhere }, orderBy: { createdAt: "desc" }, take: 1000 });
    const clients = await db.client.findMany({ where: { tenantId, id: { in: rows.map((row: any) => row.clientId).filter(Boolean) } }, select: { id: true, name: true } });
    const clientById = new Map(clients.map((client: any) => [client.id, client.name]));
    return rows.map((row: any) => ({ ...row, clientName: clientById.get(row.clientId) || "", totalPrice: centsToMoney(row.totalPriceCents), status: normalizeStatus(row.status) }));
  }

  if (model === "orders") {
    const rows = await db.graphicOrder.findMany({ where: { tenantId, ...statusWhere }, orderBy: { createdAt: "desc" }, take: 1000 });
    const clients = await db.client.findMany({ where: { tenantId, id: { in: rows.map((row: any) => row.clientId).filter(Boolean) } }, select: { id: true, name: true } });
    const clientById = new Map(clients.map((client: any) => [client.id, client.name]));
    return rows.map((row: any) => ({ ...row, clientName: clientById.get(row.clientId) || "", soldValue: centsToMoney(row.soldValueCents), billedValue: centsToMoney(row.billedValueCents), receivedValue: centsToMoney(row.receivedValueCents), status: normalizeStatus(row.status) }));
  }

  if (model === "production") {
    const rows = await db.graphicProductionOrder.findMany({ where: { tenantId, ...statusWhere }, include: { order: true, steps: true, reworks: true }, orderBy: { createdAt: "desc" }, take: 1000 });
    return rows.map((row: any) => ({ ...row, orderNumber: row.order?.number || "", stepsTotal: row.steps?.length || 0, stepsCompleted: (row.steps || []).filter((step: any) => step.status === "COMPLETED").length, reworksOpen: (row.reworks || []).filter((rework: any) => rework.status === "OPEN").length, status: normalizeStatus(row.status) }));
  }

  if (model === "receivables") {
    const rows = await db.graphicReceivable.findMany({ where: { tenantId, ...statusWhere }, include: { order: true }, orderBy: { dueDate: "desc" }, take: 1000 });
    return rows.map((row: any) => ({ ...row, orderNumber: row.order?.number || "", amount: centsToMoney(row.amountCents), received: centsToMoney(row.receivedCents), pending: centsToMoney(row.amountCents - row.receivedCents), status: normalizeStatus(row.status) }));
  }

  if (model === "audit") {
    const rows = await db.auditLog.findMany({ where: { tenantId, action: { startsWith: "graphic_" } }, orderBy: { createdAt: "desc" }, take: 1000 });
    return rows.map((row: any) => ({ ...row, metadata: typeof row.metadata === "string" ? row.metadata : JSON.stringify(row.metadata || {}) }));
  }

  return [];
}
