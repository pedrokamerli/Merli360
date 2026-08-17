import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildGraphicDashboard } from "@/lib/graphic-dashboard";
import { assertGraphicCommercialAccess, defaultGraphicRoleForUser, ensureGraphicDefaults, getGraphicRole, GRAPHIC_MODULE, graphicRoleSettingKey, hasGraphicPermission, parseGraphicRole } from "@/lib/graphic";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    assertGraphicCommercialAccess(user);
    const graphicRole = await getGraphicRole(user);
    const canViewFinancial = hasGraphicPermission(graphicRole, "cost:view");
    const canManageSettings = hasGraphicPermission(graphicRole, "settings:manage");
    const canViewProduction = hasGraphicPermission(graphicRole, "production:update") || graphicRole === "GRAPHIC_OWNER";
    const canViewInventory = hasGraphicPermission(graphicRole, "inventory:view") || canManageSettings;
    const canReviewCatalogRequests = hasGraphicPermission(graphicRole, "catalog-request:review");
    const mineOnly = request.nextUrl.searchParams.get("scope") === "mine" && graphicRole === "GRAPHIC_OPERATIONS";
    await ensureGraphicDefaults(user.tenantId);
    const db = prisma as any;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const commercialWhere = mineOnly ? { tenantId: user.tenantId, ownerId: user.id } : { tenantId: user.tenantId };
    const quoteWhere = mineOnly ? { tenantId: user.tenantId, responsibleId: user.id } : { tenantId: user.tenantId };
    const orderWhere = mineOnly ? { tenantId: user.tenantId, createdById: user.id } : { tenantId: user.tenantId };
    const [opportunities, quotes, orders, productionOrders, deliveries, postSales, receivables, products, catalogItems, materials, processes, settings, stages, existingClients, crmLeads] = await Promise.all([
      db.graphicOpportunity.findMany({ where: commercialWhere, orderBy: { updatedAt: "desc" }, take: 100, include: { owner: { select: { name: true, username: true } }, activities: { orderBy: { createdAt: "desc" }, take: 3 }, tasks: { where: { status: "OPEN" }, orderBy: { dueDate: "asc" }, take: 3 } } }),
      db.graphicQuote.findMany({ where: quoteWhere, orderBy: { updatedAt: "desc" }, take: 100, include: { items: { include: { product: { select: { name: true } }, catalogVariant: { include: { catalogItem: { select: { name: true } } } } } } } }),
      db.graphicOrder.findMany({ where: orderWhere, orderBy: { createdAt: "desc" }, take: 50, include: { quote: { include: { opportunity: { select: { productInterest: true } }, items: { include: { product: { select: { name: true } } } } } } } }),
      db.graphicProductionOrder.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 50, include: { order: { include: { quote: { select: { approvedAt: true } } } }, steps: { orderBy: { position: "asc" } }, consumptions: true, reworks: true } }),
      db.graphicDelivery.findMany({ where: { tenantId: user.tenantId }, orderBy: { expectedAt: "asc" }, take: 50, include: { order: true } }),
      db.graphicPostSale.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 50, include: { order: true } }),
      db.graphicReceivable.findMany({ where: { tenantId: user.tenantId }, orderBy: { dueDate: "asc" }, take: 100 }),
      db.graphicProduct.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" }, include: { components: { include: { material: true } }, processes: { include: { process: true } }, versions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } } }),
      db.graphicCatalogItem.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { variants: { where: { status: "ACTIVE" }, orderBy: [{ quantity: "asc" }, { widthMm: "asc" }, { heightMm: "asc" }], include: { product: { select: { id: true, name: true } } } } } }),
      db.graphicMaterial.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicProcess.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicSetting.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" } }),
      db.graphicPipelineStage.findMany({ where: { tenantId: user.tenantId, active: true, status: "ACTIVE" }, orderBy: { position: "asc" } }),
      db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, phone: true, email: true, city: true, state: true, segment: true } }),
      db.lead.findMany({ where: { tenantId: user.tenantId, archivedAt: null }, orderBy: { updatedAt: "desc" }, take: 500, select: { name: true, companyName: true, contact: true, normalizedPhone: true, email: true, city: true, state: true, segment: true, website: true, socialLink: true, notes: true } })
    ]);

    // The legacy CRM remains the source history, while its active contacts are made available for quotes here.
    const clientKeys = new Set(existingClients.map((client: any) => [String(client.name || "").trim().toLowerCase(), String(client.phone || "").replace(/\D/g, ""), String(client.email || "").trim().toLowerCase(), String(client.city || "").trim().toLowerCase()].join("|")));
    const clientsToCreate = crmLeads.reduce((rows: any[], lead: any) => {
      const name = String(lead.companyName || lead.name || "").trim();
      if (!name) return rows;
      const phone = String(lead.normalizedPhone || lead.contact || "").replace(/\D/g, "");
      const email = String(lead.email || "").trim();
      const city = String(lead.city || "").trim();
      const key = [name.toLowerCase(), phone, email.toLowerCase(), city.toLowerCase()].join("|");
      if (clientKeys.has(key)) return rows;
      clientKeys.add(key);
      rows.push({ tenantId: user.tenantId, name, type: "grafica", phone: phone || null, email: email || null, city: city || null, state: String(lead.state || "") || null, segment: String(lead.segment || "") || "Grafica", website: String(lead.website || "") || null, instagram: String(lead.socialLink || "") || null, notes: String(lead.notes || "") || null });
      return rows;
    }, []);
    if (clientsToCreate.length) await db.client.createMany({ data: clientsToCreate });
    const allClients = clientsToCreate.length ? await db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, phone: true, email: true, city: true, state: true, segment: true } }) : existingClients;

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
    const clientIds = [...new Set([...opportunities.map((item: any) => item.clientId), ...quotes.map((item: any) => item.clientId), ...orders.map((item: any) => item.clientId)].filter(Boolean))];
    const clients = clientIds.length ? await db.client.findMany({ where: { tenantId: user.tenantId, id: { in: clientIds } }, select: { id: true, name: true, segment: true, phone: true, whatsapp: true, email: true, address: true, addressNumber: true, district: true, city: true, state: true, zipCode: true } }) : [];
    const clientsById = new Map<string, any>(clients.map((item: any) => [item.id, item]));
    const opportunityRows = opportunities.map((item: any) => ({ ...item, ownerName: item.owner?.name || item.owner?.username || "Sem responsavel" }));
    const quoteRows = quotes.map((item: any) => ({ ...item, client: clientsById.get(item.clientId) || null, productName: item.items?.[0]?.catalogVariant?.catalogItem?.name || item.items?.[0]?.product?.name || item.items?.[0]?.description || "Produto a definir" }));
    const orderRows = orders.map((item: any) => ({ ...item, clientName: clientsById.get(item.clientId)?.name || "Cliente sem nome", clientSegment: clientsById.get(item.clientId)?.segment || "Sem segmento", productName: item.quote?.items?.[0]?.product?.name || item.quote?.items?.[0]?.description || item.quote?.opportunity?.productInterest || "Produto a definir" }));
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
    const duplicateClientKeys = new Set<string>();
    const duplicateClients = new Set<string>();
    for (const client of allClients) {
      const key = [client.name, client.phone].map((value) => String(value || "").trim().toLocaleLowerCase()).filter(Boolean).join("|");
      if (!key) continue;
      if (duplicateClientKeys.has(key)) duplicateClients.add(key);
      duplicateClientKeys.add(key);
    }
    const visibleClients = mineOnly ? allClients.filter((client: any) => clientIds.includes(client.id)) : allClients;
    const qualityItems = [
      { key: "opportunity-without-return", label: "Oportunidades sem proximo passo", count: opportunityRows.filter((item: any) => item.status === "OPEN" && (!item.nextAction || !item.nextFollowUp)).length, action: "Agendar retorno comercial" },
      { key: "follow-up-overdue", label: "Follow-ups vencidos", count: opportunityRows.filter((item: any) => item.status === "OPEN" && item.nextFollowUp && new Date(item.nextFollowUp) < today).length, action: "Retornar cliente" },
      { key: "quote-incomplete", label: "Orcamentos sem item", count: quoteRows.filter((item: any) => !item.items?.length).length, action: "Revisar orcamento" },
      { key: "production-without-responsible", label: "Ordens sem responsavel", count: productionRows.filter((item: any) => !item.responsibleId && !["COMPLETED", "CANCELLED"].includes(item.status)).length, action: "Definir responsavel" },
      { key: "production-delayed", label: "Pedidos atrasados", count: productionRows.filter((item: any) => item.promisedAt && new Date(item.promisedAt) < today && !["COMPLETED", "CANCELLED"].includes(item.status)).length, action: "Replanejar producao" },
      { key: "negative-stock", label: "Estoque negativo", count: materials.filter((item: any) => Number(item.currentStock || 0) < 0).length, action: "Conferir movimentacoes" },
      { key: "overdue-receivable", label: "Recebiveis vencidos", count: canViewFinancial ? receivables.filter((item: any) => item.status !== "PAID" && new Date(item.dueDate) < today).length : null, action: "Cobrar ou registrar baixa" },
      { key: "material-without-cost", label: "Materiais sem custo atualizado", count: materials.filter((item: any) => Number(item.currentCostCents || 0) <= 0).length, action: "Atualizar custo" }
      , { key: "duplicate-client", label: "Possiveis clientes duplicados", count: duplicateClients.size, action: "Conferir cadastro do cliente" }
    ];

    const availableProducts = products.map((product: any) => ({ ...product, pricingReady: Boolean(product.versions?.length), versions: undefined }));
    const availableCatalogItems = catalogItems.map((item: any) => ({
      ...item,
      variants: item.variants.map((variant: any) => canViewFinancial || canManageSettings ? variant : ({ ...variant, costCents: undefined, sourcePriceCents: undefined, sourceData: undefined }))
    }));
    const catalogToken = settings.find((item: any) => item.key === "catalogPublicToken")?.value || null;

    return NextResponse.json({
      module: GRAPHIC_MODULE,
      role: graphicRole,
      canViewFinancial,
      canManageSettings,
      canReviewCatalogRequests,
      metrics: dashboard.metrics,
      metricNotes: dashboard.metricNotes,
      qualityItems,
      groups: dashboard.groups,
      opportunities: hasGraphicPermission(graphicRole, "opportunity:write") || graphicRole === "GRAPHIC_OWNER" ? opportunityRows : [],
      quotes: hasGraphicPermission(graphicRole, "quote:create") || canViewFinancial ? quoteRows : [],
      catalogRequests: canReviewCatalogRequests ? quoteRows.filter((item: any) => item.source === "PUBLIC_CATALOG" && item.status === "PENDING_REVIEW") : [],
      orders: hasGraphicPermission(graphicRole, "quote:create") || canViewFinancial || canViewProduction ? orderRows : [],
      productionOrders: canViewProduction ? productionRows : [],
      deliveries: canViewProduction ? deliveryRows : [],
      postSales: hasGraphicPermission(graphicRole, "post-sale:update") || graphicRole === "GRAPHIC_OWNER" ? postSales : [],
      receivables: canViewFinancial ? receivables : [],
      products: canViewFinancial ? availableProducts : availableProducts.map((product: any) => ({ ...product, components: product.components.map((component: any) => ({ ...component, material: { id: component.material.id, name: component.material.name, unit: component.material.unit } })), processes: product.processes.map((process: any) => ({ ...process, process: { id: process.process.id, name: process.process.name, unit: process.process.unit } })) })),
      catalogItems: availableCatalogItems,
      catalogPublicPath: catalogToken ? `/public/catalogo/${catalogToken}` : null,
      clients: visibleClients,
      materials: canViewFinancial ? materials : canViewInventory ? materials.map((material: any) => ({ id: material.id, name: material.name, code: material.code, unit: material.unit, currentStock: material.currentStock, minStock: material.minStock, location: material.location, status: material.status })) : [],
      processes,
      settings: canManageSettings ? settings : [],
      operationalSettings: Object.fromEntries(settings.filter((item: any) => ["lossReasons", "reworkReasons", "productionIssueCategories"].includes(item.key)).map((item: any) => [item.key, item.value])),
      stages,
      users: graphicUsers
    });
  } catch (error: any) {
    await audit({ action: "graphic_summary_failed", status: "error", request, metadata: { message: String(error?.message || error) } });
    return NextResponse.json({ error: error?.message === "UNAUTHORIZED" ? "Autenticacao obrigatoria." : "Nao foi possivel carregar a Gestao da Grafica." }, { status: error?.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
