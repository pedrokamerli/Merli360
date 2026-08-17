import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GraphicPublicQuotePortal } from "@/components/GraphicPublicQuotePortal";

export const dynamic = "force-dynamic";

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await (prisma as any).graphicQuote.findFirst({ where: { shareToken: token, status: { in: ["DRAFT", "SENT", "VIEWED", "APPROVED"] } }, include: { tenant: true, items: true, orders: { include: { productionOrders: { include: { steps: { orderBy: { position: "asc" } } } }, deliveries: true } } } });
  if (!quote) notFound();
  if (quote.status === "SENT" && !quote.viewedAt) await (prisma as any).graphicQuote.update({ where: { id: quote.id }, data: { status: "VIEWED", viewedAt: new Date() } });
  return <GraphicPublicQuotePortal token={token} quote={JSON.parse(JSON.stringify(quote))} />;
}
