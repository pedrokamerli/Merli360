import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildGraphicDashboard } from "@/lib/graphic-dashboard";
import { assertGraphicAccess, ensureGraphicDefaults, getGraphicRole, GRAPHIC_MODULE, hasGraphicPermission } from "@/lib/graphic";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    assertGraphicAccess(user);
    const graphicRole = await getGraphicRole(user);
    const canViewFinancial = hasGraphicPermission(graphicRole, "cost:view") || graphicRole === "FINANCE";
    await ensureGraphicDefaults(user.tenantId);
    const db = prisma as any;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [opportunities, quotes, orders, productionOrders, deliveries, postSales, receivables, products, materials, processes, settings] = await Promise.all([
      db.graphicOpportunity.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 100 }),
      db.graphicQuote.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 100, include: { items: true } }),
      db.graphicOrder.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 50 }),
      db.graphicProductionOrder.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 50, include: { order: true, steps: { orderBy: { position: "asc" } }, consumptions: true, reworks: true } }),
      db.graphicDelivery.findMany({ where: { tenantId: user.tenantId }, orderBy: { expectedAt: "asc" }, take: 50, include: { order: true } }),
      db.graphicPostSale.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 50, include: { order: true } }),
      db.graphicReceivable.findMany({ where: { tenantId: user.tenantId }, orderBy: { dueDate: "asc" }, take: 100 }),
      db.graphicProduct.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicMaterial.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicProcess.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicSetting.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" } })
    ]);

    const productionAttachments = await db.graphicAttachment.findMany({
      where: { tenantId: user.tenantId, linkedModel: "production", linkedId: { in: productionOrders.map((item: any) => item.id) }, status: "ACTIVE" },
      orderBy: { createdAt: "desc" }
    });
    const attachmentsByProduction = productionAttachments.reduce((acc: Record<string, any[]>, item: any) => {
      acc[item.linkedId] = [...(acc[item.linkedId] || []), item];
      return acc;
    }, {});
    const productionRows = productionOrders.map((item: any) => ({ ...item, attachments: attachmentsByProduction[item.id] || [] }));

    const dashboard = buildGraphicDashboard({
      opportunities,
      quotes,
      orders,
      productionOrders: productionRows,
      deliveries,
      postSales,
      receivables,
      today,
      tomorrow,
      canViewFinancial
    });

    return NextResponse.json({
      module: GRAPHIC_MODULE,
      role: graphicRole,
      canViewFinancial,
      metrics: dashboard.metrics,
      metricNotes: dashboard.metricNotes,
      opportunities,
      quotes,
      orders,
      productionOrders: productionRows,
      deliveries,
      postSales,
      receivables,
      products,
      materials,
      processes,
      settings
    });
  } catch (error: any) {
    await audit({ action: "graphic_summary_failed", status: "error", request, metadata: { message: String(error?.message || error) } });
    return NextResponse.json({ error: error?.message === "UNAUTHORIZED" ? "Autenticacao obrigatoria." : "Nao foi possivel carregar a Gestao da Grafica." }, { status: error?.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
