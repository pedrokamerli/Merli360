import crypto from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { graphicProductionSteps } from "@/lib/graphic";
import { safeGraphicAttachmentExt, validateGraphicAttachment } from "@/lib/graphic-attachments";

export const dynamic = "force-dynamic";

async function nextOrderNumber(db: any, tenantId: string) {
  const last = await db.graphicOrder.findFirst({ where: { tenantId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number || 0) + 1;
}

async function findQuote(token: string) {
  return (prisma as any).graphicQuote.findFirst({
    where: { shareToken: token, status: { in: ["SENT", "VIEWED", "APPROVED"] } },
    include: { items: true, tenant: true, orders: { include: { productionOrders: { include: { steps: { orderBy: { position: "asc" } } } }, deliveries: true } } }
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await findQuote(token);
  if (!quote) return NextResponse.json({ error: "Orcamento nao encontrado." }, { status: 404 });
  if (quote.status === "SENT" && !quote.viewedAt) await (prisma as any).graphicQuote.update({ where: { id: quote.id }, data: { status: "VIEWED", viewedAt: new Date() } });
  return NextResponse.json({ item: quote });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const action = String(request.nextUrl.searchParams.get("action") || "approve");
    const quote = await findQuote(token);
    if (!quote) return NextResponse.json({ error: "Orcamento nao encontrado." }, { status: 404 });

    if (action === "approve") {
      if (quote.status === "APPROVED") return NextResponse.json({ item: quote.orders[0], alreadyApproved: true });
      if (new Date(quote.validUntil) < new Date()) return NextResponse.json({ error: "Este orcamento venceu. Solicite uma nova versao." }, { status: 400 });
      if (quote.approvalRequired) return NextResponse.json({ error: "Este orcamento precisa de revisao comercial antes da aprovacao." }, { status: 400 });
      const result = await (prisma as any).$transaction(async (tx: any) => {
        const current = await tx.graphicQuote.findFirst({ where: { id: quote.id, tenantId: quote.tenantId }, include: { items: true, orders: true } });
        if (current.status === "APPROVED") return { order: current.orders[0], alreadyApproved: true };
        const orderNumber = await nextOrderNumber(tx, quote.tenantId);
        await tx.graphicQuote.update({ where: { id: quote.id }, data: { status: "APPROVED", approvedAt: new Date() } });
        const order = await tx.graphicOrder.create({ data: { tenantId: quote.tenantId, quoteId: quote.id, clientId: quote.clientId, number: orderNumber, soldValueCents: quote.totalPriceCents, billedValueCents: quote.totalPriceCents, commercialSnapshot: JSON.stringify({ quote, approvedPubliclyAt: new Date().toISOString() }), productionSnapshot: JSON.stringify({ items: quote.items }) } });
        await tx.graphicOrderItem.createMany({ data: quote.items.map((item: any) => ({ tenantId: quote.tenantId, orderId: order.id, description: item.description, quantity: item.quantity, priceCents: item.priceCents, costCents: item.costCents, snapshot: JSON.stringify(item) })) });
        const production = await tx.graphicProductionOrder.create({ data: { tenantId: quote.tenantId, orderId: order.id, status: "PENDING", checklist: JSON.stringify({ arte: false, medidas: false, material: false, prazo: false, arquivos: false }), technicalSnapshot: JSON.stringify({ quote, items: quote.items }) } });
        await tx.graphicProductionStep.createMany({ data: graphicProductionSteps.map((name, position) => ({ tenantId: quote.tenantId, productionOrderId: production.id, name, position })) });
        const expectedAt = new Date(); expectedAt.setDate(expectedAt.getDate() + Math.max(...quote.items.map((item: any) => Number(item.deadlineDays || 7)), 7));
        await tx.graphicDelivery.create({ data: { tenantId: quote.tenantId, orderId: order.id, method: "RETIRADA", expectedAt, status: "PENDING" } });
        if (quote.opportunityId) await tx.graphicOpportunity.update({ where: { id: quote.opportunityId }, data: { status: "WON", nextAction: "Aguardando arte do cliente", nextFollowUp: null } });
        return { order, production, alreadyApproved: false };
      });
      return NextResponse.json({ item: result.order, productionId: result.production?.id, alreadyApproved: result.alreadyApproved });
    }

    if (action === "artwork") {
      if (quote.status !== "APPROVED") return NextResponse.json({ error: "A arte pode ser enviada depois da aprovacao do orcamento." }, { status: 400 });
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Selecione a arte para enviar." }, { status: 400 });
      const validation = validateGraphicAttachment(file);
      if (validation) return NextResponse.json({ error: validation }, { status: 400 });
      const production = quote.orders[0]?.productionOrders[0];
      if (!production) return NextResponse.json({ error: "A ordem de producao ainda nao foi criada." }, { status: 404 });
      const filename = `${crypto.randomUUID()}${safeGraphicAttachmentExt(file.name, file.type)}`;
      const storagePath = path.join(process.cwd(), "data", "uploads", quote.tenantId, "grafica", "public", filename);
      await mkdir(path.dirname(storagePath), { recursive: true });
      await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));
      const checklist = (() => { try { return JSON.parse(production.checklist || "{}"); } catch { return {}; } })();
      const result = await (prisma as any).$transaction(async (tx: any) => {
        const attachment = await tx.attachment.create({ data: { tenantId: quote.tenantId, filename, originalName: file.name, mimeType: file.type, sizeBytes: file.size, storagePath, linkedModel: "Graphic:production", linkedId: production.id } });
        const item = await tx.graphicAttachment.create({ data: { tenantId: quote.tenantId, attachmentId: attachment.id, linkedModel: "production", linkedId: production.id, purpose: "ARTWORK" } });
        await tx.graphicProductionOrder.update({ where: { id: production.id }, data: { checklist: JSON.stringify({ ...checklist, arte: true, arquivos: true }) } });
        await tx.graphicProductionEvent.create({ data: { tenantId: quote.tenantId, productionOrderId: production.id, action: "ARTWORK_RECEIVED", note: `Arte enviada pelo cliente: ${file.name}`, evidenceAttachmentId: attachment.id } });
        return item;
      });
      return NextResponse.json({ item: result });
    }
    return NextResponse.json({ error: "Acao publica invalida." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: "Nao foi possivel concluir esta etapa.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status: 500 });
  }
}
