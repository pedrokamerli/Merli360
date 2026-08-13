import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeSimplePdf } from "@/lib/simple-pdf";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format((cents || 0) / 100);
const day = (value?: Date | string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "-";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = prisma as any;
  const quote = await db.graphicQuote.findFirst({
    where: { shareToken: token, status: { in: ["DRAFT", "SENT", "VIEWED", "APPROVED"] } },
    include: { items: true, tenant: true }
  });
  if (!quote) return NextResponse.json({ error: "Orcamento nao encontrado." }, { status: 404 });

  const lines = [
    `${quote.tenant?.brandName || "Merli360"} - Orcamento #${quote.number}`,
    `Validade: ${day(quote.validUntil)}`,
    `Condicao: ${quote.paymentTerms || "A combinar"}`,
    "",
    ...quote.items.flatMap((item: any, index: number) => [
      `Item ${index + 1}: ${item.description}`,
      `Quantidade: ${item.quantity} ${item.unit} | Prazo: ${item.deadlineDays || "-"} dias`,
      `Valor: ${brl(item.priceCents)}`,
      ""
    ]),
    `Total: ${brl(quote.totalPriceCents)}`,
    quote.notes ? `Observacoes: ${quote.notes}` : ""
  ].filter(Boolean);
  const pdf = makeSimplePdf(lines);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"orcamento-grafica-${quote.number}.pdf\"`
    }
  });
}
