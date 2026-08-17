import crypto from "crypto";
import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { approveGraphicQuote } from "@/lib/graphic-commercial";
import { graphicAttachmentDirectory, safeGraphicAttachmentExt, validateGraphicAttachment } from "@/lib/graphic-attachments";
import { getGraphicPublicQuote } from "@/lib/graphic-public-quote";

export const dynamic = "force-dynamic";

function parseChecklist(value: unknown) {
  if (typeof value === "object" && value) return value as Record<string, boolean>;
  try { return JSON.parse(String(value || "{}")); } catch { return {}; }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await getGraphicPublicQuote(token);
  if (!quote) return NextResponse.json({ error: "Orcamento nao encontrado." }, { status: 404 });
  if (quote.status === "SENT" && !quote.viewedAt) {
    await (prisma as any).graphicQuote.update({ where: { id: quote.id }, data: { status: "VIEWED", viewedAt: new Date() } });
    quote.status = "VIEWED";
  }
  return NextResponse.json({ item: quote });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  let storagePath = "";
  let committed = false;
  try {
    const { token } = await params;
    const action = String(request.nextUrl.searchParams.get("action") || "approve");
    const quote = await getGraphicPublicQuote(token);
    if (!quote) return NextResponse.json({ error: "Orcamento nao encontrado." }, { status: 404 });

    if (action === "approve") {
      const result = await approveGraphicQuote({ tenantId: quote.tenantId, quoteId: quote.id, approvedPublicly: true, auditAction: "graphic_approve_quote_public" });
      return NextResponse.json({ item: result.order, productionId: result.production?.id, alreadyApproved: result.alreadyApproved });
    }

    if (action === "artwork") {
      if (quote.status !== "APPROVED") return NextResponse.json({ error: "A arte pode ser enviada depois da aprovacao do orcamento." }, { status: 400 });
      const customerFiles = quote.attachments.filter((item: any) => ["ARTWORK", "CUSTOMER_ARTWORK", "LOGO", "DOCUMENT", "OTHER"].includes(item.purpose));
      if (customerFiles.length >= 20) return NextResponse.json({ error: "Este pedido ja possui 20 arquivos do cliente. Fale com a equipe para substituir ou remover um anexo." }, { status: 400 });
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Selecione a arte para enviar." }, { status: 400 });
      const validation = validateGraphicAttachment(file);
      if (validation) return NextResponse.json({ error: validation }, { status: 400 });
      const production = quote.orders[0]?.productionOrders[0];
      if (!production) return NextResponse.json({ error: "A ordem de producao ainda nao foi criada." }, { status: 404 });

      const filename = `${crypto.randomUUID()}${safeGraphicAttachmentExt(file.name, file.type)}`;
      storagePath = path.join(graphicAttachmentDirectory(quote.tenantId), "public", filename);
      await mkdir(path.dirname(storagePath), { recursive: true });
      await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));
      const checklist = parseChecklist(production.checklist);
      const db = prisma as any;
      const result = await db.$transaction(async (tx: any) => {
        const attachment = await tx.attachment.create({
          data: {
            tenantId: quote.tenantId,
            filename,
            originalName: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            storagePath,
            linkedModel: "Graphic:production",
            linkedId: production.id
          }
        });
        const item = await tx.graphicAttachment.create({ data: { tenantId: quote.tenantId, attachmentId: attachment.id, linkedModel: "production", linkedId: production.id, purpose: "CUSTOMER_ARTWORK" } });
        await tx.graphicProductionOrder.update({ where: { id: production.id }, data: { checklist: JSON.stringify({ ...checklist, arte: false, arquivos: true }) } });
        await tx.graphicProductionEvent.create({ data: { tenantId: quote.tenantId, productionOrderId: production.id, action: "CUSTOMER_ARTWORK_RECEIVED", note: `Arquivo enviado pelo cliente: ${file.name}`, evidenceAttachmentId: attachment.id } });
        if (quote.opportunityId) {
          await tx.graphicOpportunity.update({ where: { id: quote.opportunityId }, data: { nextAction: "Preparar e enviar arte final para aprovacao", updatedAt: new Date() } });
        }
        return { item, attachment };
      });
      committed = true;
      await audit({ tenantId: quote.tenantId, action: "graphic_public_artwork_upload", entity: "GraphicAttachment", entityId: result.item.id, request, metadata: { quoteId: quote.id, productionId: production.id, originalName: file.name, sizeBytes: file.size } });
      return NextResponse.json({ item: result.item, attachment: { originalName: result.attachment.originalName, sizeBytes: result.attachment.sizeBytes } });
    }

    if (action === "approve-final-artwork") {
      if (quote.status !== "APPROVED") return NextResponse.json({ error: "A arte final so pode ser aprovada em um pedido confirmado." }, { status: 400 });
      const production = quote.orders[0]?.productionOrders[0];
      if (!production) return NextResponse.json({ error: "A ordem de producao ainda nao foi criada." }, { status: 404 });
      const finalFiles = quote.attachments.filter((item: any) => ["FINAL_ARTWORK", "PROOF"].includes(item.purpose));
      if (!finalFiles.length) return NextResponse.json({ error: "A equipe ainda nao publicou a arte final deste pedido." }, { status: 400 });
      const customerFiles = quote.attachments.filter((item: any) => ["ARTWORK", "CUSTOMER_ARTWORK", "LOGO", "DOCUMENT", "OTHER"].includes(item.purpose));
      const latestFinalAt = Math.max(...finalFiles.map((item: any) => new Date(item.createdAt).getTime()));
      const latestCustomerAt = customerFiles.length ? Math.max(...customerFiles.map((item: any) => new Date(item.createdAt).getTime())) : 0;
      if (latestCustomerAt > latestFinalAt) return NextResponse.json({ error: "Existe um arquivo do cliente mais recente. Aguarde a equipe publicar a nova arte final." }, { status: 400 });
      const latestApproval = production.events.find((item: any) => item.action === "FINAL_ARTWORK_APPROVED" && new Date(item.createdAt).getTime() >= Math.max(latestFinalAt, latestCustomerAt));
      if (latestApproval) return NextResponse.json({ item: latestApproval, alreadyApproved: true });

      const checklist = parseChecklist(production.checklist);
      const db = prisma as any;
      const event = await db.$transaction(async (tx: any) => {
        await tx.graphicProductionOrder.update({ where: { id: production.id }, data: { checklist: JSON.stringify({ ...checklist, arte: true, arquivos: true }) } });
        const created = await tx.graphicProductionEvent.create({ data: { tenantId: quote.tenantId, productionOrderId: production.id, action: "FINAL_ARTWORK_APPROVED", note: "Arte final aprovada pelo cliente no link publico." } });
        if (quote.opportunityId) {
          await tx.graphicOpportunity.update({ where: { id: quote.opportunityId }, data: { nextAction: "Liberar pedido para producao", updatedAt: new Date() } });
        }
        return created;
      });
      await audit({ tenantId: quote.tenantId, action: "graphic_public_final_artwork_approved", entity: "GraphicProductionOrder", entityId: production.id, request, metadata: { quoteId: quote.id, finalAttachmentIds: finalFiles.map((item: any) => item.id) } });
      return NextResponse.json({ item: event, alreadyApproved: false });
    }

    return NextResponse.json({ error: "Acao publica invalida." }, { status: 400 });
  } catch (error: any) {
    if (storagePath && !committed) await unlink(storagePath).catch(() => undefined);
    const messages: Record<string, string> = {
      QUOTE_NOT_FOUND: "Orcamento nao encontrado.",
      QUOTE_NOT_SENT: "Este orcamento ainda nao foi enviado para aprovacao.",
      QUOTE_EXPIRED: "Este orcamento venceu. Solicite uma nova versao.",
      QUOTE_WITHOUT_ITEMS: "Este orcamento nao possui itens validos.",
      QUOTE_COMMERCIAL_APPROVAL_PENDING: "Este orcamento precisa de revisao comercial antes da aprovacao.",
      QUOTE_APPROVAL_INCOMPLETE: "Este orcamento esta em revisao pela equipe."
    };
    const known = messages[error?.message];
    return NextResponse.json({ error: known || "Nao foi possivel concluir esta etapa.", detail: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error) }, { status: known ? 400 : 500 });
  }
}
