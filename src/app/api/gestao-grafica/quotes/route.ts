import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertGraphicCommercialPermission, assertGraphicPermission, calculateGraphicPricing, cents, dateOrNull, ensureGraphicDefaults, getGraphicSettings } from "@/lib/graphic";
import { approveGraphicQuote } from "@/lib/graphic-commercial";
import { nextQuoteVersion, validateCommercialApproval, validateQuoteCommercialRelease, validateQuoteStatusAction } from "@/lib/graphic-quotes";
import { calculateCatalogVariantPricing } from "@/lib/graphic-pricing";

export const dynamic = "force-dynamic";

async function nextNumber(db: any, tenantId: string, model: "graphicQuote" | "graphicOrder") {
  const last = await db[model].findFirst({ where: { tenantId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number || 0) + 1;
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function isQuoteValidationError(message: string) {
  return [
    "Orcamento precisa",
    "Informe",
    "Inclua",
    "Selecione",
    "Produto nao encontrado",
    "Opcao do catalogo",
    "O produto"
  ].some((prefix) => message.startsWith(prefix));
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await assertGraphicCommercialPermission(user, "quote:create");
    await ensureGraphicDefaults(user.tenantId);
    const body = await request.json();
    const db = prisma as any;
    const opportunity = body.opportunityId ? await db.graphicOpportunity.findFirst({ where: { id: String(body.opportunityId), tenantId: user.tenantId } }) : null;
    const clientId = String(body.clientId || opportunity?.clientId || "");
    const requestedItems = Array.isArray(body.items) && body.items.length ? body.items : [body];
    const validUntil = dateOrNull(body.validUntil);
    if (!body.preview && !clientId) return NextResponse.json({ error: "Orcamento precisa de cliente." }, { status: 400 });
    if (!body.preview && !validUntil) return NextResponse.json({ error: "Informe a validade do orcamento." }, { status: 400 });
    if (!requestedItems.length) return NextResponse.json({ error: "Inclua pelo menos um item no orcamento." }, { status: 400 });
    const settings = await getGraphicSettings(user.tenantId);
    const preparedItems = await Promise.all(requestedItems.map(async (input: any) => {
      const catalogVariant = input.catalogVariantId ? await db.graphicCatalogVariant.findFirst({
        where: { id: String(input.catalogVariantId), tenantId: user.tenantId, status: "ACTIVE", catalogItem: { status: "ACTIVE" } },
        include: { catalogItem: true, product: { include: { components: { include: { material: true } }, processes: { include: { process: true } }, versions: { orderBy: { createdAt: "desc" }, take: 1 } } } }
      }) : null;
      if (input.catalogVariantId && !catalogVariant) throw new Error("Opcao do catalogo nao encontrada ou esta oculta.");
      const product = catalogVariant?.product || (input.productId ? await db.graphicProduct.findFirst({ where: { id: String(input.productId), tenantId: user.tenantId }, include: { components: { include: { material: true } }, processes: { include: { process: true } }, versions: { orderBy: { createdAt: "desc" }, take: 1 } } }) : null);
      if (input.productId && !product) throw new Error("Produto nao encontrado neste ambiente.");
      if (!catalogVariant && !product && !hasValue(input.negotiatedPrice)) throw new Error("Selecione um produto cadastrado ou informe um preco manual.");
      if (!catalogVariant && product && !product.versions?.length) throw new Error(`O produto ${product.name} ainda nao possui ficha de calculo da planilha.`);
      const snapshot = product?.versions?.[0]?.snapshot ? JSON.parse(product.versions[0].snapshot) : null;
      const materialCostCents = product?.components?.reduce((sum: number, component: any) => sum + Math.round((component.material?.currentCostCents || 0) * Number(component.quantity || 1)), 0) || 0;
      const processCostCents = product?.processes?.reduce((sum: number, process: any) => sum + Math.round((process.process?.costCents || 0) * Number(process.quantity || 1)), 0) || 0;
      const description = String(input.description || (catalogVariant ? `${catalogVariant.catalogItem.name} - ${catalogVariant.label}` : product?.name || "")).trim();
      if (!description) throw new Error("Inclua a descricao do item no orcamento.");
      const width = catalogVariant?.widthMm ?? (hasValue(input.width) ? Number(input.width) : null);
      const height = catalogVariant?.heightMm ?? (hasValue(input.height) ? Number(input.height) : null);
      const quantity = catalogVariant?.quantity ?? Number(input.quantity || 1);
      if (!catalogVariant && snapshot?.calculationType === "M2" && (!(Number(width) > 0) || !(Number(height) > 0))) {
        throw new Error(`Informe comprimento e largura em milimetros para ${product?.name || description}.`);
      }
      const commonPriceInput = {
        negotiatedPriceCents: hasValue(input.negotiatedPrice) ? cents(input.negotiatedPrice) : undefined,
        discountCents: cents(input.discount),
        freightCents: cents(input.freight),
        installationCents: cents(input.installation),
        extraCostCents: hasValue(input.extraCost) ? cents(input.extraCost) : Number(snapshot?.extraCostCents || 0),
        minMarginPercent: Number(settings.minMarginPercent || 0),
        urgent: String(input.priority || "").toUpperCase() === "URGENTE",
        urgentMultiplier: Number(settings.urgentMultiplier || 1.15)
      };
      const pricing = catalogVariant
        ? calculateCatalogVariantPricing({ quantity, widthMm: width, heightMm: height, priceCents: catalogVariant.priceCents, costCents: catalogVariant.costCents, ...commonPriceInput })
        : calculateGraphicPricing({ quantity, width, height, materialCostCents: hasValue(input.materialCost) ? cents(input.materialCost) : materialCostCents, processCostCents: hasValue(input.processCost) ? cents(input.processCost) : processCostCents, outsourcedCostCents: cents(input.outsourcedCost), laborCostCents: cents(input.laborCost), freightCents: cents(input.freight), installationCents: cents(input.installation), extraCostCents: hasValue(input.extraCost) ? cents(input.extraCost) : Number(snapshot?.extraCostCents || 0), discountCents: cents(input.discount), urgencyCents: cents(input.urgency), negotiatedPriceCents: hasValue(input.negotiatedPrice) ? cents(input.negotiatedPrice) : undefined, wastePercent: hasValue(input.wastePercent) ? Number(input.wastePercent || 0) : Number(product?.components?.[0]?.wastePercent ?? snapshot?.wastePercent ?? 0), spreadsheetPricing: Boolean(snapshot?.calculationType), safetyPercent: Number(snapshot?.safetyPercent || 0), finishingCostCents: Number(snapshot?.finishingCostCents || 0), laborHours: Number(snapshot?.laborHours || 0), urgent: commonPriceInput.urgent, ...settings });
      const normalizedInput = { ...input, description, productId: product?.id || null, catalogVariantId: catalogVariant?.id || null, quantity, width, height, unit: input.unit || "unidade" };
      return { input: normalizedInput, product, catalogVariant, materialCostCents, processCostCents, pricing };
    }));
    const totals = preparedItems.reduce((sum: any, item: any) => ({ subtotalCents: sum.subtotalCents + item.pricing.suggestedPriceCents, discountCents: sum.discountCents + cents(item.input.discount), urgencyCents: sum.urgencyCents + cents(item.input.urgency), freightCents: sum.freightCents + cents(item.input.freight), installationCents: sum.installationCents + cents(item.input.installation), totalCostCents: sum.totalCostCents + item.pricing.totalCostCents, totalPriceCents: sum.totalPriceCents + item.pricing.negotiatedPriceCents, minimumPriceCents: sum.minimumPriceCents + item.pricing.minimumPriceCents }), { subtotalCents: 0, discountCents: 0, urgencyCents: 0, freightCents: 0, installationCents: 0, totalCostCents: 0, totalPriceCents: 0, minimumPriceCents: 0 });
    const approvalReasons = preparedItems.filter((item: any) => item.pricing.approvalRequired).map((item: any) => item.pricing.approvalReason).filter(Boolean);
    if (body.preview) return NextResponse.json({ items: preparedItems.map((item: any) => ({ description: item.input.description, quantity: item.pricing.quantity, unitArea: item.pricing.area, totalArea: item.pricing.area * item.pricing.quantity, area: item.pricing.area * item.pricing.quantity, dimensionUnit: "mm", pricingSource: item.catalogVariant ? "CATALOG" : item.product ? "SPREADSHEET" : "MANUAL", suggestedPriceCents: item.pricing.suggestedPriceCents, negotiatedPriceCents: item.pricing.negotiatedPriceCents, quantityMultiplier: item.pricing.quantityMultiplier || 1 })), totals });

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
        const { input, product, catalogVariant, materialCostCents, processCostCents, pricing } = prepared;
        const item = await tx.graphicQuoteItem.create({ data: { tenantId: user.tenantId, quoteId: created.id, productId: product?.id || null, catalogVariantId: catalogVariant?.id || null, description: String(input.description).trim(), quantity: pricing.quantity, width: input.width ? Number(input.width) : null, height: input.height ? Number(input.height) : null, area: pricing.area ? pricing.area * pricing.quantity : null, unit: String(input.unit || "unidade"), deadlineDays: input.deadlineDays ? Number(input.deadlineDays) : null, costCents: pricing.totalCostCents, priceCents: pricing.negotiatedPriceCents, marginPercent: pricing.marginPercent, costSnapshot: JSON.stringify({ source: catalogVariant ? "CATALOG" : product ? "SPREADSHEET" : "MANUAL", input, pricing, settings, catalogVariant: catalogVariant ? { id: catalogVariant.id, label: catalogVariant.label, sourcePriceCents: catalogVariant.sourcePriceCents, validationStatus: catalogVariant.validationStatus } : null }), createdById: user.id, updatedById: user.id } });
        items.push(item);
        if (catalogVariant) {
          await tx.graphicQuoteItemCost.create({ data: { tenantId: user.tenantId, quoteItemId: item.id, type: "CATALOG", description: `Custo estimado do kit: ${catalogVariant.catalogItem.name}`, unitCostCents: catalogVariant.costCents, totalCostCents: pricing.totalCostCents, status: catalogVariant.validationStatus, createdById: user.id, updatedById: user.id } });
        } else {
          await tx.graphicQuoteItemCost.createMany({ data: [{ tenantId: user.tenantId, quoteItemId: item.id, type: "MATERIAL", description: product?.components?.[0]?.material?.name || "Materiais e perdas previstas", materialId: product?.components?.[0]?.materialId || null, unitCostCents: hasValue(input.materialCost) ? cents(input.materialCost) : materialCostCents, totalCostCents: pricing.materialBase + pricing.wasteCents, status: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id }, { tenantId: user.tenantId, quoteItemId: item.id, type: "PROCESS", description: product?.processes?.[0]?.process?.name || "Processos internos e terceirizados", processId: product?.processes?.[0]?.processId || null, unitCostCents: hasValue(input.processCost) ? cents(input.processCost) : processCostCents, totalCostCents: (hasValue(input.processCost) ? cents(input.processCost) : processCostCents) + cents(input.outsourcedCost), status: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id }, { tenantId: user.tenantId, quoteItemId: item.id, type: "OVERHEAD", description: "Mao de obra, fixos, impostos, taxas e comissao", totalCostCents: Math.max(0, pricing.totalCostCents - pricing.materialBase - pricing.wasteCents - (hasValue(input.processCost) ? cents(input.processCost) : processCostCents) - cents(input.outsourcedCost)), status: "PENDING_VALIDATION", createdById: user.id, updatedById: user.id }] });
        }
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
    const message = String(error?.message || error);
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN_GRAPHIC_PERMISSION" || message === "FORBIDDEN_MODULE" ? 403 : isQuoteValidationError(message) ? 400 : 500;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite criar orcamentos." : status === 400 ? message : "Nao foi possivel criar o orcamento.", detail: process.env.NODE_ENV === "production" ? undefined : message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await request.json();
    const action = String(body.action || "approve");
    if (action === "approve-catalog-request") await assertGraphicPermission(user, "catalog-request:review");
    else if (action === "approve-commercial") await assertGraphicPermission(user, "quote:approve");
    else await assertGraphicCommercialPermission(user, "quote:create");
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Orcamento obrigatorio." }, { status: 400 });
    const db = prisma as any;

    if (action === "approve-catalog-request") {
      const freightCents = Math.max(0, Math.min(10_000_000, Math.round(Number(body.freightCents || 0))));
      const result = await db.$transaction(async (tx: any) => {
        const quote = await tx.graphicQuote.findFirst({ where: { id, tenantId: user.tenantId }, include: { approvals: { where: { status: "PENDING" } }, versions: true, items: true } });
        if (!quote) throw new Error("QUOTE_NOT_FOUND");
        if (quote.source !== "PUBLIC_CATALOG" || quote.status !== "PENDING_REVIEW") throw new Error("CATALOG_REQUEST_NOT_PENDING");
        const productCostCents = Math.max(0, quote.totalCostCents - quote.freightCents);
        const productPriceCents = Math.max(0, quote.totalPriceCents - quote.freightCents);
        const totalCostCents = productCostCents + freightCents;
        const totalPriceCents = productPriceCents + freightCents;
        const marginPercent = totalPriceCents ? Math.round(((totalPriceCents - totalCostCents) / totalPriceCents) * 10000) / 100 : 0;
        const updated = await tx.graphicQuote.update({
          where: { id },
          data: {
            status: "SENT",
            responsibleId: user.id,
            freightCents,
            totalCostCents,
            totalPriceCents,
            minimumPriceCents: Math.max(0, quote.minimumPriceCents - quote.freightCents) + freightCents,
            marginPercent,
            markupPercent: totalCostCents ? Math.round(((totalPriceCents - totalCostCents) / totalCostCents) * 10000) / 100 : 0,
            approvalRequired: false,
            approvalReason: null,
            updatedById: user.id
          }
        });
        await tx.graphicApprovalRequest.updateMany({
          where: { tenantId: user.tenantId, quoteId: id, status: "PENDING" },
          data: { status: "APPROVED", decision: `Solicitacao revisada. Frete: ${freightCents}.`, decidedById: user.id, decidedAt: new Date(), updatedById: user.id }
        });
        await tx.graphicQuoteVersion.create({
          data: { tenantId: user.tenantId, quoteId: id, version: nextQuoteVersion(quote.versions), snapshot: JSON.stringify({ action, freightCents, before: quote, items: quote.items, after: updated }), createdById: user.id, updatedById: user.id }
        });
        if (quote.opportunityId) {
          const nextFollowUp = new Date();
          nextFollowUp.setDate(nextFollowUp.getDate() + 1);
          await tx.graphicOpportunity.update({ where: { id: quote.opportunityId }, data: { ownerId: user.id, nextAction: "Confirmar aprovacao do orcamento com o cliente", nextFollowUp, qualityAlert: null, updatedById: user.id } });
          await tx.graphicTask.create({ data: { tenantId: user.tenantId, opportunityId: quote.opportunityId, assignedToId: user.id, title: `Confirmar orcamento #${quote.number} com o cliente`, dueDate: nextFollowUp, createdById: user.id, updatedById: user.id } });
          await tx.graphicActivity.create({ data: { tenantId: user.tenantId, opportunityId: quote.opportunityId, userId: user.id, type: "CATALOG_REQUEST_APPROVED", channel: "CATALOGO_PUBLICO", result: `Orcamento #${quote.number} revisado e liberado para o cliente.`, createdById: user.id, updatedById: user.id } });
        }
        return updated;
      });
      await audit({ tenantId: user.tenantId, userId: user.id, action: "graphic_approve_catalog_request", entity: "GraphicQuote", entityId: id, request, metadata: { freightCents } });
      return NextResponse.json({ item: result, publicPath: `/public/orcamento/${result.shareToken}` });
    }

    if (["send", "refuse", "cancel"].includes(action)) {
      const statusMap: Record<string, string> = { send: "SENT", refuse: "REFUSED", cancel: "CANCELLED" };
      const nextStatus = statusMap[action];
      const reason = String(body.reason || body.note || "");
      const nextFollowUp = action === "send" ? dateOrNull(body.nextFollowUp) : null;
      const nextAction = String(body.nextAction || "").trim() || "Retornar orcamento enviado";
      if (action === "send" && !nextFollowUp) return NextResponse.json({ error: "Informe a data do retorno comercial." }, { status: 400 });
      const result = await db.$transaction(async (tx: any) => {
        const quote = await tx.graphicQuote.findFirst({ where: { id, tenantId: user.tenantId }, include: { approvals: { where: { status: "PENDING" } }, versions: true, items: true } });
        if (!quote) throw new Error("QUOTE_NOT_FOUND");
        if (action === "send") {
          const commercialReleaseError = validateQuoteCommercialRelease({ approvalRequired: quote.approvalRequired, pendingApprovals: quote.approvals.length });
          if (commercialReleaseError) throw new Error(commercialReleaseError);
        }
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
            await tx.graphicActivity.create({
              data: { tenantId: user.tenantId, opportunityId: quote.opportunityId, userId: user.id, type: "QUOTE_SENT", channel: "CRM", result: `Orcamento #${quote.number} enviado`, createdById: user.id, updatedById: user.id }
            });
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
              catalogVariantId: item.catalogVariantId,
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

    const result = await approveGraphicQuote({ tenantId: user.tenantId, quoteId: id, userId: user.id, auditAction: "graphic_approve_quote" });

    return NextResponse.json(result);
  } catch (error: any) {
    const messages: Record<string, string> = {
      QUOTE_NOT_FOUND: "Orcamento nao encontrado.",
      QUOTE_ALREADY_APPROVED: "Orcamento ja aprovado.",
      QUOTE_APPROVAL_INCOMPLETE: "Orcamento aprovado sem pedido vinculado. Revise a operacao antes de continuar.",
      QUOTE_NOT_SENT: "Envie o orcamento ao cliente antes de aprovar.",
      QUOTE_WITHOUT_ITEMS: "Inclua pelo menos um item antes de aprovar.",
      QUOTE_EXPIRED: "Orcamento vencido. Gere uma nova versao antes de aprovar.",
      QUOTE_COMMERCIAL_APPROVAL_PENDING: "Aprove a excecao comercial antes de enviar ao cliente ou gerar o pedido.",
      CATALOG_REQUEST_NOT_PENDING: "Esta solicitacao do catalogo ja foi revisada.",
    };
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message === "FORBIDDEN_GRAPHIC_PERMISSION" || error?.message === "FORBIDDEN_MODULE" ? 403 : 400;
    return NextResponse.json({ error: status === 403 ? "Seu perfil nao permite alterar este orcamento." : messages[error?.message] || String(error?.message || "Nao foi possivel alterar o orcamento."), detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status });
  }
}
