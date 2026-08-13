import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildGraphicDashboard } from "@/lib/graphic-dashboard";
import { assertGraphicAccess, defaultGraphicRoleForUser, ensureGraphicDefaults, getGraphicRole, GRAPHIC_MODULE, graphicRoleSettingKey, hasGraphicPermission, parseGraphicRole } from "@/lib/graphic";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    assertGraphicAccess(user);
    const graphicRole = await getGraphicRole(user);
    const canViewFinancial = hasGraphicPermission(graphicRole, "cost:view") || graphicRole === "FINANCE";
    const canManageSettings = hasGraphicPermission(graphicRole, "settings:manage");
    await ensureGraphicDefaults(user.tenantId);
    const db = prisma as any;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [opportunities, quotes, orders, productionOrders, deliveries, postSales, receivables, products, materials, processes, settings, stages] = await Promise.all([
      db.graphicOpportunity.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 100, include: { activities: { orderBy: { createdAt: "desc" }, take: 3 }, tasks: { where: { status: "OPEN" }, orderBy: { dueDate: "asc" }, take: 3 } } }),
      db.graphicQuote.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 100, include: { items: true } }),
      db.graphicOrder.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 50 }),
      db.graphicProductionOrder.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 50, include: { order: true, steps: { orderBy: { position: "asc" } }, consumptions: true, reworks: true } }),
      db.graphicDelivery.findMany({ where: { tenantId: user.tenantId }, orderBy: { expectedAt: "asc" }, take: 50, include: { order: true } }),
      db.graphicPostSale.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 50, include: { order: true } }),
      db.graphicReceivable.findMany({ where: { tenantId: user.tenantId }, orderBy: { dueDate: "asc" }, take: 100 }),
      db.graphicProduct.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicMaterial.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicProcess.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicSetting.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" } }),
      db.graphicPipelineStage.findMany({ where: { tenantId: user.tenantId, active: true, status: "ACTIVE" }, orderBy: { position: "asc" } })
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
    const tenantUsers = canManageSettings
      ? await db.user.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true, role: true, moduleAccess: true } })
      : [];
    const graphicUsers = tenantUsers.map((item: any) => ({
      ...item,
      graphicRole: parseGraphicRole(settings.find((setting: any) => setting.key === graphicRoleSettingKey(item.id))?.value) || defaultGraphicRoleForUser(item)
    }));

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
      canManageSettings,
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
      settings,
      stages,
      users: graphicUsers
    });
  } catch (error: any) {
    await audit({ action: "graphic_summary_failed", status: "error", request, metadata: { message: String(error?.message || error) } });
    return NextResponse.json({ error: error?.message === "UNAUTHORIZED" ? "Autenticacao obrigatoria." : "Nao foi possivel carregar a Gestao da Grafica." }, { status: error?.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
