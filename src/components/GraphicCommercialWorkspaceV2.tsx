"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, CheckCircle2, Copy, ExternalLink, FileDown, FileText, Loader2, MessageCircle, Plus, Search, Send, X } from "lucide-react";
import { GraphicCatalogShareDialog } from "@/components/GraphicCatalogShareDialog";
import { MetricCard } from "@/components/MetricCard";

type Row = Record<string, any>;
type Tab = "today" | "pipeline" | "clients" | "history";
type DialogName = "opportunity" | "quote" | null;
type QuoteMode = "catalog" | "custom";

const inputClass = "min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format(Number(cents || 0) / 100);
const shortDate = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Sem data";
const todayPlus = (days: number) => { const value = new Date(); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };
const quoteStatus = (status?: string) => ({ DRAFT: "Rascunho", SENT: "Enviado", VIEWED: "Visualizado", APPROVED: "Aprovado", REFUSED: "Recusado", CANCELLED: "Cancelado" } as Row)[status || ""] || status || "Em aberto";

function blankQuoteItem(mode: QuoteMode = "catalog") {
  return { mode, description: "", catalogItemId: "", catalogVariantId: "", productId: "", quantity: "1", width: "", height: "", deadlineDays: "7", negotiatedPrice: "", unit: "unidade", priority: "NORMAL" };
}

function itemVariant(catalogItems: Row[], item: Row) {
  const catalog = catalogItems.find((row) => row.id === item.catalogItemId);
  return catalog?.variants?.find((row: Row) => row.id === item.catalogVariantId);
}

export function GraphicCommercialWorkspaceV2({ scope = "all", onBackToLeads }: { scope?: "all" | "mine"; onBackToLeads?: () => void }) {
  const [data, setData] = useState<Row | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [dialog, setDialog] = useState<DialogName>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [opportunity, setOpportunity] = useState({ clientId: "", clientName: "", phone: "", email: "", city: "", title: "", productInterest: "", estimatedValue: "", nextAction: "Retornar cliente", nextFollowUp: todayPlus(1) });
  const [quote, setQuote] = useState({ ...blankQuoteItem("catalog"), clientId: "", opportunityId: "", freight: "", validUntil: todayPlus(7), paymentTerms: "50% na aprovacao e 50% na entrega", notes: "" });
  const [additionalItems, setAdditionalItems] = useState<Row[]>([]);
  const [quotePreview, setQuotePreview] = useState<Row | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [pendingQuoteAction, setPendingQuoteAction] = useState<{ type: "send" | "approve" | "duplicate"; item: Row } | null>(null);
  const [createdQuote, setCreatedQuote] = useState<Row | null>(null);
  const [sendFollowUp, setSendFollowUp] = useState(todayPlus(1));
  const [copiedQuoteId, setCopiedQuoteId] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/gestao-grafica/summary${scope === "mine" ? "?scope=mine" : ""}`, { cache: "no-store" });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) setMessage(body.error || "Nao foi possivel carregar o CRM.");
    else setData(body);
  }

  useEffect(() => { void load(); }, []);

  const clients = data?.clients || [];
  const opportunities = data?.opportunities || [];
  const quotes = data?.quotes || [];
  const orders = data?.orders || [];
  const products = (data?.products || []).filter((item: Row) => item.pricingReady);
  const catalogItems = data?.catalogItems || [];
  const stages = data?.stages || [];
  const metrics = data?.metrics || {};

  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get("clientId");
    const opportunityId = params.get("opportunityId") || "";
    if (!clientId || !clients.some((item: Row) => item.id === clientId)) return;
    const client = clients.find((item: Row) => item.id === clientId);
    const selectedOpportunity = opportunities.find((item: Row) => item.id === opportunityId && item.clientId === clientId);
    const interest = String(selectedOpportunity?.productInterest || selectedOpportunity?.title || "");
    const matchingCatalog = catalogItems.find((item: Row) => interest && `${item.name} ${item.category}`.toLowerCase().includes(interest.toLowerCase()));
    const matchingProduct = products.find((item: Row) => interest && (item.name.toLowerCase().includes(interest.toLowerCase()) || interest.toLowerCase().includes(item.name.toLowerCase())));
    const firstVariant = matchingCatalog?.variants?.[0];
    setQuote((current) => ({ ...current, clientId, opportunityId, mode: firstVariant ? "catalog" : "custom", catalogItemId: matchingCatalog?.id || "", catalogVariantId: firstVariant?.id || "", productId: firstVariant?.productId || matchingProduct?.id || "", quantity: String(firstVariant?.quantity || 1), width: firstVariant?.widthMm ? String(firstVariant.widthMm) : "", height: firstVariant?.heightMm ? String(firstVariant.heightMm) : "", description: firstVariant ? `${matchingCatalog.name} - ${firstVariant.label}` : matchingProduct?.name || interest || current.description }));
    setOpportunity((current) => ({ ...current, clientId, clientName: client?.name || "", phone: client?.phone || "", email: client?.email || "", city: client?.city || "" }));
    setDialog("quote");
    window.history.replaceState({}, "", window.location.pathname);
  }, [data]);

  useEffect(() => {
    const ready = quote.catalogVariantId || quote.productId || quote.negotiatedPrice;
    if (dialog !== "quote" || !quote.description.trim() || !ready) { setQuotePreview(null); setPreviewError(""); return; }
    const timeout = window.setTimeout(async () => {
      const response = await fetch("/api/gestao-grafica/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...quote, preview: true, items: [quote, ...additionalItems] }) });
      const body = await response.json();
      if (response.ok) { setQuotePreview(body); setPreviewError(""); }
      else { setQuotePreview(null); setPreviewError(body.error || "Confira os dados do orcamento."); }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [dialog, quote, additionalItems]);

  const dueToday = opportunities.filter((item: Row) => item.nextFollowUp && String(item.nextFollowUp).slice(0, 10) === todayPlus(0));
  const overdue = opportunities.filter((item: Row) => item.nextFollowUp && new Date(item.nextFollowUp) < new Date(new Date().toDateString()) && !["WON", "LOST"].includes(item.status));
  const activeQuotes = quotes.filter((item: Row) => ["DRAFT", "SENT", "VIEWED"].includes(item.status));
  const clientRows = useMemo(() => clients.filter((item: Row) => [item.name, item.phone, item.email, item.city].some((value) => String(value || "").toLowerCase().includes(search.toLowerCase()))), [clients, search]);

  function useClient(clientId: string) {
    const selected = clients.find((item: Row) => item.id === clientId);
    setOpportunity((current) => ({ ...current, clientId, clientName: selected?.name || "", phone: selected?.phone || "", email: selected?.email || "", city: selected?.city || "" }));
    setQuote((current) => ({ ...current, clientId }));
  }

  function useOpportunity(opportunityId: string) {
    const selected = opportunities.find((item: Row) => item.id === opportunityId);
    const interest = String(selected?.productInterest || selected?.title || "");
    const product = products.find((item: Row) => interest && (item.name.toLowerCase().includes(interest.toLowerCase()) || interest.toLowerCase().includes(item.name.toLowerCase())));
    setQuote((current) => ({ ...current, opportunityId, clientId: selected?.clientId || current.clientId, mode: "custom", productId: product?.id || "", catalogItemId: "", catalogVariantId: "", description: product?.name || interest || current.description }));
  }

  function useCatalogItem(catalogItemId: string) {
    const item = catalogItems.find((row: Row) => row.id === catalogItemId);
    const variant = item?.variants?.[0];
    setQuote((current) => ({ ...current, mode: "catalog", catalogItemId, catalogVariantId: variant?.id || "", productId: variant?.productId || "", description: variant ? `${item.name} - ${variant.label}` : item?.name || "", quantity: String(variant?.quantity || 1), width: variant?.widthMm ? String(variant.widthMm) : "", height: variant?.heightMm ? String(variant.heightMm) : "", negotiatedPrice: "" }));
  }

  function useCatalogVariant(catalogVariantId: string) {
    const item = catalogItems.find((row: Row) => row.id === quote.catalogItemId);
    const variant = item?.variants?.find((row: Row) => row.id === catalogVariantId);
    setQuote((current) => ({ ...current, catalogVariantId, productId: variant?.productId || "", description: variant ? `${item.name} - ${variant.label}` : current.description, quantity: String(variant?.quantity || 1), width: variant?.widthMm ? String(variant.widthMm) : "", height: variant?.heightMm ? String(variant.heightMm) : "", negotiatedPrice: "" }));
  }

  function useProduct(productId: string) {
    const selected = products.find((item: Row) => item.id === productId);
    setQuote((current) => ({ ...current, mode: "custom", productId, catalogItemId: "", catalogVariantId: "", description: selected?.name || current.description, negotiatedPrice: "" }));
  }

  async function submitOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const response = await fetch("/api/gestao-grafica/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(opportunity) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(body.error || "Nao foi possivel criar a oportunidade.");
    setQuote((current) => ({ ...current, clientId: body.client.id, opportunityId: body.item.id, description: body.item.productInterest || body.item.title }));
    setDialog("quote"); setMessage("Oportunidade criada. Agora escolha o produto e gere o orcamento."); await load();
  }

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const response = await fetch("/api/gestao-grafica/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...quote, items: [quote, ...additionalItems] }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) return setPreviewError(body.error || "Nao foi possivel criar o orcamento.");
    const client = clients.find((item: Row) => item.id === quote.clientId);
    setCreatedQuote({ ...body.item, client }); setAdditionalItems([]); setDialog(null); setMessage(`Orcamento #${body.item.number} criado. Agora envie o link ao cliente.`); await load();
  }

  async function sendQuote(item: Row, nextFollowUp: string) {
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/quotes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action: "send", nextAction: "Retornar orcamento enviado", nextFollowUp }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(body.error || "Nao foi possivel liberar o orcamento.");
    setPendingQuoteAction(null); setCreatedQuote((current) => current?.id === item.id ? { ...current, status: "SENT" } : current); setMessage("Orcamento liberado para o cliente e retorno agendado."); await load();
  }

  async function approveQuote(item: Row) {
    setSaving(true); const response = await fetch("/api/gestao-grafica/quotes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) }); const body = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(body.error || "Nao foi possivel aprovar o orcamento.");
    setPendingQuoteAction(null); setMessage(`Pedido #${body.order.number} criado e enviado para producao.`); await load();
  }

  async function duplicateQuote(item: Row) {
    setSaving(true); const response = await fetch("/api/gestao-grafica/quotes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action: "duplicate" }) }); const body = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(body.error || "Nao foi possivel criar a nova versao.");
    setPendingQuoteAction(null); setMessage(`Nova versao #${body.item.number} criada como rascunho.`); await load();
  }

  async function confirmQuoteAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!pendingQuoteAction) return;
    if (pendingQuoteAction.type === "send") await sendQuote(pendingQuoteAction.item, sendFollowUp);
    if (pendingQuoteAction.type === "approve") await approveQuote(pendingQuoteAction.item);
    if (pendingQuoteAction.type === "duplicate") await duplicateQuote(pendingQuoteAction.item);
  }

  function whatsapp(item: Row) {
    const phone = String(item.phone || "").replace(/\D/g, "");
    if (!phone) return setMessage("Este cliente nao possui telefone cadastrado.");
    window.open(`https://wa.me/55${phone.replace(/^55/, "")}`, "_blank", "noopener,noreferrer");
  }

  async function copyQuoteLink(item: Row) {
    if (!item.shareToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/public/orcamento/${item.shareToken}`);
    setCopiedQuoteId(item.id); window.setTimeout(() => setCopiedQuoteId(""), 1600);
  }

  function openQuoteWhatsApp(item: Row) {
    const phone = String(item.client?.phone || "").replace(/\D/g, "").replace(/^55/, "");
    if (!phone) return setMessage("Este cliente nao possui WhatsApp cadastrado.");
    const url = `${window.location.origin}/public/orcamento/${item.shareToken}`;
    const text = `Ola! Segue o orcamento #${item.number} para visualizar, baixar em PDF e aprovar: ${url}`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  const tabs: Array<[Tab, string, number]> = [["today", "Hoje", overdue.length + dueToday.length], ["pipeline", "Pipeline", opportunities.length], ["clients", "Clientes", clients.length], ["history", "Orcamentos e pedidos", quotes.length + orders.length]];
  const ready = Boolean(quote.catalogVariantId || quote.productId || quote.negotiatedPrice);
  const selectedCatalog = catalogItems.find((item: Row) => item.id === quote.catalogItemId);
  const selectedVariant = itemVariant(catalogItems, quote);

  return <div className="mx-auto max-w-screen-2xl space-y-5">
    <header className="surface-panel flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">{scope === "mine" ? "Minhas vendas" : "Comercial / CRM"}</p><h1 className="text-2xl font-black text-slate-950">{scope === "mine" ? "Meus clientes e oportunidades" : "Atendimento, proposta e jornada do cliente"}</h1><p className="mt-1 text-sm font-semibold text-slate-500">Cadastre, orce, envie o link e acompanhe o pedido sem trocar de sistema.</p></div><div className="flex flex-wrap gap-2">{onBackToLeads ? <button className="secondary-action px-3 py-2" type="button" onClick={onBackToLeads}>CRM de leads</button> : null}<button className="secondary-action inline-flex items-center gap-2 px-3 py-2" type="button" onClick={() => setCatalogOpen(true)}><BookOpen size={16} />Enviar catalogo</button><button className="secondary-action inline-flex items-center gap-2 px-3 py-2" type="button" onClick={() => setDialog("opportunity")}><Plus size={16} />Novo atendimento</button><button className="primary-action inline-flex items-center gap-2 px-3 py-2" type="button" onClick={() => setDialog("quote")}><FileText size={16} />Criar orcamento</button></div></header>
    <nav className="surface-panel flex gap-2 overflow-x-auto p-2">{tabs.map(([key, label, count]) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-black ${tab === key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}<span className={tab === key ? "rounded-full bg-white/15 px-2 py-0.5 text-xs" : "rounded-full bg-slate-100 px-2 py-0.5 text-xs"}>{count}</span></button>)}</nav>
    {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div> : null}
    {loading ? <div className="surface-panel flex items-center gap-2 p-5 text-sm font-bold text-slate-600"><Loader2 className="animate-spin" size={18} />Carregando CRM...</div> : null}

    {tab === "today" ? <><section className="grid grid-cols-2 gap-3 xl:grid-cols-6"><MetricCard label="Retornos atrasados" value={String(overdue.length)} hint="prioridade do dia" tone={overdue.length ? "danger" : "good"} /><MetricCard label="Retornos hoje" value={String(dueToday.length)} hint="contatos agendados" tone={dueToday.length ? "warn" : "good"} /><MetricCard label="Oportunidades" value={String(metrics.opportunitiesOpen || 0)} hint="em andamento" /><MetricCard label="Propostas aguardando" value={String(activeQuotes.filter((item: Row) => ["SENT", "VIEWED"].includes(item.status)).length)} hint="com o cliente" /><MetricCard label="Vendas no periodo" value={brl(metrics.soldCents || 0)} hint="pedidos aprovados" /><MetricCard label="Conversao" value={metrics.conversionPercent === null || metrics.conversionPercent === undefined ? "-" : `${metrics.conversionPercent}%`} hint="quando ha base" /></section><ActionList title="Retornos que precisam de voce" items={[...overdue, ...dueToday]} onWhatsapp={whatsapp} onQuote={(item) => { setQuote((current) => ({ ...current, opportunityId: item.id, clientId: item.clientId, description: item.productInterest || item.title })); setDialog("quote"); }} /></> : null}

    {tab === "pipeline" ? <section className="surface-panel p-4"><div className="mb-4"><h2 className="font-black text-slate-950">Pipeline comercial</h2><p className="text-sm font-semibold text-slate-500">Cada card abre a jornada completa do cliente.</p></div><div className="flex gap-3 overflow-x-auto pb-2">{stages.map((stage: Row) => <div key={stage.id || stage.name} className="w-72 shrink-0 rounded-lg bg-slate-50 p-3"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black text-slate-800">{stage.name}</h3><span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-600">{opportunities.filter((item: Row) => item.status === stage.name).length}</span></div><div className="space-y-2">{opportunities.filter((item: Row) => item.status === stage.name).map((item: Row) => <a key={item.id} href={`/gestao-grafica/clientes/${item.clientId}`} className="block rounded-lg border border-slate-200 bg-white p-3 hover:border-emerald-300"><p className="font-black text-slate-950">{item.title}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.productInterest || "Necessidade a definir"}</p><p className="mt-2 text-xs font-black text-emerald-700">Retorno: {shortDate(item.nextFollowUp)}</p></a>)}{!opportunities.some((item: Row) => item.status === stage.name) ? <p className="rounded-md bg-white p-3 text-xs font-bold text-slate-500">Sem oportunidades.</p> : null}</div></div>)}</div></section> : null}

    {tab === "clients" ? <section className="surface-panel p-4"><div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="font-black text-slate-950">Clientes</h2><p className="text-sm font-semibold text-slate-500">Abra a jornada para criar proposta e acompanhar pedidos.</p></div><label className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={16} /><input className={`${inputClass} w-full pl-9 md:w-80`} placeholder="Nome, telefone, e-mail ou cidade" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Cliente</th><th className="p-3">Contato</th><th className="p-3">Cidade</th><th className="p-3">Jornada</th></tr></thead><tbody className="divide-y">{clientRows.map((item: Row) => <tr key={item.id}><td className="p-3 font-black text-slate-950">{item.name}</td><td className="p-3">{item.phone || item.email || "-"}</td><td className="p-3">{item.city || "-"}</td><td className="p-3"><a className="secondary-action inline-flex py-2 text-xs" href={`/gestao-grafica/clientes/${item.id}`}>Abrir jornada</a></td></tr>)}</tbody></table>{!clientRows.length ? <p className="p-4 text-sm font-bold text-slate-500">Nenhum cliente encontrado.</p> : null}</div></section> : null}

    {tab === "history" ? <section className="grid gap-4 xl:grid-cols-2"><section className="surface-panel p-4"><h2 className="mb-3 font-black text-slate-950">Orcamentos</h2><div className="space-y-2">{quotes.map((item: Row) => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-black text-slate-950">Orcamento #{item.number} <span className="text-slate-400">V{item.version || 1}</span></p><p className="text-xs font-semibold text-slate-500">{item.client?.name || "Cliente"} | {brl(item.totalPriceCents)}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{quoteStatus(item.status)}</span></div><div className="mt-3 flex flex-wrap gap-2">{item.shareToken ? <button className="primary-action inline-flex items-center gap-2 py-2 text-xs" type="button" onClick={() => void copyQuoteLink(item)}>{copiedQuoteId === item.id ? <Check size={14} /> : <Copy size={14} />}Copiar link</button> : null}{item.shareToken ? <a className="secondary-action inline-flex items-center gap-2 py-2 text-xs" href={`/public/orcamento/${item.shareToken}`} target="_blank" rel="noreferrer"><ExternalLink size={14} />Abrir</a> : null}{item.shareToken ? <a className="secondary-action inline-flex items-center gap-2 py-2 text-xs" href={`/api/gestao-grafica/public-quotes/${item.shareToken}/pdf`} target="_blank" rel="noreferrer"><FileDown size={14} />PDF</a> : null}{item.shareToken && item.client?.phone ? <button className="secondary-action inline-flex items-center gap-2 py-2 text-xs" type="button" onClick={() => openQuoteWhatsApp(item)}><MessageCircle size={14} />WhatsApp</button> : null}{["DRAFT", "SENT", "REFUSED"].includes(item.status) ? <button className="secondary-action py-2 text-xs" type="button" disabled={saving} onClick={() => setPendingQuoteAction({ type: "duplicate", item })}>Nova versao</button> : null}{item.status === "DRAFT" ? <button className="secondary-action py-2 text-xs" type="button" disabled={saving} onClick={() => { setSendFollowUp(todayPlus(1)); setPendingQuoteAction({ type: "send", item }); }}>Liberar e agendar retorno</button> : null}{["SENT", "VIEWED"].includes(item.status) ? <button className="primary-action inline-flex items-center gap-2 py-2 text-xs" type="button" disabled={saving} onClick={() => setPendingQuoteAction({ type: "approve", item })}><CheckCircle2 size={14} />Cliente aprovou</button> : null}</div></article>)}{!quotes.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum orcamento criado.</p> : null}</div></section><section className="surface-panel p-4"><h2 className="mb-3 font-black text-slate-950">Pedidos aprovados</h2><div className="space-y-2">{orders.map((item: Row) => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><p className="font-black text-slate-950">Pedido #{item.number}</p><p className="text-xs font-semibold text-slate-500">{item.clientName || "Cliente"} | {brl(item.soldValueCents)}</p><p className="mt-2 text-xs font-black text-emerald-700">Aprovado e integrado a producao</p></article>)}{!orders.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum pedido aprovado.</p> : null}</div></section></section> : null}

    {dialog === "opportunity" ? <Dialog title="Novo atendimento" onClose={() => setDialog(null)}><form className="grid gap-3" onSubmit={submitOpportunity}><label className="grid gap-1 text-xs font-black text-slate-600"><span>Cliente existente</span><select className={inputClass} value={opportunity.clientId} onChange={(event) => useClient(event.target.value)}><option value="">Novo cliente</option>{clients.map((item: Row) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} required placeholder="Nome do cliente" value={opportunity.clientName} onChange={(event) => setOpportunity({ ...opportunity, clientName: event.target.value })} /><input className={inputClass} placeholder="Telefone / WhatsApp" value={opportunity.phone} onChange={(event) => setOpportunity({ ...opportunity, phone: event.target.value })} /><input className={inputClass} type="email" placeholder="E-mail" value={opportunity.email} onChange={(event) => setOpportunity({ ...opportunity, email: event.target.value })} /><input className={inputClass} placeholder="Cidade" value={opportunity.city} onChange={(event) => setOpportunity({ ...opportunity, city: event.target.value })} /></div><input className={inputClass} required placeholder="O que o cliente precisa?" value={opportunity.title} onChange={(event) => setOpportunity({ ...opportunity, title: event.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} placeholder="Produto ou interesse" value={opportunity.productInterest} onChange={(event) => setOpportunity({ ...opportunity, productInterest: event.target.value })} /><input className={inputClass} inputMode="decimal" placeholder="Valor estimado R$" value={opportunity.estimatedValue} onChange={(event) => setOpportunity({ ...opportunity, estimatedValue: event.target.value })} /><input className={inputClass} placeholder="Proximo passo" value={opportunity.nextAction} onChange={(event) => setOpportunity({ ...opportunity, nextAction: event.target.value })} /><input className={inputClass} type="date" value={opportunity.nextFollowUp} onChange={(event) => setOpportunity({ ...opportunity, nextFollowUp: event.target.value })} /></div><button className="primary-action py-2" disabled={saving}>Criar oportunidade e orcar</button></form></Dialog> : null}

    {dialog === "quote" ? <Dialog title="Criar orcamento" onClose={() => setDialog(null)} wide><form className="grid gap-4" onSubmit={submitQuote}><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-black text-slate-600"><span>Cliente</span><select className={inputClass} required value={quote.clientId} onChange={(event) => setQuote({ ...quote, clientId: event.target.value })}><option value="">Selecione cliente</option>{clients.map((item: Row) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-xs font-black text-slate-600"><span>Oportunidade</span><select className={inputClass} value={quote.opportunityId} onChange={(event) => useOpportunity(event.target.value)}><option value="">Orcamento direto</option>{opportunities.map((item: Row) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div><div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1"><button className={`rounded-md px-3 py-2 text-sm font-black ${quote.mode === "catalog" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`} type="button" onClick={() => setQuote({ ...quote, mode: "catalog", productId: "", description: "", width: "", height: "", quantity: "1" })}><BookOpen className="mr-2 inline" size={16} />Produto ou kit pronto</button><button className={`rounded-md px-3 py-2 text-sm font-black ${quote.mode === "custom" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`} type="button" onClick={() => setQuote({ ...quote, mode: "custom", catalogItemId: "", catalogVariantId: "", description: "", width: "", height: "", quantity: "1" })}><FileText className="mr-2 inline" size={16} />Sob medida</button></div>{quote.mode === "catalog" ? <section className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-black text-slate-600"><span>Produto do catalogo</span><select className={inputClass} value={quote.catalogItemId} onChange={(event) => useCatalogItem(event.target.value)}><option value="">Selecione o produto</option>{catalogItems.map((item: Row) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-xs font-black text-slate-600"><span>Medida, material e kit</span><select className={inputClass} disabled={!selectedCatalog} value={quote.catalogVariantId} onChange={(event) => useCatalogVariant(event.target.value)}><option value="">Selecione a opcao</option>{selectedCatalog?.variants?.map((variant: Row) => <option key={variant.id} value={variant.id}>{variant.label} - {brl(variant.priceCents)}</option>)}</select></label></div>{selectedVariant ? <div className="grid gap-3 rounded-lg bg-white p-3 sm:grid-cols-3"><div><p className="text-xs font-black uppercase text-slate-500">Quantidade</p><p className="mt-1 font-black">{selectedVariant.quantity} unidades</p></div><div><p className="text-xs font-black uppercase text-slate-500">Medidas</p><p className="mt-1 font-black">{selectedVariant.widthMm && selectedVariant.heightMm ? `${selectedVariant.widthMm} x ${selectedVariant.heightMm} mm` : "Sem medida fixa"}</p></div><div><p className="text-xs font-black uppercase text-slate-500">Preco do kit</p><p className="mt-1 font-black text-emerald-700">{brl(selectedVariant.priceCents)}</p></div></div> : null}</section> : <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><label className="grid gap-1 text-xs font-black text-slate-600"><span>Produto tecnico da planilha</span><select className={inputClass} value={quote.productId} onChange={(event) => useProduct(event.target.value)}><option value="">Selecione o produto</option>{products.map((item: Row) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs font-black text-slate-600"><span>Quantidade</span><input className={inputClass} inputMode="decimal" value={quote.quantity} onChange={(event) => setQuote({ ...quote, quantity: event.target.value })} /></label><label className="grid gap-1 text-xs font-black text-slate-600"><span>Comprimento (mm)</span><input className={inputClass} inputMode="decimal" value={quote.width} onChange={(event) => setQuote({ ...quote, width: event.target.value })} /></label><label className="grid gap-1 text-xs font-black text-slate-600"><span>Largura (mm)</span><input className={inputClass} inputMode="decimal" value={quote.height} onChange={(event) => setQuote({ ...quote, height: event.target.value })} /></label></div><p className="text-xs font-bold text-slate-600">Padrao unico: todas as medidas sao digitadas em milimetros. Exemplo: 1 metro = 1000 mm.</p></section>}<label className="grid gap-1 text-xs font-black text-slate-600"><span>Descricao que aparecera para o cliente</span><input className={inputClass} required value={quote.description} onChange={(event) => setQuote({ ...quote, description: event.target.value })} placeholder="Descricao do item" /></label><div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs font-black text-slate-600"><span>Prazo</span><select className={inputClass} value={quote.priority} onChange={(event) => setQuote({ ...quote, priority: event.target.value })}><option value="NORMAL">Normal</option><option value="URGENTE">Urgente (+15%)</option></select></label><label className="grid gap-1 text-xs font-black text-slate-600"><span>Entrega em dias</span><input className={inputClass} inputMode="numeric" value={quote.deadlineDays} onChange={(event) => setQuote({ ...quote, deadlineDays: event.target.value })} /></label><label className="grid gap-1 text-xs font-black text-slate-600"><span>Frete adicional R$</span><input className={inputClass} inputMode="decimal" value={quote.freight} onChange={(event) => setQuote({ ...quote, freight: event.target.value })} /></label></div>{previewError ? <p className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{previewError}</p> : null}{quotePreview ? <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase text-emerald-700">{quotePreview.items?.[0]?.pricingSource === "CATALOG" ? "Preco exato da opcao do catalogo" : "Preco calculado pela planilha"}</p><p className="mt-1 text-3xl font-black text-emerald-950">{brl(quotePreview.totals?.totalPriceCents || 0)}</p><p className="text-xs font-semibold text-emerald-800">{quotePreview.items?.[0]?.totalArea ? `Area total: ${quotePreview.items[0].totalArea.toFixed(2)} m2 | ` : ""}Medidas em mm</p></div><p className="max-w-sm text-xs font-semibold text-emerald-800">O valor usa os custos, perdas, seguranca, acabamento, horas e faixas de quantidade da base cadastrada.</p></div><div className="mt-3 divide-y border-t border-emerald-200">{quotePreview.items?.map((item: Row, index: number) => <div className="flex justify-between gap-3 py-2 text-xs font-bold text-emerald-950" key={`${item.description}-${index}`}><span>{item.description} x {item.quantity}</span><span>{brl(item.negotiatedPriceCents)}</span></div>)}</div></section> : null}<QuoteItemsEditor items={additionalItems} products={products} catalogItems={catalogItems} onChange={setAdditionalItems} /><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-black text-slate-600"><span>Preco negociado R$ (opcional)</span><input className={inputClass} inputMode="decimal" value={quote.negotiatedPrice} onChange={(event) => setQuote({ ...quote, negotiatedPrice: event.target.value })} /></label><label className="grid gap-1 text-xs font-black text-slate-600"><span>Validade</span><input className={inputClass} type="date" value={quote.validUntil} onChange={(event) => setQuote({ ...quote, validUntil: event.target.value })} /></label></div><input className={inputClass} placeholder="Condicao de pagamento" value={quote.paymentTerms} onChange={(event) => setQuote({ ...quote, paymentTerms: event.target.value })} /><textarea className={`${inputClass} min-h-20`} placeholder="Observacoes" value={quote.notes} onChange={(event) => setQuote({ ...quote, notes: event.target.value })} /><button className="primary-action inline-flex items-center justify-center gap-2 py-3 disabled:opacity-50" disabled={saving || !ready || !quotePreview}>{saving ? <Loader2 className="animate-spin" size={17} /> : <FileText size={17} />}Gerar orcamento e preparar link</button></form></Dialog> : null}

    {pendingQuoteAction ? <Dialog title={pendingQuoteAction.type === "send" ? "Liberar orcamento" : pendingQuoteAction.type === "approve" ? "Confirmar aprovacao" : "Criar nova versao"} onClose={() => setPendingQuoteAction(null)}><form className="grid gap-4" onSubmit={confirmQuoteAction}><div className="rounded-lg bg-slate-50 p-4"><p className="font-black text-slate-950">Orcamento #{pendingQuoteAction.item.number}</p><p className="mt-1 text-sm font-semibold text-slate-600">{pendingQuoteAction.item.client?.name || "Cliente"} | {brl(pendingQuoteAction.item.totalPriceCents)}</p></div>{pendingQuoteAction.type === "send" ? <label className="grid gap-1 text-xs font-black text-slate-600"><span>Data do proximo retorno</span><input className={inputClass} type="date" required value={sendFollowUp} onChange={(event) => setSendFollowUp(event.target.value)} /></label> : null}<p className="text-sm font-semibold text-slate-600">{pendingQuoteAction.type === "send" ? "O cliente podera abrir, baixar o PDF e aprovar pelo link." : pendingQuoteAction.type === "approve" ? "A aprovacao cria o pedido, os recebiveis e a ordem com as etapas de producao." : "Uma copia editavel sera criada como novo rascunho."}</p><div className="flex justify-end gap-2"><button className="secondary-action px-4 py-2" type="button" disabled={saving} onClick={() => setPendingQuoteAction(null)}>Cancelar</button><button className="primary-action px-4 py-2" disabled={saving}>{saving ? "Processando..." : pendingQuoteAction.type === "send" ? "Liberar para o cliente" : pendingQuoteAction.type === "approve" ? "Confirmar aprovacao" : "Criar versao"}</button></div></form></Dialog> : null}

    {createdQuote ? <QuoteShareDialog item={createdQuote} saving={saving} followUp={sendFollowUp} setFollowUp={setSendFollowUp} onSend={() => void sendQuote(createdQuote, sendFollowUp)} onClose={() => setCreatedQuote(null)} onCopy={() => void copyQuoteLink(createdQuote)} copied={copiedQuoteId === createdQuote.id} onWhatsApp={() => openQuoteWhatsApp(createdQuote)} /> : null}
    <GraphicCatalogShareDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} contacts={clients} />
  </div>;
}

function ActionList({ title, items, onWhatsapp, onQuote }: { title: string; items: Row[]; onWhatsapp: (item: Row) => void; onQuote: (item: Row) => void }) {
  return <section className="surface-panel p-4"><h2 className="mb-3 font-black text-slate-950">{title}</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.length ? items.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><p className="font-black text-slate-950">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.productInterest || "Necessidade a definir"}</p><p className="mt-2 text-xs font-black text-amber-700">Retorno: {shortDate(item.nextFollowUp)}</p><div className="mt-3 flex gap-2"><button className="secondary-action grid h-9 w-9 place-items-center p-0" type="button" title="WhatsApp" onClick={() => onWhatsapp(item)}><MessageCircle size={16} /></button><button className="secondary-action py-2 text-xs" type="button" onClick={() => onQuote(item)}>Criar orcamento</button><a className="secondary-action py-2 text-xs" href={`/gestao-grafica/clientes/${item.clientId}`}>Jornada</a></div></article>) : <p className="rounded-lg bg-emerald-50 p-4 text-sm font-bold text-emerald-700">Nenhum retorno pendente hoje.</p>}</div></section>;
}

function QuoteItemsEditor({ items, products, catalogItems, onChange }: { items: Row[]; products: Row[]; catalogItems: Row[]; onChange: (items: Row[]) => void }) {
  const update = (index: number, patch: Row) => onChange(items.map((item, current) => current === index ? { ...item, ...patch } : item));
  function selectCatalog(index: number, catalogItemId: string) { const catalog = catalogItems.find((row) => row.id === catalogItemId); const variant = catalog?.variants?.[0]; update(index, { mode: "catalog", catalogItemId, catalogVariantId: variant?.id || "", productId: variant?.productId || "", description: variant ? `${catalog.name} - ${variant.label}` : catalog?.name || "", quantity: String(variant?.quantity || 1), width: variant?.widthMm ? String(variant.widthMm) : "", height: variant?.heightMm ? String(variant.heightMm) : "" }); }
  function selectVariant(index: number, item: Row, catalogVariantId: string) { const catalog = catalogItems.find((row) => row.id === item.catalogItemId); const variant = catalog?.variants?.find((row: Row) => row.id === catalogVariantId); update(index, { catalogVariantId, productId: variant?.productId || "", description: variant ? `${catalog?.name || "Produto"} - ${variant.label}` : item.description, quantity: String(variant?.quantity || 1), width: variant?.widthMm ? String(variant.widthMm) : "", height: variant?.heightMm ? String(variant.heightMm) : "" }); }
  return <section className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-black text-slate-950">Itens adicionais</h3><p className="text-xs font-semibold text-slate-500">Misture kits prontos e itens sob medida no mesmo orcamento.</p></div><button className="secondary-action px-3 py-2 text-xs" type="button" onClick={() => onChange([...items, blankQuoteItem("catalog")])}>Adicionar item</button></div><div className="space-y-3">{items.map((item, index) => { const catalog = catalogItems.find((row) => row.id === item.catalogItemId); return <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1"><button className={`rounded-md px-3 py-1.5 text-xs font-black ${item.mode === "catalog" ? "bg-white shadow-sm" : "text-slate-500"}`} type="button" onClick={() => update(index, { ...blankQuoteItem("catalog") })}>Catalogo</button><button className={`rounded-md px-3 py-1.5 text-xs font-black ${item.mode === "custom" ? "bg-white shadow-sm" : "text-slate-500"}`} type="button" onClick={() => update(index, { ...blankQuoteItem("custom") })}>Sob medida</button></div><button className="secondary-action px-3 py-2 text-xs text-rose-700" type="button" onClick={() => onChange(items.filter((_, current) => current !== index))}>Remover</button></div>{item.mode === "catalog" ? <div className="grid gap-2 sm:grid-cols-2"><select className={inputClass} required value={item.catalogItemId} onChange={(event) => selectCatalog(index, event.target.value)}><option value="">Produto do catalogo</option>{catalogItems.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select className={inputClass} required value={item.catalogVariantId} onChange={(event) => selectVariant(index, item, event.target.value)}><option value="">Medida e kit</option>{catalog?.variants?.map((row: Row) => <option key={row.id} value={row.id}>{row.label} - {brl(row.priceCents)}</option>)}</select></div> : <div className="grid gap-2 sm:grid-cols-5"><select className={`${inputClass} sm:col-span-2`} required value={item.productId} onChange={(event) => { const product = products.find((row) => row.id === event.target.value); update(index, { productId: event.target.value, description: product?.name || item.description, negotiatedPrice: "" }); }}><option value="">Produto da planilha</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input className={inputClass} inputMode="decimal" placeholder="Qtd." value={item.quantity} onChange={(event) => update(index, { quantity: event.target.value })} /><input className={inputClass} inputMode="decimal" placeholder="Comprimento mm" value={item.width} onChange={(event) => update(index, { width: event.target.value })} /><input className={inputClass} inputMode="decimal" placeholder="Largura mm" value={item.height} onChange={(event) => update(index, { height: event.target.value })} /></div>}<div className="grid gap-2 sm:grid-cols-[1fr_160px]"><input className={inputClass} required placeholder="Descricao para o cliente" value={item.description} onChange={(event) => update(index, { description: event.target.value })} /><input className={inputClass} inputMode="numeric" placeholder="Prazo em dias" value={item.deadlineDays} onChange={(event) => update(index, { deadlineDays: event.target.value })} /></div></div>; })}</div></section>;
}

function QuoteShareDialog({ item, saving, followUp, setFollowUp, onSend, onClose, onCopy, copied, onWhatsApp }: { item: Row; saving: boolean; followUp: string; setFollowUp: (value: string) => void; onSend: () => void; onClose: () => void; onCopy: () => void; copied: boolean; onWhatsApp: () => void }) {
  const released = ["SENT", "VIEWED", "APPROVED"].includes(item.status);
  return <Dialog title={`Orcamento #${item.number} pronto`} onClose={onClose}><div className="grid gap-4"><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-black uppercase text-emerald-700">Total para o cliente</p><p className="mt-1 text-3xl font-black text-emerald-950">{brl(item.totalPriceCents)}</p><p className="mt-1 text-sm font-semibold text-emerald-800">{released ? "Link liberado para visualizar, baixar e aprovar." : "Defina o retorno e libere o orcamento para aprovacao."}</p></div>{!released ? <label className="grid gap-1 text-xs font-black text-slate-600"><span>Proximo retorno comercial</span><input className={inputClass} type="date" value={followUp} onChange={(event) => setFollowUp(event.target.value)} /></label> : null}<div className="grid gap-2 sm:grid-cols-2">{!released ? <button className="primary-action inline-flex items-center justify-center gap-2 px-4 py-3 sm:col-span-2" type="button" disabled={saving} onClick={onSend}>{saving ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}Liberar link e agendar retorno</button> : null}<button className="secondary-action inline-flex items-center justify-center gap-2 px-4 py-3" type="button" onClick={onCopy}>{copied ? <Check size={17} /> : <Copy size={17} />}Copiar link</button><a className="secondary-action inline-flex items-center justify-center gap-2 px-4 py-3" href={`/api/gestao-grafica/public-quotes/${item.shareToken}/pdf`} target="_blank" rel="noreferrer"><FileDown size={17} />Abrir PDF</a><button className="primary-action inline-flex items-center justify-center gap-2 px-4 py-3 sm:col-span-2" type="button" disabled={!released} onClick={onWhatsApp}><MessageCircle size={17} />Enviar link pelo WhatsApp</button></div></div></Dialog>;
}

function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onMouseDown={onClose}><section className={`max-h-[92vh] w-full overflow-y-auto rounded-lg bg-white p-5 shadow-xl ${wide ? "max-w-5xl" : "max-w-3xl"}`} onMouseDown={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">{title}</h2><button className="icon-action" type="button" title="Fechar" onClick={onClose}><X size={18} /></button></div>{children}</section></div>;
}
