"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronUp, Clock3, Eye, Factory, Loader2, PackageCheck, Play, RefreshCw } from "lucide-react";
import { GraphicCatalogRequestsPanel } from "@/components/GraphicCatalogRequestsPanel";
import { GraphicProductionOrderDetails } from "@/components/GraphicProductionOrderDetails";

type Row = Record<string, any>;
type OperationsTab = "requests" | "production" | "delivery";

const inputClass = "min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const date = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(value)) : "Sem data";
const productionLabel = (status?: string) => ({ PENDING: "Conferencia", RELEASED: "Pronta para iniciar", IN_PROGRESS: "Em producao", BLOCKED: "Bloqueada", COMPLETED: "Pronta para expedicao", CANCELLED: "Cancelada" } as Row)[status || ""] || status || "Aguardando";
const deliveryLabel = (status?: string) => ({ PENDING: "Aguardando producao", SCHEDULED: "Expedicao agendada", DELIVERED: "Entregue", ACCEPTED: "Aceite confirmado", COMPLAINT: "Com reclamacao", CANCELLED: "Cancelada" } as Row)[status || ""] || status || "Aguardando";

function parseChecklist(value: unknown) {
  if (!value) return {} as Record<string, boolean>;
  if (typeof value === "object") return value as Record<string, boolean>;
  try { return JSON.parse(String(value)) as Record<string, boolean>; } catch { return {}; }
}

function elapsed(startedAt: string | undefined, clock: number) {
  if (!startedAt) return "00:00:00";
  const seconds = Math.max(0, Math.floor((clock - new Date(startedAt).getTime()) / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
}

export function GraphicOperationsWorkspaceV2() {
  const [data, setData] = useState<Row | null>(null);
  const [tab, setTab] = useState<OperationsTab>("production");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const response = await fetch("/api/gestao-grafica/summary", { cache: "no-store" });
    const body = await response.json();
    if (!silent) setLoading(false);
    if (!response.ok) setMessage(body.error || "Nao foi possivel carregar a operacao.");
    else setData(body);
  }

  useEffect(() => { void load(); }, []);

  async function productionAction(id: string, payload: Row, success: string) {
    setBusyId(id);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/production", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) });
    const body = await response.json();
    setBusyId("");
    if (!response.ok) { setMessage(body.error || "Nao foi possivel atualizar a producao."); return false; }
    setMessage(success);
    await load();
    return true;
  }

  async function deliveryAction(id: string, payload: Row, success: string) {
    setBusyId(id);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/deliveries", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) });
    const body = await response.json();
    setBusyId("");
    if (!response.ok) { setMessage(body.error || "Nao foi possivel atualizar a expedicao."); return false; }
    setMessage(success);
    await load();
    return true;
  }

  const production = data?.productionOrders || [];
  const deliveries = data?.deliveries || [];
  const catalogRequests = data?.catalogRequests || [];
  const orders = data?.orders || [];
  const openProduction = production.filter((item: Row) => !["COMPLETED", "CANCELLED"].includes(item.status));
  const completedProduction = production.filter((item: Row) => item.status === "COMPLETED");
  const openDeliveries = deliveries.filter((item: Row) => !["DELIVERED", "ACCEPTED", "CANCELLED"].includes(item.status));

  return <main className="mx-auto max-w-screen-2xl space-y-5">
    <header className="surface-panel flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
      <div><p className="eyebrow">Operacao da grafica</p><h1 className="text-2xl font-black text-slate-950">Producao e expedicao</h1><p className="mt-1 text-sm font-medium text-slate-500">Cada ordem mostra somente a acao que pode ser executada agora.</p></div>
      <button className="secondary-action inline-flex items-center justify-center gap-2 px-3 py-2" type="button" onClick={() => void load()}><RefreshCw size={16} />Atualizar</button>
    </header>

    <nav className="surface-panel flex gap-2 overflow-x-auto p-2">
      <button className={`flex items-center gap-2 rounded-md px-4 py-3 text-sm font-black ${tab === "requests" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => setTab("requests")} type="button"><CheckCircle2 size={17} />Novos orcamentos <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{catalogRequests.length}</span></button>
      <button className={`flex items-center gap-2 rounded-md px-4 py-3 text-sm font-black ${tab === "production" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => setTab("production")} type="button"><Factory size={17} />Producao <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{openProduction.length}</span></button>
      <button className={`flex items-center gap-2 rounded-md px-4 py-3 text-sm font-black ${tab === "delivery" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => setTab("delivery")} type="button"><PackageCheck size={17} />Expedicao <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{openDeliveries.length}</span></button>
    </nav>

    {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</p> : null}
    {loading ? <div className="surface-panel flex items-center gap-2 p-5 text-sm font-bold text-slate-600"><Loader2 className="animate-spin" size={18} />Carregando ordens...</div> : null}

    {tab === "requests" && !loading ? <GraphicCatalogRequestsPanel requests={catalogRequests} compact /> : null}

    {tab === "production" && !loading ? <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">{openProduction.map((item: Row) => <ProductionOrderCard key={item.id} item={item} order={orders.find((order: Row) => order.id === item.orderId)} busy={busyId === item.id} onAction={productionAction} onUpdated={() => load(true)} />)}{!openProduction.length ? <div className="surface-panel p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={28} /><p className="mt-3 font-black text-slate-950">Nenhuma ordem aguardando producao.</p></div> : null}</div>
      {completedProduction.length ? <details className="surface-panel p-4"><summary className="cursor-pointer text-sm font-black text-slate-700">Concluidas recentemente ({completedProduction.length})</summary><div className="mt-3 grid gap-2 md:grid-cols-2">{completedProduction.slice(0, 10).map((item: Row) => <div className="rounded-lg bg-slate-50 p-3 text-sm" key={item.id}><b>Pedido #{item.order?.number || "-"}</b><span className="ml-2 text-emerald-700">Producao concluida</span></div>)}</div></details> : null}
    </section> : null}

    {tab === "delivery" && !loading ? <section className="grid gap-4 xl:grid-cols-2">{openDeliveries.map((item: Row) => <DeliveryCard key={item.id} item={item} order={orders.find((order: Row) => order.id === item.orderId)} production={production.find((row: Row) => row.orderId === item.orderId)} busy={busyId === item.id} onAction={deliveryAction} />)}{!openDeliveries.length ? <div className="surface-panel p-8 text-center"><PackageCheck className="mx-auto text-emerald-600" size={28} /><p className="mt-3 font-black text-slate-950">Nenhuma expedicao pendente.</p></div> : null}</section> : null}
  </main>;
}

function ProductionOrderCard({ item, order, busy, onAction, onUpdated }: { item: Row; order?: Row; busy: boolean; onAction: (id: string, payload: Row, success: string) => Promise<boolean>; onUpdated: () => Promise<void> }) {
  const [clock, setClock] = useState(Date.now());
  const [blockReason, setBlockReason] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderReviewed, setOrderReviewed] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => parseChecklist(item.checklist));
  const checklistItems = [["arquivos", "Arquivos do cliente recebidos"], ["arte", "Arte final aprovada"], ["medidas", "Medidas conferidas"], ["material", "Material disponivel"], ["prazo", "Prazo confirmado"]];
  const steps = item.steps || [];
  const activeStep = steps.find((step: Row) => step.status === "IN_PROGRESS");
  const nextStep = steps.find((step: Row) => step.status === "PENDING");
  const completed = steps.filter((step: Row) => ["COMPLETED", "SKIPPED"].includes(step.status)).length;
  const checklistReady = checklistItems.every(([key]) => checklist[key]);
  const progress = steps.length ? Math.round((completed / steps.length) * 100) : 0;

  useEffect(() => {
    if (!activeStep?.startedAt) return;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeStep?.id, activeStep?.startedAt]);
  useEffect(() => { setChecklist(parseChecklist(item.checklist)); }, [item.checklist]);

  async function updateChecklist(key: string, checked: boolean) {
    setChecklist((current) => ({ ...current, [key]: checked }));
    const updated = await onAction(item.id, { action: "checklist", checklist: { [key]: checked } }, "Checklist atualizado.");
    if (!updated) setChecklist(parseChecklist(item.checklist));
  }

  const currentAction = orderOpen ? "Pedido aberto" : !orderReviewed ? "Ver pedido completo" : item.status === "PENDING" ? "Conferir entrada" : item.status === "BLOCKED" ? "Resolver bloqueio" : activeStep ? `Concluir ${activeStep.name}` : nextStep ? `Iniciar ${nextStep.name}` : "Finalizar ordem";
  return <article className={`surface-panel overflow-hidden ${orderOpen ? "xl:col-span-2" : ""}`}>
    <header className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-slate-950">Pedido #{item.order?.number || order?.number || "-"}</h2><span className={`rounded-full px-2 py-1 text-xs font-black ${item.status === "BLOCKED" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{productionLabel(item.status)}</span></div><p className="mt-1 text-sm font-semibold text-slate-600">{order?.clientName || "Cliente"} | {order?.productName || "Produto"}</p><p className="mt-1 text-xs font-bold text-slate-500">Prazo: {date(item.promisedAt)} | Prioridade: {item.priority || "NORMAL"}</p></div>
      <div className="flex shrink-0 flex-col gap-2"><button aria-expanded={orderOpen} className="primary-action inline-flex items-center justify-center gap-2 px-4 py-2" disabled={!order} onClick={() => setOrderOpen((current) => !current)} type="button">{orderOpen ? <ChevronUp size={17} /> : <Eye size={17} />}{orderOpen ? "Recolher pedido" : "Ver pedido"}</button><div className="rounded-lg bg-slate-950 px-3 py-2 text-white"><p className="text-[10px] font-black uppercase text-slate-300">Proxima acao</p><p className="text-sm font-black">{currentAction}</p></div></div>
    </header>

    {orderOpen && order ? <GraphicProductionOrderDetails production={item} order={order} onClose={() => setOrderOpen(false)} onContinue={() => { setOrderReviewed(true); setOrderOpen(false); }} onUpdated={onUpdated} /> : !orderReviewed ? <div className="p-4"><div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><h3 className="font-black text-amber-950">Confira o pedido antes de produzir</h3><p className="mt-1 text-sm font-semibold text-amber-800">Abra a ficha para verificar cliente, endereco, todos os itens, medidas e arquivos enviados.</p><button className="primary-action mt-3 inline-flex w-full items-center justify-center gap-2 py-3" disabled={!order} onClick={() => setOrderOpen(true)} type="button"><Eye size={17} />Ver pedido completo</button></div></div> : <div className="p-4">
      <div className="mb-4"><div className="flex justify-between text-xs font-black text-slate-500"><span>Progresso da producao</span><span>{completed}/{steps.length} etapas</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div></div>

      {item.status === "PENDING" ? <section><h3 className="text-sm font-black text-slate-800">Checklist de entrada</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{checklistItems.map(([key, label]) => <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-bold text-slate-700" key={key}><input checked={Boolean(checklist[key])} disabled={busy} onChange={(event) => void updateChecklist(key, event.target.checked)} type="checkbox" />{label}</label>)}</div><button className="primary-action mt-3 w-full py-3 disabled:opacity-50" disabled={!checklistReady || busy} onClick={() => void onAction(item.id, { status: "RELEASED" }, "Ordem liberada para iniciar.")} type="button">{checklistReady ? "Liberar ordem para producao" : "Conclua o checklist para liberar"}</button></section> : null}

      {["RELEASED", "IN_PROGRESS"].includes(item.status) ? <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-black uppercase text-emerald-700">Etapa atual</p>{activeStep ? <><div className="mt-2 flex items-center justify-between gap-3"><h3 className="text-xl font-black text-slate-950">{activeStep.name}</h3><span className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 font-mono text-lg font-black text-emerald-800"><Clock3 size={17} />{elapsed(activeStep.startedAt, clock)}</span></div><button className="primary-action mt-4 w-full py-3" disabled={busy} onClick={() => void onAction(item.id, { action: "step", stepId: activeStep.id, stepStatus: "COMPLETED" }, `${activeStep.name} concluida. A proxima etapa foi liberada.`)} type="button"><CheckCircle2 size={17} />Concluir etapa</button></> : nextStep ? <><h3 className="mt-2 text-xl font-black text-slate-950">{nextStep.name}</h3><p className="mt-1 text-sm font-semibold text-slate-600">O cronometro comeca ao clicar em iniciar.</p><button className="primary-action mt-4 w-full py-3" disabled={busy} onClick={() => void onAction(item.id, { action: "step", stepId: nextStep.id, stepStatus: "IN_PROGRESS" }, `${nextStep.name} iniciada.`)} type="button"><Play size={17} />Iniciar etapa</button></> : <button className="primary-action w-full py-3" disabled={busy} onClick={() => void onAction(item.id, { status: "COMPLETED" }, "Producao concluida e liberada para expedicao.")} type="button"><PackageCheck size={17} />Concluir producao e liberar expedicao</button>}</section> : null}

      {item.status === "BLOCKED" ? <section className="rounded-lg border border-rose-200 bg-rose-50 p-4"><div className="flex gap-2"><AlertTriangle className="shrink-0 text-rose-600" size={18} /><div><h3 className="font-black text-rose-900">Ordem bloqueada</h3><p className="text-sm font-semibold text-rose-800">{item.blockedReason || "Motivo nao informado"}</p></div></div><button className="primary-action mt-3 w-full py-3" disabled={busy} onClick={() => void onAction(item.id, { status: "RELEASED", note: "Bloqueio resolvido" }, "Bloqueio resolvido. Ordem liberada.")} type="button">Retomar producao</button></section> : null}

      {["RELEASED", "IN_PROGRESS"].includes(item.status) ? <details className="mt-3 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-black text-slate-600">Registrar impedimento</summary><div className="mt-3 flex gap-2"><input className={`${inputClass} flex-1`} placeholder="Motivo do bloqueio" value={blockReason} onChange={(event) => setBlockReason(event.target.value)} /><button className="secondary-action px-3 py-2 text-xs text-rose-700 disabled:opacity-50" disabled={!blockReason.trim() || busy} onClick={() => void onAction(item.id, { status: "BLOCKED", note: blockReason }, "Ordem bloqueada e motivo registrado.")} type="button">Bloquear</button></div></details> : null}
    </div>}
  </article>;
}

function DeliveryCard({ item, order, production, busy, onAction }: { item: Row; order?: Row; production?: Row; busy: boolean; onAction: (id: string, payload: Row, success: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ method: item.method || "RETIRADA", expectedAt: item.expectedAt ? String(item.expectedAt).slice(0, 10) : "", responsibleName: item.responsibleName || "" });
  const productionReady = production?.status === "COMPLETED";
  const schedule = () => onAction(item.id, { status: "SCHEDULED", ...form }, "Expedicao agendada.");
  const deliver = () => onAction(item.id, { status: "DELIVERED", ...form, deliveredAt: new Date().toISOString() }, "Pedido entregue. Pos-venda criado automaticamente.");
  const displayStatus = productionReady && item.status === "PENDING" ? "Pronta para agendar" : deliveryLabel(item.status);
  return <article className="surface-panel p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950">Pedido #{item.order?.number || order?.number || "-"}</h2><p className="mt-1 text-sm font-semibold text-slate-600">{order?.clientName || "Cliente"} | {order?.productName || "Produto"}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{displayStatus}</span></div>{!productionReady ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">A producao ainda precisa ser concluida antes da expedicao.</p> : <><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-black text-slate-600"><span>Forma de entrega</span><select className={inputClass} value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}><option value="RETIRADA">Retirada</option><option value="ENTREGA">Entrega</option><option value="INSTALACAO">Instalacao</option><option value="TRANSPORTADORA">Transportadora</option></select></label><label className="grid gap-1 text-xs font-black text-slate-600"><span>Data prevista</span><input className={inputClass} type="date" value={form.expectedAt} onChange={(event) => setForm({ ...form, expectedAt: event.target.value })} /></label><label className="grid gap-1 text-xs font-black text-slate-600 sm:col-span-2"><span>Responsavel</span><input className={inputClass} placeholder="Quem fara a entrega" value={form.responsibleName} onChange={(event) => setForm({ ...form, responsibleName: event.target.value })} /></label></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><button className="secondary-action py-3 disabled:opacity-50" disabled={!form.expectedAt || !form.responsibleName.trim() || busy || item.status === "DELIVERED"} onClick={() => void schedule()} type="button">{item.status === "SCHEDULED" ? "Atualizar agendamento" : "Agendar expedicao"}</button><button className="primary-action py-3 disabled:opacity-50" disabled={item.status !== "SCHEDULED" || !form.responsibleName.trim() || busy} onClick={() => void deliver()} type="button"><PackageCheck size={17} />Marcar como entregue</button></div>{item.status === "PENDING" ? <p className="mt-2 text-xs font-bold text-slate-500">Agende a expedicao para liberar a confirmacao da entrega.</p> : null}</>}</article>;
}
