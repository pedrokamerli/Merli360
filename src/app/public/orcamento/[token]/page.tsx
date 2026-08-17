import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getGraphicPublicQuote } from "@/lib/graphic-public-quote";
import { GraphicPublicQuotePortal } from "@/components/GraphicPublicQuotePortal";

export const dynamic = "force-dynamic";

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await getGraphicPublicQuote(token);
  if (!quote) notFound();
  if (quote.status === "SENT" && !quote.viewedAt) await (prisma as any).graphicQuote.update({ where: { id: quote.id }, data: { status: "VIEWED", viewedAt: new Date() } });
  return <GraphicPublicQuotePortal token={token} quote={JSON.parse(JSON.stringify(quote))} />;
}
