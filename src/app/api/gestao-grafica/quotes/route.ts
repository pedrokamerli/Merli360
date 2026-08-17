import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicPermission, calculateGraphicPricing, cents, dateOrNull, ensureGraphicDefaults, getGraphicSettings, graphicProductionSteps } from "@/lib/graphic";
import { buildGraphicInstallments } from "@/lib/graphic-receivables";
import { nextQuoteVersion, validateCommercialApproval, validateQuoteStatusAction } from "@/lib/graphic-quotes";

export const dynamic = "force-dynamic";

async function nextNumber(db: any, tenantId: string, model: "graphicQuote" | "graphicOrder") {
  const last = await db[model].findFirst({ where: { tenantId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number || 0) + 1;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicPermission(user, "quote:create");
    await ensureGraphicDefaults(user.tenantId);
    const body = await request.json();
    const db = prisma as any;
    const opportunity = body.opportunityId ? await db.graphicOpportunity.findFirst({ where: { id: String(body.opportunityId), tenantId: user.tenantId } }) : null;
    const clientId = String(body.clientId || opportunity?.clientId || "");
    const requestedItems = Array.isArray(body.items) && body.items.length ? body.items : [body];
    const validUntil = dateOrNull(body.validUntil);
    if (!body.preview && !clientId) return NextResponse.json({ error: "Orcamento precisa de cliente." }, { status: 400 });
    if (!body.preview && !validUntil) return NextResponse.json({ error: "Informe a validade do orcamento." }, { status: 400 });
    if (!requestedItems.length || requestedItems.some((item: any) => !String(item.description || "").trim())) return NextResponse.json({ error: "Inclua pelo menos um item no orcamento." }, { status: 400 });
    const settings = await getGraphicSettings(user.tenantId);
    const preparedItems = await Promise.all(requestedItems.map(async (input: any) => {
      const product = input.productId ? await db.graphicProduct.findFirst({ where: { id: String(input.productId), tenantId: user.tenantId }, include: { components: { include: { material: true } }, processes: { include: { process: true } }, versions: { orderBy: { createdAt: "desc" }, take: 1 } } }) : null;
      const snapshot = product?.versions?.[0]?.snapshot ? JSON.parse(product.versions[0].snapshot) : null;
      const materialCostCents = product?.components?.reduce((sum: number, component: any) => sum + Math.round((component.material?.currentCostCents || 0) * Number(component.quantity || 1)), 0) || 0;
      const processCostCents = product?.processes?.reduce((sum: number, process: any) => sum + Math.round((process.process?.costCents || 0) * Number(process.quantity || 1)), 0) || 0;
      const pricing = calculateGraphicPricing({ quantity: Number(input.quantity || 1), width: input.width ? Number(input.width) : null, height: input.height ? Number(input.height) : null, materialCostCents: input.materialCost ? cents(input.materialCost) : materialCostCents, processCostCents: input.processCost ? cents(input.processCost) : processCostCents, outsourcedCostCents: cents(input.outsourcedCost), laborCostCents: cents(input.laborCost), freightCents: cents(input.freight), installationCents: cents(input.installation), extraCostCents: input.extraCost ? cents(input.extraCost) : Number(snapshot?.extraCostCents || 0), discountCents: cents(input.discount), urgencyCents: cents(input.urgency), negotiatedPriceCents: input.negotiatedPrice ? cents(input.negotiatedPrice) : undefined, wastePercent: input.wastePercent ? Number(input.wastePercent || 0) : Number(product?.components?.[0]?.wastePercent ?? snapshot?.wastePercent ?? 0), spreadsheetPricing: Boolean(snapshot?.calculationType), safetyPercent: Number(snapshot?.safetyPercent || 0), finishingCostCents: Number(snapshot?.finishingCostCents || 0), laborHours: Number(snapshot?.laborHours || 0), urgent: String(input.priority || "").toUpperCase() === "URGENTE", ...settings });
      return { input, product, materialCostCents, processCostCents, pricing };
    }));
    const totals = preparedItems.reduce((sum: any, item: any) => ({ subtotalCents: sum.subtotalCents + item.pricing.suggestedPriceCents, discountCents: sum.discountCents + cents(item.input.discount), urgencyCents: sum.urgencyCents + cents(item.input.urgency), freightCents: sum.freightCents + cents(item.input.freight), installationCents: sum.installationCents + cents(item.input.installation), totalCostCents: sum.totalCostCents + item.pricing.totalCostCents, totalPriceCents: sum.totalPriceCents + item.pricing.negotiatedPriceCents, minimumPriceCents: sum.minimumPriceCents + item.pricing.minimumPriceCents }), { subtotalCents: 0, discountCents: 0, urgencyCents: 0, freightCents: 0, installationCents: 0, totalCostCents: 0, totalPriceCents: 0, minimumPriceCents: 0 });
    const approvalReasons = preparedItems.filter((item: any) => item.pricing.approvalRequired).map((item: any) => item.pricing.approvalReason).filter(Boolean);
    if (body.preview) return NextResponse.json({ items: preparedItems.map((item: any) => ({ description: item.input.description, quantity: item.pricing.quantity, area: item.pricing.area, suggestedPriceCents: item.pricing.suggestedPriceCents, negotiatedPriceCents: item.pricing.negotiatedPriceCents, quantityMultiplier: item.pricing.quantityMultiplier || 1 })), totals });

    const quote = await db.$transaction(async (tx: any) => {
      const number = await nextNumber(tx, user.tenantId, "graphicQuote");
      const created = await tx.graphicQuote.create({
        data: {
          tenantId: user.tenantId,
          opportunityId: opportunity?.id || null,
          clientId,
          responsibleId: user.id,
          number,
          shareToken: crypto.randomBytes(24).toString("base64url"),
          validUntil,
          paymentTerms: String(body.paymentTerms || "") || null,
          notes: String(body.notes || "") || null,
          ...totals,
          marginPercent: totals.totalPriceCents ? Math.round(((totals.totalPriceCents - totals.totalCostCents) / totals.totalPriceCents) * 10000) / 100 : 0,
          markupPercent: totals.totalCostCents ? Math.round(((totals.totalPriceCents - totals.totalCostCents) / totals.totalCostCents) * 10000) / 100 : 0,
          approvalRequired: approvalReasons.length > 0,
          approvalReason: approvalReasons.join(" ") || null,
          createdById: user.id,
          updatedById: user.id
        }
      });
      const items = [];
      for (const prepared of preparedItems) {
        const { input, product, materialCostCents, processCostCents, pricing } = prepared;
        const item = await tx.graphicQuoteItem.create({ data: { tenantId: user.tenantId, quoteId: created.id, productId: input.productId || null, description: String(input.description).trim(), quantity: Number(input.quantity || 1), width: input.width ? Number(input.width) : null, height: input.height ? Number(input.height) : null, area: input.width && input.height ? Number(input.width) * Number(input.height) : null, unit: String(input.unit || "unidade"), deadlineDays: input.deadlineDays ? Number(input.deadlineDays) : null, costCents: pricing.totalCostCents, priceCents: pricing.negotiatedPriceCents, marginPercent: pricing.marginPercent, costSnapshot: JSON.stringify({ input, pricing, settings }), createdById: user.id, updatedById: user.id } });
        items.push(item);
        await tx.graphicQuoteItemCost.createMany({ data: [{ tenantId: user.tenantId, quoteItemId: item.id, type: "MATERIAL", description: product?.components?.[0]?.material?.name || "Materiais e perdas previstas", materialId: product?.components?.[0]?.materialId || null, unitCostCents: input.materialCost ? cents(input.materialCost) : materialCostCents, totalCostCents: pricing.materialBase + pricing.wasteCents, status: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id }, { tenantId: user.tenantId, quoteItemId: item.id, type: "PROCESS", description: product?.processes?.[0]?.process?.name || "Processos internos e terceirizados", processId: product?.processes?.[0]?.processId || null, unitCostCents: input.processCost ? cents(input.processCost) : processCostCents, totalCostCents: (input.processCost ? cents(input.processCost) : processCostCents) + cents(input.outsourcedCost), status: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id }, { tenantId: user.tenantId, quoteItemId: item.id, type: "OVERHEAD", description: "Mao de obra, fixos, impostos, taxas e comissao", totalCostCents: pricing.totalCostCents - pricing.materialBase - pricing.wasteCents - (input.processCost ? cents(input.processCost) : processCostCents) - cents(input.outsourcedCost), status: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id }] });
      }
      await tx.graphicQuoteVersion.create({ data: { tenantId: user.tenantId, quoteId: created.id, version: 1, snapshot: JSON.stringify({ quote: created, items, totals }), createdById: user.id, updatedById: user.id } });
      if (approvalReasons.length) {
        await tx.graphicApprovalRequest.create({ data: { tenantId: user.tenantId, quoteId: created.id, reason: approvalReasons.join(" ") || "Revisao comercial necessaria.", requestedById: user.id, createdById: user.id, updatedById: user.id } });
      }
      if (opportunity) {
        await tx.graphicOpportunity.update({ where: { id: opportunity.id }, data: { status: "QUOTE_CREATED", updatedById: user.id } });
      }
      return tx.graphicQuote.findUnique({ where: { id: created.id }, include: { items: true, approvals: true } });
    });

    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_create_quote", entity: "GraphicQuote", entityId: quote.id, request, metadata: { approvalRequired: quote.approvalRequired } });
    return NextResponse.json({ item: quote });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite criar orcamentos." : "Nao foi possivel criar o orcamento.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await request.json();
    const action = String(body.action || "approve");
    await assertGraphicPermission(user, ["approve", "approve-commercial"].includes(action) ? "quote:approve" : "quote:create");
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Orcamento obrigatorio." }, { status: 400 });
    const db = prisma as any;

    if (["send", "refuse", "cancel"].includes(action)) {
      const statusMap: Record<string, string> = { send: "SENT", refuse: "REFUSED", cancel: "CANCELLED" };
      const nextStatus = statusMap[action];
      const reason = String(body.reason || body.note || "");
      const nextFollowUp = action === "send" ? dateOrNull(body.nextFollowUp) : null;
      const nextAction = String(body.nextAction || "").trim() || "Retornar orcamento enviado";
      if (action === "send" && !nextFollowUp) return NextResponse.json({ error: "Informe a data do retorno comercial." }, { status: 400 });
      const result = await db.$transaction(async (tx: any) => {
        const quote = await tx.graphicQuote.findFirst({ where: { id, tenantId: user.tenantId }, include: { versions: true, items: true } });
        if (!quote) throw new Error("QUOTE_NOT_FOUND");
        const validation = validateQuoteStatusAction(quote.status, nextStatus, reason);
        if (validation) throw new Error(validation);
        const updated = await tx.graphicQuote.update({
          where: { id },
          data: {
            status: nextStatus,
            notes: reason ? [quote.notes, `${nextStatus}: ${reason}`].filter(Boolean).join("\n") : quote.notes,
            updatedById: user.id
          }
        });
        await tx.graphicQuoteVersion.create({
          data: { tenantId: user.tenantId, quoteId: id, version: nextQuoteVersion(quote.versions), snapshot: JSON.stringify({ action, status: nextStatus, reason, quote, items: quote.items }), createdById: user.id, updatedById: user.id }
        });
        if (action === "send" && nextFollowUp) {
          await tx.graphicTask.create({
            data: { tenantId: user.tenantId, opportunityId: quote.opportunityId, assignedToId: quote.responsibleId || user.id, title: `${nextAction}: orcamento #${quote.number}`, dueDate: nextFollowUp, createdById: user.id, updatedById: user.id }
          });
          if (quote.opportunityId) {
            await tx.graphicOpportunity.update({ where: { id: quote.opportunityId }, data: { nextAction, nextFollowUp, qualityAlert: null, updatedById: user.id } });
          }
        }
        return updated;
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: `graphic_${action}_quote`, entity: "GraphicQuote", entityId: id, request, metadata: { status: nextStatus } });
      return NextResponse.json({ item: result });
    }

    if (action === "duplicate") {
      const result = await db.$transaction(async (tx: any) => {
        const quote = await tx.graphicQuote.findFirst({ where: { id, tenantId: user.tenantId }, include: { items: { include: { costs: true } } } });
        if (!quote) throw new Error("QUOTE_NOT_FOUND");
        const number = await nextNumber(tx, user.tenantId, "graphicQuote");
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 7);
        const created = await tx.graphicQuote.create({
          data: {
            tenantId: user.tenantId,
            opportunityId: quote.opportunityId,
            clientId: quote.clientId,
            responsibleId: user.id,
            number,
            shareToken: crypto.randomBytes(24).toString("base64url"),
            validUntil,
            paymentTerms: quote.paymentTerms,
            notes: `Duplicado do orcamento #${quote.number}.`,
            subtotalCents: quote.subtotalCents,
            discountCents: quote.discountCents,
            urgencyCents: quote.urgencyCents,
            freightCents: quote.freightCents,
            installationCents: quote.installationCents,
            totalCostCents: quote.totalCostCents,
            totalPriceCents: quote.totalPriceCents,
            minimumPriceCents: quote.minimumPriceCents,
            marginPercent: quote.marginPercent,
            markupPercent: quote.markupPercent,
            approvalRequired: quote.approvalRequired,
            approvalReason: quote.approvalReason,
            createdById: user.id,
            updatedById: user.id
          }
        });
        for (const item of quote.items) {
          const newItem = await tx.graphicQuoteItem.create({
            data: {
              tenantId: user.tenantId,
              quoteId: created.id,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              width: item.width,
              height: item.height,
              area: item.area,
              unit: item.unit,
              deadlineDays: item.deadlineDays,
              costCents: item.costCents,
              priceCents: item.priceCents,
              marginPercent: item.marginPercent,
              costSnapshot: item.costSnapshot,
              createdById: user.id,
              updatedById: user.id
            }
          });
          if (item.costs?.length) {
            await tx.graphicQuoteItemCost.createMany({
              data: item.costs.map((cost: any) => ({ tenantId: user.tenantId, quoteItemId: newItem.id, type: cost.type, description: cost.description, materialId: cost.materialId, processId: cost.processId, quantity: cost.quantity, unitCostCents: cost.unitCostCents, totalCostCents: cost.totalCostCents, status: cost.status, createdById: user.id, updatedById: user.id }))
            });
          }
        }
        await tx.graphicQuoteVersion.create({ data: { tenantId: user.tenantId, quoteId: created.id, version: 1, snapshot: JSON.stringify({ duplicatedFrom: quote.id, quote, items: quote.items }), createdById: user.id, updatedById: user.id } });
        return tx.graphicQuote.findUnique({ where: { id: created.id }, include: { items: true, versions: true } });
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_duplicate_quote", entity: "GraphicQuote", entityId: id, request, metadata: { newQuoteId: result?.id } });
      return NextResponse.json({ item: result });
    }

    if (action === "approve-commercial") {
      const note = String(body.note || body.reason || "").trim();
      const result = await db.$transaction(async (tx: any) => {
        const quote = await tx.graphicQuote.findFirst({ where: { id, tenantId: user.tenantId }, include: { approvals: { where: { status: "PENDING" } }, versions: true, items: true } });
        if (!quote) throw new Error("QUOTE_NOT_FOUND");
        const validation = validateCommercialApproval({ status: quote.status, approvalRequired: quote.approvalRequired, pendingApprovals: quote.approvals.length });
        if (validation) throw new Error(validation);
        await tx.graphicApprovalRequest.updateMany({
          where: { tenantId: user.tenantId, quoteId: id, status: "PENDING" },
          data: { status: "APPROVED", decision: note || "Aprovado comercialmente.", decidedById: user.id, decidedAt: new Date(), updatedById: user.id }
        });
        const updated = await tx.graphicQuote.update({
          where: { id },
          data: { approvalRequired: false, approvalReason: null, updatedById: user.id }
        });
        await tx.graphicQuoteVersion.create({
          data: { tenantId: user.tenantId, quoteId: id, version: nextQuoteVersion(quote.versions), snapshot: JSON.stringify({ action, note, quote, items: quote.items, approvals: quote.approvals }), createdById: user.id, updatedById: user.id }
        });
        return updated;
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_approve_commercial_exception", entity: "GraphicQuote", entityId: id, request, metadata: { note } });
      return NextResponse.json({ item: result });
    }

    const result = await db.$transaction(async (tx: any) => {
      const quote = await tx.graphicQuote.findFirst({ where: { id, tenantId: user.tenantId }, include: { items: true, approvals: { where: { status: "PENDING" } } } });
      if (!quote) throw new Error("QUOTE_NOT_FOUND");
      if (quote.status === "APPROVED") {
        const existingOrder = await tx.graphicOrder.findFirst({ where: { tenantId: user.tenantId, quoteId: quote.id } });
        const existingProduction = existingOrder ? await tx.graphicProductionOrder.findFirst({ where: { tenantId: user.tenantId, orderId: existingOrder.id } }) : null;
        if (existingOrder && existingProduction) return { quote, order: existingOrder, production: existingProduction, alreadyApproved: true };
        throw new Error("QUOTE_ALREADY_APPROVED");
      }
      if (new Date(quote.validUntil) < new Date()) throw new Error("QUOTE_EXPIRED");
      if (quote.approvalRequired || quote.approvals.length) throw new Error("QUOTE_COMMERCIAL_APPROVAL_PENDING");
      const orderNumber = await nextNumber(tx, user.tenantId, "graphicOrder");
      const approvedQuote = await tx.graphicQuote.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id, updatedById: user.id } });
      const order = await tx.graphicOrder.create({
        data: {
          tenantId: user.tenantId,
          quoteId: quote.id,
          clientId: quote.clientId,
          number: orderNumber,
          soldValueCents: quote.totalPriceCents,
          billedValueCents: quote.totalPriceCents,
          commercialSnapshot: JSON.stringify({ quote, approvedAt: new Date().toISOString() }),
          productionSnapshot: JSON.stringify({ items: quote.items }),
          createdById: user.id,
          updatedById: user.id
        }
      });
      await tx.graphicOrderItem.createMany({
        data: quote.items.map((item: any) => ({
          tenantId: user.tenantId,
          orderId: order.id,
          description: item.description,
          quantity: item.quantity,
          priceCents: item.priceCents,
          costCents: item.costCents,
          snapshot: JSON.stringify(item),
          createdById: user.id,
          updatedById: user.id
        }))
      });
      const production = await tx.graphicProductionOrder.create({
        data: {
          tenantId: user.tenantId,
          orderId: order.id,
          status: "PENDING",
          checklist: JSON.stringify({ arte: false, medidas: false, material: false, prazo: false, arquivos: false }),
          technicalSnapshot: JSON.stringify({ quote, items: quote.items }),
          createdById: user.id,
          updatedById: user.id
        }
      });
      await tx.graphicProductionStep.createMany({
        data: graphicProductionSteps.map((name, position) => ({ tenantId: user.tenantId, productionOrderId: production.id, name, position, createdById: user.id, updatedById: user.id }))
      });
      const approvalDate = new Date();
      const installments = buildGraphicInstallments(quote.totalPriceCents, quote.paymentTerms, approvalDate);
      const expectedDelivery = new Date();
      expectedDelivery.setDate(expectedDelivery.getDate() + 7);
      for (const installment of installments) {
        const title = await tx.financialTitle.create({
          data: {
            tenantId: user.tenantId,
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
        await tx.graphicReceivable.create({ data: { tenantId: user.tenantId, orderId: order.id, financialTitleId: title.id, dueDate: installment.dueDate, amountCents: installment.amountCents, notes: installment.label, createdById: user.id, updatedById: user.id } });
      }
      await tx.graphicDelivery.create({ data: { tenantId: user.tenantId, orderId: order.id, method: "RETIRADA", expectedAt: expectedDelivery, status: "PENDING", createdById: user.id, updatedById: user.id } });
      return { quote: approvedQuote, order, production };
    });

    await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_approve_quote", entity: "GraphicQuote", entityId: id, request, metadata: { orderId: result.order.id, productionOrderId: result.production.id } });
    return NextResponse.json(result);
  } catch (error: any) {
    const messages: Record<string, string> = {
      QUOTE_NOT_FOUND: "Orcamento nao encontrado.",
      QUOTE_ALREADY_APPROVED: "Orcamento ja aprovado.",
      QUOTE_EXPIRED: "Orcamento vencido. Gere uma nova versao antes de aprovar.",
      QUOTE_COMMERCIAL_APPROVAL_PENDING: "Aprove a excecao comercial antes de gerar pedido."
    };
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 400;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite alterar este orcamento." : messages[error?.message] || String(error?.message || "Nao foi possivel alterar o orcamento."), detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
