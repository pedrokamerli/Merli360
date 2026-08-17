import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { catalogCheckoutLine, normalizeGraphicCatalogCheckout } from "@/lib/graphic-catalog-checkout";
import { GRAPHIC_CATALOG_TOKEN_KEY } from "@/lib/graphic-catalog";
import { getGraphicSettings } from "@/lib/graphic";
import { graphicCatalogPaymentTerms } from "@/lib/graphic-payment-methods";
import { normalizePhone } from "@/lib/crm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const normalized = normalizeGraphicCatalogCheckout(await request.json());
    if (normalized.error) return NextResponse.json({ error: normalized.error }, { status: 400 });
    const db = prisma as any;
    const setting = await db.graphicSetting.findFirst({ where: { key: GRAPHIC_CATALOG_TOKEN_KEY, value: token, status: "ACTIVE" } });
    if (!setting) return NextResponse.json({ error: "Este catalogo nao esta mais disponivel." }, { status: 404 });

    const variants = await db.graphicCatalogVariant.findMany({
      where: { tenantId: setting.tenantId, id: { in: normalized.items.map((item) => item.variantId) }, status: "ACTIVE", catalogItem: { status: "ACTIVE" } },
      include: { catalogItem: true, product: { select: { id: true } } }
    });
    if (variants.length !== normalized.items.length) return NextResponse.json({ error: "Um produto do carrinho foi alterado. Atualize o catalogo e tente novamente." }, { status: 409 });
    const settings = await getGraphicSettings(setting.tenantId);
    const prepared = normalized.items.map((requested) => {
      const variant = variants.find((item: any) => item.id === requested.variantId);
      const values = catalogCheckoutLine(variant, requested.quantity);
      return { requested, variant, ...values };
    });
    const totals = prepared.reduce((sum, item) => ({ priceCents: sum.priceCents + item.priceCents, costCents: sum.costCents + item.costCents }), { priceCents: 0, costCents: 0 });
    if (totals.priceCents <= 0) return NextResponse.json({ error: "Um produto esta sem preco de venda. Fale com a equipe Studium." }, { status: 409 });
    const marginPercent = totals.priceCents ? Math.round(((totals.priceCents - totals.costCents) / totals.priceCents) * 10000) / 100 : 0;
    const minimumPriceCents = Math.ceil(totals.costCents / Math.max(0.01, 1 - Number(settings.minMarginPercent || 0) / 100));
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + 7);
    const phone = normalized.customer.phone;
    const email = normalized.customer.email;

    const result = await db.$transaction(async (tx: any) => {
      const possibleClients = await tx.client.findMany({
        where: { tenantId: setting.tenantId, OR: [...(email ? [{ email }] : []), { phone }, { whatsapp: phone }] },
        take: 20
      });
      const existingClient = possibleClients.find((item: any) => normalizePhone(item.phone || item.whatsapp) === phone || (email && String(item.email || "").toLowerCase() === email));
      const clientData = {
        name: normalized.customer.name,
        email: email || null,
        phone,
        whatsapp: phone,
        address: normalized.customer.address,
        addressNumber: normalized.customer.number,
        district: normalized.customer.district,
        city: normalized.customer.city,
        state: normalized.customer.state,
        zipCode: normalized.customer.postalCode,
        segment: "Catalogo",
        type: "grafica",
        mainChannel: "Catalogo publico"
      };
      const client = existingClient
        ? await tx.client.update({ where: { id: existingClient.id }, data: { ...clientData, name: existingClient.name || clientData.name, segment: existingClient.segment || clientData.segment, type: existingClient.type || clientData.type } })
        : await tx.client.create({ data: { tenantId: setting.tenantId, ...clientData } });

      let lead = await tx.lead.findFirst({ where: { tenantId: setting.tenantId, archivedAt: null, OR: [...(email ? [{ email }] : []), { normalizedPhone: phone }] } });
      const productSummary = prepared.map((item) => `${item.variant.catalogItem.name} (${item.variant.label}) x ${item.kits}`).join(", ");
      const leadData = {
        name: normalized.customer.name,
        companyName: normalized.customer.name,
        contact: phone,
        normalizedPhone: phone,
        email: email || null,
        address: `${normalized.customer.address}, ${normalized.customer.number}${normalized.customer.complement ? ` - ${normalized.customer.complement}` : ""}`,
        city: normalized.customer.city,
        state: normalized.customer.state,
        segment: "Catalogo",
        type: "Grafica",
        origin: "Catalogo publico",
        publicSource: "Catalogo Studium",
        hasOpportunity: true,
        opportunityName: productSummary,
        opportunityStatus: "aberta",
        status: "Qualificado",
        proposedValue: totals.priceCents / 100,
        closeChance: 70,
        nextAction: "Revisar solicitacao e calcular frete",
        nextFollowUp: now,
        notes: `Solicitacao criada pelo carrinho do catalogo publico. Pagamento preferido: ${normalized.paymentMethod}.`
      };
      lead = lead ? await tx.lead.update({ where: { id: lead.id }, data: { ...leadData, name: lead.name || leadData.name, companyName: lead.companyName || leadData.companyName, notes: [lead.notes, leadData.notes].filter(Boolean).join("\n") } }) : await tx.lead.create({ data: { tenantId: setting.tenantId, ...leadData } });

      const opportunity = await tx.graphicOpportunity.create({ data: { tenantId: setting.tenantId, clientId: client.id, leadId: lead.id, title: `Solicitacao do catalogo - ${normalized.customer.name}`, source: "PUBLIC_CATALOG", productInterest: productSummary, estimatedValueCents: totals.priceCents, nextAction: "Revisar dados e calcular frete", nextFollowUp: now, status: "QUOTE_CREATED" } });
      const last = await tx.graphicQuote.findFirst({ where: { tenantId: setting.tenantId }, orderBy: { number: "desc" }, select: { number: true } });
      const quote = await tx.graphicQuote.create({ data: {
        tenantId: setting.tenantId,
        opportunityId: opportunity.id,
        clientId: client.id,
        number: Number(last?.number || 0) + 1,
        shareToken: crypto.randomBytes(24).toString("base64url"),
        status: "PENDING_REVIEW",
        source: "PUBLIC_CATALOG",
        validUntil,
        paymentTerms: graphicCatalogPaymentTerms(normalized.paymentMethod),
        notes: "Solicitacao recebida pelo carrinho do catalogo publico.",
        shippingPostalCode: normalized.customer.postalCode,
        shippingAddress: normalized.customer.address,
        shippingNumber: normalized.customer.number,
        shippingComplement: normalized.customer.complement || null,
        shippingDistrict: normalized.customer.district,
        shippingCity: normalized.customer.city,
        shippingState: normalized.customer.state,
        subtotalCents: totals.priceCents,
        totalCostCents: totals.costCents,
        totalPriceCents: totals.priceCents,
        minimumPriceCents,
        marginPercent,
        markupPercent: totals.costCents ? Math.round(((totals.priceCents - totals.costCents) / totals.costCents) * 10000) / 100 : 0,
        approvalRequired: true,
        approvalReason: "Solicitacao do catalogo aguardando revisao de dados, prazo e frete."
      } });
      const quoteItems = [];
      for (const item of prepared) {
        const description = `${item.variant.catalogItem.name} - ${item.variant.label}${item.kits > 1 ? ` (${item.kits} kits)` : ""}`;
        const quoteItem = await tx.graphicQuoteItem.create({ data: { tenantId: setting.tenantId, quoteId: quote.id, productId: item.variant.productId || null, catalogVariantId: item.variant.id, description, quantity: item.units, width: item.variant.widthMm, height: item.variant.heightMm, area: item.area, unit: "unidade", costCents: item.costCents, priceCents: item.priceCents, marginPercent: item.priceCents ? ((item.priceCents - item.costCents) / item.priceCents) * 100 : 0, costSnapshot: JSON.stringify({ source: "PUBLIC_CATALOG", kits: item.kits, variant: { id: item.variant.id, label: item.variant.label, quantity: item.variant.quantity, priceCents: item.variant.priceCents, costCents: item.variant.costCents } }) } });
        quoteItems.push(quoteItem);
        await tx.graphicQuoteItemCost.create({ data: { tenantId: setting.tenantId, quoteItemId: quoteItem.id, type: "CATALOG", description: `Custo estimado: ${item.variant.catalogItem.name}`, quantity: item.kits, unitCostCents: item.variant.costCents, totalCostCents: item.costCents, status: item.variant.validationStatus } });
      }
      await tx.graphicQuoteVersion.create({ data: { tenantId: setting.tenantId, quoteId: quote.id, version: 1, snapshot: JSON.stringify({ source: "PUBLIC_CATALOG", quote, items: quoteItems, customer: normalized.customer, paymentMethod: normalized.paymentMethod }) } });
      await tx.graphicApprovalRequest.create({ data: { tenantId: setting.tenantId, quoteId: quote.id, reason: quote.approvalReason } });
      await tx.graphicTask.create({ data: { tenantId: setting.tenantId, opportunityId: opportunity.id, title: `Revisar solicitacao do catalogo #${quote.number}`, dueDate: now } });
      await tx.graphicActivity.create({ data: { tenantId: setting.tenantId, opportunityId: opportunity.id, type: "CATALOG_REQUEST", channel: "CATALOGO_PUBLICO", result: `Carrinho recebido com ${prepared.length} item(ns). Pagamento preferido: ${normalized.paymentMethod}.` } });
      return { quote, client };
    });

    await audit({ tenantId: setting.tenantId, action: "graphic_public_catalog_checkout", entity: "GraphicQuote", entityId: result.quote.id, request, metadata: { quoteNumber: result.quote.number, itemCount: prepared.length, totalPriceCents: totals.priceCents, paymentMethod: normalized.paymentMethod } });
    return NextResponse.json({
      quoteNumber: result.quote.number,
      status: result.quote.status,
      publicPath: `/public/orcamento/${result.quote.shareToken}`,
      message: "Solicitacao recebida. A equipe Studium vai revisar o frete, o prazo e liberar o orcamento."
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: "Nao foi possivel enviar sua solicitacao agora.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status: 500 });
  }
}
