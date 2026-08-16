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
    const canViewFinancial = hasGraphicPermission(graphicRole, "cost:view");
    const canManageSettings = hasGraphicPermission(graphicRole, "settings:manage");
    const canViewProduction = hasGraphicPermission(graphicRole, "production:update") || graphicRole === "GRAPHIC_OWNER";
    const canViewInventory = hasGraphicPermission(graphicRole, "inventory:view") || canManageSettings;
    await ensureGraphicDefaults(user.tenantId);
    const db = prisma as any;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [opportunities, quotes, orders, productionOrders, deliveries, postSales, receivables, products, materials, processes, settings, stages, allClients] = await Promise.all([
      db.graphicOpportunity.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 100, include: { owner: { select: { name: true, username: true } }, activities: { orderBy: { createdAt: "desc" }, take: 3 }, tasks: { where: { status: "OPEN" }, orderBy: { dueDate: "asc" }, take: 3 } } }),
      db.graphicQuote.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 100, include: { client: { select: { name: true, phone: true, email: true } }, items: { include: { product: { select: { name: true } } } } } }),
      db.graphicOrder.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 50, include: { quote: { select: { productInterest: true } } } }),
      db.graphicProductionOrder.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 50, include: { order: { include: { quote: { select: { approvedAt: true } } } }, steps: { orderBy: { position: "asc" } }, consumptions: true, reworks: true } }),
      db.graphicDelivery.findMany({ where: { tenantId: user.tenantId }, orderBy: { expectedAt: "asc" }, take: 50, include: { order: true } }),
      db.graphicPostSale.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 50, include: { order: true } }),
      db.graphicReceivable.findMany({ where: { tenantId: user.tenantId }, orderBy: { dueDate: "asc" }, take: 100 }),
      db.graphicProduct.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" }, include: { components: { include: { material: true } }, processes: { include: { process: true } } } }),
      db.graphicMaterial.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicProcess.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicSetting.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" } }),
      db.graphicPipelineStage.findMany({ where: { tenantId: user.tenantId, active: true, status: "ACTIVE" }, orderBy: { position: "asc" } }),
      db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, phone: true, email: true, city: true, state: true, segment: true } })
    ]);

    const graphicAttachments = await db.graphicAttachment.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { linkedModel: "production", linkedId: { in: productionOrders.map((item: any) => item.id) } },
          { linkedModel: "delivery", linkedId: { in: deliveries.map((item: any) => item.id) } }
        ],
        status: "ACTIVE"
      },
      orderBy: { createdAt: "desc" }
    });
    const attachmentRows = graphicAttachments.length
      ? await db.attachment.findMany({ where: { tenantId: user.tenantId, id: { in: graphicAttachments.map((item: any) => item.attachmentId) } } })
      : [];
    const attachmentsById = new Map(attachmentRows.map((item: any) => [item.id, item]));
    const productionAttachments = graphicAttachments.filter((item: any) => item.linkedModel === "production");
    const deliveryAttachments = graphicAttachments.filter((item: any) => item.linkedModel === "delivery");
    const attachmentsByProduction = productionAttachments.reduce((acc: Record<string, any[]>, item: any) => {
      acc[item.linkedId] = [...(acc[item.linkedId] || []), { ...item, attachment: attachmentsById.get(item.attachmentId), url: `/api/attachments/${item.attachmentId}` }];
      return acc;
    }, {});
    const attachmentsByDelivery = deliveryAttachments.reduce((acc: Record<string, any[]>, item: any) => {
      acc[item.linkedId] = [...(acc[item.linkedId] || []), { ...item, attachment: attachmentsById.get(item.attachmentId), url: `/api/attachments/${item.attachmentId}` }];
      return acc;
    }, {});
    const productionRows = productionOrders.map((item: any) => ({ ...item, attachments: attachmentsByProduction[item.id] || [] }));
    const deliveryRows = deliveries.map((item: any) => ({ ...item, attachments: attachmentsByDelivery[item.id] || [] }));
    const clientIds = [...new Set([...opportunities.map((item: any) => item.clientId), ...orders.map((item: any) => item.clientId)].filter(Boolean))];
    const clients = clientIds.length ? await db.client.findMany({ where: { tenantId: user.tenantId, id: { in: clientIds } }, select: { id: true, name: true, segment: true } }) : [];
    const clientsById = new Map<string, any>(clients.map((item: any) => [item.id, item]));
    const opportunityRows = opportunities.map((item: any) => ({ ...item, ownerName: item.owner?.name || item.owner?.username || "Sem responsavel" }));
    const quoteRows = quotes.map((item: any) => ({ ...item, productName: item.items?.[0]?.product?.name || item.items?.[0]?.description || "Produto a definir" }));
    const orderRows = orders.map((item: any) => ({ ...item, clientName: clientsById.get(item.clientId)?.name || "Cliente sem nome", clientSegment: clientsById.get(item.clientId)?.segment || "Sem segmento", productName: item.quote?.productInterest || "Produto a definir" }));
    const tenantUsers = canManageSettings
      ? await db.user.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true, role: true, moduleAccess: true } })
      : [];
    const graphicUsers = tenantUsers.map((item: any) => ({
      ...item,
      graphicRole: parseGraphicRole(settings.find((setting: any) => setting.key === graphicRoleSettingKey(item.id))?.value) || defaultGraphicRoleForUser(item)
    }));

    const dashboard = buildGraphicDashboard({
      opportunities: opportunityRows,
      quotes: quoteRows,
      orders: orderRows,
      productionOrders: productionRows,
      deliveries: deliveryRows,
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
      groups: dashboard.groups,
      opportunities: hasGraphicPermission(graphicRole, "opportunity:write") || graphicRole === "GRAPHIC_OWNER" ? opportunityRows : [],
      quotes: hasGraphicPermission(graphicRole, "quote:create") || canViewFinancial ? quoteRows : [],
      orders: canViewFinancial || canViewProduction ? orderRows : [],
      productionOrders: canViewProduction ? productionRows : [],
      deliveries: canViewProduction ? deliveryRows : [],
      postSales: hasGraphicPermission(graphicRole, "post-sale:update") || graphicRole === "GRAPHIC_OWNER" ? postSales : [],
      receivables: canViewFinancial ? receivables : [],
      products: canViewFinancial ? products : products.map((product: any) => ({ ...product, components: product.components.map((component: any) => ({ ...component, material: { id: component.material.id, name: component.material.name, unit: component.material.unit } })), processes: product.processes.map((process: any) => ({ ...process, process: { id: process.process.id, name: process.process.name, unit: process.process.unit } })) })),
      clients: allClients,
      materials: canViewFinancial ? materials : canViewInventory ? materials.map((material: any) => ({ id: material.id, name: material.name, code: material.code, unit: material.unit, currentStock: material.currentStock, minStock: material.minStock, location: material.location, status: material.status })) : [],
      processes,
      settings: canManageSettings ? settings : [],
      stages,
      users: graphicUsers
    });
  } catch (error: any) {
    await audit({ action: "graphic_summary_failed", status: "error", request, metadata: { message: String(error?.message || error) } });
    return NextResponse.json({ error: error?.message === "UNAUTHORIZED" ? "Autenticacao obrigatoria." : "Nao foi possivel carregar a Gestao da Grafica." }, { status: error?.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
