import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format((cents || 0) / 100);
const day = (value?: Date | string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "-";

export default async function PublicGraphicQuote({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = prisma as any;
  const quote = await db.graphicQuote.findFirst({
    where: { shareToken: token, status: { in: ["DRAFT", "SENT", "VIEWED", "APPROVED"] } },
    include: { items: true, tenant: true }
  });
  if (!quote) notFound();
  if (!quote.viewedAt) {
    await db.graphicQuote.update({ where: { id: quote.id }, data: { viewedAt: new Date(), status: quote.status === "DRAFT" ? "VIEWED" : quote.status } });
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <section className="mx-auto max-w-3xl rounded-lg bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-600">{quote.tenant?.brandName || "Merli360"}</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Orcamento #{quote.number}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">Valido ate {day(quote.validUntil)}</p>

        <div className="mt-5 space-y-3">
          {quote.items.map((item: any) => (
            <article key={item.id} className="rounded-lg border border-slate-200 p-4">
              <h2 className="font-black text-slate-900">{item.description}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Quantidade: {item.quantity} {item.unit} | Prazo: {item.deadlineDays || "-"} dias</p>
              <p className="mt-3 text-xl font-black text-emerald-700">{brl(item.priceCents)}</p>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-600">Condicao de pagamento</p>
          <p className="mt-1 text-sm text-slate-700">{quote.paymentTerms || "A combinar"}</p>
          {quote.notes ? <p className="mt-3 text-sm text-slate-600">{quote.notes}</p> : null}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <strong className="text-2xl font-black text-slate-950">Total: {brl(quote.totalPriceCents)}</strong>
          <Link className="primary-action inline-flex items-center justify-center px-4 py-3" href={`/api/gestao-grafica/public-quotes/${token}/pdf`}>Baixar PDF</Link>
        </div>
      </section>
    </main>
  );
}
