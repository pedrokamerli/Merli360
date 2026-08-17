import crypto from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { approveGraphicQuote } from "@/lib/graphic-commercial";
import { safeGraphicAttachmentExt, validateGraphicAttachment } from "@/lib/graphic-attachments";

export const dynamic = "force-dynamic";

async function findQuote(token: string) {
  return (prisma as any).graphicQuote.findFirst({
    where: { shareToken: token, status: { in: ["PENDING_REVIEW", "SENT", "VIEWED", "APPROVED"] } },
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
      const result = await approveGraphicQuote({ tenantId: quote.tenantId, quoteId: quote.id, approvedPublicly: true, auditAction: "graphic_approve_quote_public" });
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
