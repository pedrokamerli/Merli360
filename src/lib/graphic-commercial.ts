import { prisma } from "@/lib/prisma";
import { graphicProductionSteps } from "@/lib/graphic";
import { buildGraphicInstallments } from "@/lib/graphic-receivables";
import { nextQuoteVersion } from "@/lib/graphic-quotes";

type ApproveGraphicQuoteInput = {
  tenantId: string;
  quoteId: string;
  userId?: string | null;
  approvedPublicly?: boolean;
  auditAction?: string;
  db?: any;
};

async function nextOrderNumber(db: any, tenantId: string) {
  const last = await db.graphicOrder.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true }
  });
  return (last?.number || 0) + 1;
}

/** Converts one approved quote into the complete operational chain in one transaction. */
export async function approveGraphicQuote(input: ApproveGraphicQuoteInput) {
  const db = input.db || prisma as any;
  try {
    return await db.$transaction(async (tx: any) => {
    const quote = await tx.graphicQuote.findFirst({
      where: { id: input.quoteId, tenantId: input.tenantId },
      include: {
        items: true,
        approvals: { where: { status: "PENDING" } },
        versions: { select: { version: true } }
      }
    });
    if (!quote) throw new Error("QUOTE_NOT_FOUND");

    const existingOrder = await tx.graphicOrder.findFirst({
      where: { tenantId: input.tenantId, quoteId: quote.id },
      include: { productionOrders: true }
    });
    if (existingOrder) {
      return { quote, order: existingOrder, production: existingOrder.productionOrders[0] || null, alreadyApproved: true };
    }

    if (quote.status === "APPROVED") throw new Error("QUOTE_APPROVAL_INCOMPLETE");
    if (!["SENT", "VIEWED"].includes(quote.status)) throw new Error("QUOTE_NOT_SENT");
    if (new Date(quote.validUntil) < new Date()) throw new Error("QUOTE_EXPIRED");
    if (!quote.items.length) throw new Error("QUOTE_WITHOUT_ITEMS");
    if (quote.approvalRequired || quote.approvals.length) throw new Error("QUOTE_COMMERCIAL_APPROVAL_PENDING");

    const approvedAt = new Date();
    const orderNumber = await nextOrderNumber(tx, input.tenantId);
    const approvedQuote = await tx.graphicQuote.update({
      where: { id: quote.id },
      data: { status: "APPROVED", approvedAt, approvedById: input.userId || null, updatedById: input.userId || null }
    });
    const order = await tx.graphicOrder.create({
      data: {
        tenantId: input.tenantId,
        quoteId: quote.id,
        clientId: quote.clientId,
        number: orderNumber,
        soldValueCents: quote.totalPriceCents,
        billedValueCents: quote.totalPriceCents,
        commercialSnapshot: JSON.stringify({ quote, approvedAt: approvedAt.toISOString(), approvedPublicly: Boolean(input.approvedPublicly) }),
        productionSnapshot: JSON.stringify({ items: quote.items }),
        createdById: input.userId || null,
        updatedById: input.userId || null
      }
    });
    await tx.graphicOrderItem.createMany({
      data: quote.items.map((item: any) => ({
        tenantId: input.tenantId,
        orderId: order.id,
        description: item.description,
        quantity: item.quantity,
        priceCents: item.priceCents,
        costCents: item.costCents,
        snapshot: JSON.stringify(item),
        createdById: input.userId || null,
        updatedById: input.userId || null
      }))
    });
    const production = await tx.graphicProductionOrder.create({
      data: {
        tenantId: input.tenantId,
        orderId: order.id,
        status: "PENDING",
        checklist: JSON.stringify({ arte: false, medidas: false, material: false, prazo: false, arquivos: false }),
        technicalSnapshot: JSON.stringify({ quote, items: quote.items }),
        createdById: input.userId || null,
        updatedById: input.userId || null
      }
    });
    await tx.graphicProductionStep.createMany({
      data: graphicProductionSteps.map((name, position) => ({
        tenantId: input.tenantId,
        productionOrderId: production.id,
        name,
        position,
        createdById: input.userId || null,
        updatedById: input.userId || null
      }))
    });

    const installments = buildGraphicInstallments(quote.totalPriceCents, quote.paymentTerms, approvedAt);
    for (const installment of installments) {
      const title = await tx.financialTitle.create({
        data: {
          tenantId: input.tenantId,
          type: "RECEIVABLE",
          origin: "GESTAO_GRAFICA",
          contactLegacyId: quote.clientId,
          description: installments.length === 1 ? `Pedido grafica ${order.number}` : `Pedido grafica ${order.number} - parcela ${installment.number}/${installments.length}`,
          category: "Receita grafica",
          dueDate: installment.dueDate,
          originalAmountCents: installment.amountCents,
          status: "OPEN",
          notes: `${installment.label}. Condicao: ${quote.paymentTerms || "A combinar"}.`
        }
      });
      await tx.graphicReceivable.create({
        data: {
          tenantId: input.tenantId,
          orderId: order.id,
          financialTitleId: title.id,
          dueDate: installment.dueDate,
          amountCents: installment.amountCents,
          notes: installment.label,
          createdById: input.userId || null,
          updatedById: input.userId || null
        }
      });
    }

    const expectedAt = new Date(approvedAt);
    expectedAt.setDate(expectedAt.getDate() + Math.max(...quote.items.map((item: any) => Number(item.deadlineDays || 7)), 7));
    await tx.graphicDelivery.create({
      data: { tenantId: input.tenantId, orderId: order.id, method: "RETIRADA", expectedAt, status: "PENDING", createdById: input.userId || null, updatedById: input.userId || null }
    });
    if (quote.opportunityId) {
      await tx.graphicOpportunity.update({
        where: { id: quote.opportunityId },
        data: { status: "WON", nextAction: "Aguardando arte do cliente", nextFollowUp: null, qualityAlert: null, updatedById: input.userId || null }
      });
      await tx.graphicActivity.create({
        data: { tenantId: input.tenantId, opportunityId: quote.opportunityId, userId: input.userId || null, type: "QUOTE_APPROVED", channel: input.approvedPublicly ? "Portal do cliente" : "CRM", result: `Orcamento #${quote.number} aprovado e pedido #${order.number} criado`, createdById: input.userId || null, updatedById: input.userId || null }
      });
    }
    await tx.graphicQuoteVersion.create({
      data: {
        tenantId: input.tenantId,
        quoteId: quote.id,
        version: nextQuoteVersion(quote.versions),
        snapshot: JSON.stringify({ action: "approve", approvedAt, approvedPublicly: Boolean(input.approvedPublicly), quote, orderId: order.id }),
        createdById: input.userId || null,
        updatedById: input.userId || null
      }
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId || null,
        action: input.auditAction || "graphic_approve_quote",
        entity: "GraphicQuote",
        entityId: quote.id,
        metadata: JSON.stringify({ orderId: order.id, productionOrderId: production.id, approvedPublicly: Boolean(input.approvedPublicly) })
      }
    });
      return { quote: approvedQuote, order, production, alreadyApproved: false };
    });
  } catch (error: any) {
    // A database unique constraint is the final guard when two approval requests arrive together.
    if (error?.code === "P2002") {
      const order = await db.graphicOrder.findFirst({
        where: { tenantId: input.tenantId, quoteId: input.quoteId },
        include: { productionOrders: true }
      });
      if (order) {
        const quote = await db.graphicQuote.findFirst({ where: { id: input.quoteId, tenantId: input.tenantId } });
        return { quote, order, production: order.productionOrders[0] || null, alreadyApproved: true };
      }
    }
    throw error;
  }
}
