import { prisma } from "@/lib/prisma";

const publicQuoteStatuses = ["PENDING_REVIEW", "DRAFT", "SENT", "VIEWED", "APPROVED"];

export async function getGraphicPublicQuote(token: string) {
  const db = prisma as any;
  const quote = await db.graphicQuote.findFirst({
    where: { shareToken: token, status: { in: publicQuoteStatuses } },
    include: {
      items: true,
      tenant: true,
      orders: {
        include: {
          productionOrders: {
            include: {
              steps: { orderBy: { position: "asc" } },
              events: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 100 }
            }
          },
          deliveries: true
        }
      }
    }
  });
  if (!quote) return null;

  const productionIds = quote.orders.flatMap((order: any) => order.productionOrders.map((production: any) => production.id));
  const links = productionIds.length
    ? await db.graphicAttachment.findMany({
        where: { tenantId: quote.tenantId, linkedModel: "production", linkedId: { in: productionIds }, status: "ACTIVE" },
        orderBy: { createdAt: "desc" }
      })
    : [];
  const files = links.length
    ? await db.attachment.findMany({ where: { tenantId: quote.tenantId, id: { in: links.map((item: any) => item.attachmentId) } } })
    : [];
  const filesById = new Map(files.map((item: any) => [item.id, item]));
  const attachments = links.map((link: any) => {
    const file = filesById.get(link.attachmentId) as any;
    return {
      id: link.id,
      linkedId: link.linkedId,
      purpose: link.purpose,
      createdAt: link.createdAt,
      originalName: file?.originalName || "arquivo",
      mimeType: file?.mimeType || "application/octet-stream",
      sizeBytes: file?.sizeBytes || 0,
      url: `/api/gestao-grafica/public-quotes/${token}/attachments/${link.id}`
    };
  });

  return { ...quote, attachments };
}

export async function findPublicGraphicAttachment(token: string, graphicAttachmentId: string) {
  const db = prisma as any;
  const quote = await db.graphicQuote.findFirst({
    where: { shareToken: token, status: { in: publicQuoteStatuses } },
    select: { id: true, tenantId: true, orders: { select: { productionOrders: { select: { id: true } } } } }
  });
  if (!quote) return null;
  const productionIds = quote.orders.flatMap((order: any) => order.productionOrders.map((production: any) => production.id));
  if (!productionIds.length) return null;
  const link = await db.graphicAttachment.findFirst({
    where: { id: graphicAttachmentId, tenantId: quote.tenantId, linkedModel: "production", linkedId: { in: productionIds }, status: "ACTIVE" }
  });
  if (!link) return null;
  const attachment = await db.attachment.findFirst({ where: { id: link.attachmentId, tenantId: quote.tenantId } });
  return attachment ? { quote, link, attachment } : null;
}
