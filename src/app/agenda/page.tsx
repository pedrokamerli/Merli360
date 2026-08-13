import { EntityManager } from "@/components/EntityManager";
import { modelConfigs } from "@/lib/models";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { currentMonth, formatDate, money, monthBounds } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function tone(type: string) {
  if (type === "pagar") return "border-red-200 bg-red-50 text-red-700";
  if (type === "receber") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (type === "colheita") return "border-lime-200 bg-lime-50 text-lime-700";
  if (type === "entrega") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-white text-slate-700";
}

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const month = params.month ?? currentMonth();
  const { start, end } = monthBounds(month);

  const [receivables, payables, sales, plantings, events] = await Promise.all([
    prisma.accountReceivable.findMany({ where: { tenantId: user.tenantId, dueDate: { gte: start, lt: end } } }),
    prisma.accountPayable.findMany({ where: { tenantId: user.tenantId, dueDate: { gte: start, lt: end } } }),
    prisma.sale.findMany({ where: { tenantId: user.tenantId, deliveryDate: { gte: start, lt: end } }, include: { buyer: true, product: true } }),
    prisma.planting.findMany({ where: { tenantId: user.tenantId, expectedHarvest: { gte: start, lt: end } }, include: { product: true } }),
    prisma.agendaEvent.findMany({ where: { tenantId: user.tenantId, date: { gte: start, lt: end } } })
  ]);

  const items = [
    ...receivables.map((item: any) => ({ date: item.dueDate, title: item.description, type: "receber", status: item.status, amount: item.amount })),
    ...payables.map((item: any) => ({ date: item.dueDate, title: item.description, type: "pagar", status: item.status, amount: item.amount })),
    ...sales.map((item: any) => ({ date: item.deliveryDate!, title: `Entrega - ${item.product.name} para ${item.buyer?.name || "comprador"}`, type: "entrega", status: item.status, amount: item.totalAmount })),
    ...plantings.map((item: any) => ({ date: item.expectedHarvest!, title: `Colheita prevista - ${item.product.name}`, type: "colheita", status: item.status, amount: item.directCost })),
    ...events.map((item: any) => ({ date: item.date, title: item.title, type: item.type, status: item.status, amount: item.amount || 0 }))
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="space-y-5">
      <header className="surface-panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Gestao Rural 360</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Agenda</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Recebimentos, pagamentos, entregas, colheitas e lembretes do mes.</p>
        </div>
        <form className="surface-panel flex items-center gap-2 p-2">
          <input name="month" type="month" defaultValue={month} className="rounded-xl bg-transparent px-3 py-2 text-sm font-bold text-slate-700 outline-none" />
          <button className="primary-action px-4 py-2">Filtrar</button>
        </form>
      </header>

      <section className="grid gap-3">
        {items.map((item, index) => (
          <article key={`${item.type}-${index}`} className={`rounded-2xl border p-4 shadow-sm ${tone(item.type)}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase">{item.type} - {item.status}</p>
                <h3 className="mt-1 font-black text-slate-950">{item.title}</h3>
                <p className="mt-1 text-sm">{formatDate(item.date)}</p>
              </div>
              {item.amount ? <strong>{money.format(item.amount)}</strong> : null}
            </div>
          </article>
        ))}
        {!items.length ? <div className="surface-panel p-5 text-sm text-slate-500">Nenhum evento para este mes.</div> : null}
      </section>

      <EntityManager config={modelConfigs.agendaEvents} />
    </div>
  );
}
