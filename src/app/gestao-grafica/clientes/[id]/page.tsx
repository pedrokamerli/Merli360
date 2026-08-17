import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasGraphicAccess, hasGraphicPermission, getGraphicRole } from "@/lib/graphic";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const label = (value: string) => ({ OPEN: "Em atendimento", QUOTE_CREATED: "Orcamento criado", SENT: "Enviado", APPROVED: "Aprovado", WON: "Fechado", LOST: "Perdido", RELEASED: "Liberado", IN_PRODUCTION: "Em producao", COMPLETED: "Concluido", SCHEDULED: "Agendada", DELIVERED: "Entregue" } as Record<string, string>)[value] || value;

export default async function GraphicClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!hasGraphicAccess(user)) redirect("/");
  const role = await getGraphicRole(user);
  const canViewFinancial = hasGraphicPermission(role, "cost:view");
  const db = prisma as any;
  const client = await db.client.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!client) notFound();

  const [opportunities, quotes, orders, postSales] = await Promise.all([
    db.graphicOpportunity.findMany({ where: { tenantId: user.tenantId, clientId: id }, orderBy: { updatedAt: "desc" }, include: { activities: { orderBy: { createdAt: "desc" } } } }),
    db.graphicQuote.findMany({ where: { tenantId: user.tenantId, clientId: id }, orderBy: { createdAt: "desc" }, include: { items: true } }),
    db.graphicOrder.findMany({ where: { tenantId: user.tenantId, clientId: id }, orderBy: { createdAt: "desc" }, include: { productionOrders: true, deliveries: true, receivables: true } }),
    db.graphicPostSale.findMany({ where: { tenantId: user.tenantId, order: { clientId: id } }, orderBy: { createdAt: "desc" } })
  ]);
  const timeline = [
    ...opportunities.map((item: any) => ({ id: `opportunity-${item.id}`, at: item.createdAt, title: "Oportunidade", detail: `${item.title} - ${label(item.status)}` })),
    ...opportunities.flatMap((item: any) => item.activities.map((activity: any) => ({ id: `activity-${activity.id}`, at: activity.createdAt, title: "Contato", detail: activity.result || activity.note || "Contato registrado" }))),
    ...quotes.map((item: any) => ({ id: `quote-${item.id}`, at: item.createdAt, title: "Orcamento", detail: `#${item.number} - ${label(item.status)}` })),
    ...orders.map((item: any) => ({ id: `order-${item.id}`, at: item.createdAt, title: "Pedido", detail: `#${item.number} - ${label(item.status)}` })),
    ...orders.flatMap((item: any) => item.productionOrders.map((production: any) => ({ id: `production-${production.id}`, at: production.updatedAt, title: "Producao", detail: `Pedido #${item.number} - ${label(production.status)}` }))),
    ...orders.flatMap((item: any) => item.deliveries.map((delivery: any) => ({ id: `delivery-${delivery.id}`, at: delivery.updatedAt, title: "Entrega", detail: `Pedido #${item.number} - ${label(delivery.status)}` }))),
    ...postSales.map((item: any) => ({ id: `post-sale-${item.id}`, at: item.createdAt, title: "Pos-venda", detail: item.note || item.status }))
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const receivableOpen = orders.flatMap((item: any) => item.receivables).reduce((sum: number, item: any) => sum + Number(item.amountCents || 0) - Number(item.receivedCents || 0), 0);

  return <main className="mx-auto max-w-5xl space-y-5">
    <header className="surface-panel flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between"><div><p className="eyebrow">Jornada do cliente</p><h1 className="mt-1 text-2xl font-black text-slate-950">{client.name}</h1><p className="mt-2 text-sm font-semibold text-slate-500">{[client.responsibleName, client.phone || client.whatsapp, client.email, client.city].filter(Boolean).join(" | ") || "Cadastro em complemento"}</p></div><div className="flex flex-wrap gap-2">{client.phone || client.whatsapp ? <a className="secondary-action py-2 text-sm" target="_blank" rel="noreferrer" href={`https://wa.me/${String(client.phone || client.whatsapp).replace(/\\D/g, "")}`}>WhatsApp</a> : null}<a className="secondary-action py-2 text-sm" href="/gestao-grafica/comercial">Voltar ao CRM</a><a className="primary-action py-2 text-sm" href={`/gestao-grafica/comercial?clientId=${client.id}`}>Criar orcamento</a></div></header>
    <section className="grid gap-3 sm:grid-cols-3"><article className="surface-panel p-4"><p className="text-xs font-bold text-slate-500">Oportunidades</p><p className="mt-1 text-2xl font-black text-slate-950">{opportunities.length}</p></article><article className="surface-panel p-4"><p className="text-xs font-bold text-slate-500">Pedidos</p><p className="mt-1 text-2xl font-black text-slate-950">{orders.length}</p></article><article className="surface-panel p-4"><p className="text-xs font-bold text-slate-500">A receber</p><p className="mt-1 text-2xl font-black text-slate-950">{canViewFinancial ? money.format(receivableOpen / 100) : "Restrito"}</p></article></section>
    <section className="surface-panel p-5"><h2 className="text-lg font-black text-slate-950">Linha do tempo</h2><div className="mt-4 space-y-3">{timeline.length ? timeline.map((item) => <article key={item.id} className="border-l-2 border-emerald-500 pl-3"><p className="text-xs font-black text-emerald-700">{item.title} - {dateTime.format(new Date(item.at))}</p><p className="mt-1 text-sm font-semibold text-slate-700">{item.detail}</p></article>) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Ainda nao ha historico grafico para este cliente.</p>}</div></section>
  </main>;
}
