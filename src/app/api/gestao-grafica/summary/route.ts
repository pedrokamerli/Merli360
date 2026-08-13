import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicAccess, ensureGraphicDefaults, GRAPHIC_MODULE } from "@/lib/graphic";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    assertGraphicAccess(user);
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
      db.graphicProductionOrder.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 50, include: { order: true } }),
      db.graphicDelivery.findMany({ where: { tenantId: user.tenantId }, orderBy: { expectedAt: "asc" }, take: 50, include: { order: true } }),
      db.graphicPostSale.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 50, include: { order: true } }),
      db.graphicReceivable.findMany({ where: { tenantId: user.tenantId }, orderBy: { dueDate: "asc" }, take: 100 }),
      db.graphicProduct.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicMaterial.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicProcess.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
      db.graphicSetting.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" } })
    ]);

    const soldCents = orders.reduce((sum: number, item: any) => sum + item.soldValueCents, 0);
    const billedCents = orders.reduce((sum: number, item: any) => sum + item.billedValueCents, 0);
    const receivedCents = orders.reduce((sum: number, item: any) => sum + item.receivedValueCents, 0);
    const openReceivablesCents = receivables.filter((item: any) => item.status !== "PAID").reduce((sum: number, item: any) => sum + item.amountCents - item.receivedCents, 0);
    const overdueReceivablesCents = receivables.filter((item: any) => item.status !== "PAID" && new Date(item.dueDate) < today).reduce((sum: number, item: any) => sum + item.amountCents - item.receivedCents, 0);
    const returnsToday = opportunities.filter((item: any) => item.nextFollowUp && new Date(item.nextFollowUp) >= today && new Date(item.nextFollowUp) < tomorrow).length;
    const overdueReturns = opportunities.filter((item: any) => item.status === "OPEN" && item.nextFollowUp && new Date(item.nextFollowUp) < today).length;
    const qualityAlerts = opportunities.filter((item: any) => item.status === "OPEN" && (!item.nextAction || !item.nextFollowUp)).length;

    return NextResponse.json({
      module: GRAPHIC_MODULE,
      metrics: {
        opportunitiesOpen: opportunities.filter((item: any) => item.status === "OPEN").length,
        returnsToday,
        overdueReturns,
        qualityAlerts,
        quotesSent: quotes.filter((item: any) => ["SENT", "VIEWED"].includes(item.status)).length,
        quotesApproved: quotes.filter((item: any) => item.status === "APPROVED").length,
        productionOpen: productionOrders.filter((item: any) => ["PENDING", "RELEASED", "IN_PROGRESS", "BLOCKED"].includes(item.status)).length,
        deliveriesOpen: deliveries.filter((item: any) => ["PENDING", "SCHEDULED"].includes(item.status)).length,
        postSalesOpen: postSales.filter((item: any) => item.status === "OPEN").length,
        soldCents,
        billedCents,
        receivedCents,
        openReceivablesCents,
        overdueReceivablesCents,
        dataQuality: orders.length ? "OK" : "Dados insuficientes para calcular indicadores financeiros completos."
      },
      opportunities,
      quotes,
      orders,
      productionOrders,
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
