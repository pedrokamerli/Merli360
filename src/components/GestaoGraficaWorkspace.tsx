"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, ClipboardList, Factory, FileText, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";

type AnyRow = Record<string, any>;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format((cents || 0) / 100);
const day = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Sem data";

const opportunityInitial = {
  clientName: "",
  phone: "",
  email: "",
  city: "",
  state: "",
  title: "",
  source: "Atendimento",
  productInterest: "Banner",
  estimatedValue: "",
  nextAction: "Enviar orcamento",
  nextFollowUp: ""
};

const quoteInitial = {
  opportunityId: "",
  clientId: "",
  description: "",
  quantity: "1",
  width: "",
  height: "",
  unit: "unidade",
  materialCost: "",
  processCost: "",
  outsourcedCost: "",
  laborCost: "",
  freight: "",
  installation: "",
  extraCost: "",
  wastePercent: "8",
  negotiatedPrice: "",
  discount: "",
  urgency: "",
  deadlineDays: "7",
  validUntil: "",
  paymentTerms: "50% na aprovacao e 50% na entrega",
  notes: ""
};

function todayPlus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const inputClass = "min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export function GestaoGraficaWorkspace() {
  const [data, setData] = useState<AnyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [opportunityForm, setOpportunityForm] = useState(opportunityInitial);
  const [quoteForm, setQuoteForm] = useState({ ...quoteInitial, validUntil: todayPlus(7) });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/gestao-grafica/summary", { cache: "no-store" });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel carregar a Gestao da Grafica.");
      return;
    }
    setData(payload);
  }

  useEffect(() => { void load(); }, []);

  const filteredOpportunities = useMemo(() => {
    const rows = data?.opportunities || [];
    if (!search.trim()) return rows;
    const term = search.toLowerCase();
    return rows.filter((item: AnyRow) => [item.title, item.productInterest, item.source, item.nextAction].join(" ").toLowerCase().includes(term));
  }, [data, search]);

  const metrics = data?.metrics || {};
  const openOpportunities = (data?.opportunities || []).filter((item: AnyRow) => ["OPEN", "QUOTE_CREATED"].includes(item.status));
  const draftQuotes = (data?.quotes || []).filter((item: AnyRow) => item.status !== "APPROVED");
  const productionRows = data?.productionOrders || [];

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opportunityForm)
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel criar a oportunidade.");
      return;
    }
    setOpportunityForm(opportunityInitial);
    setQuoteForm((current) => ({ ...current, opportunityId: payload.item.id, clientId: payload.client.id, description: payload.item.productInterest || payload.item.title }));
    setMessage("Oportunidade criada. Agora voce pode gerar o orcamento sem redigitar o cliente.");
    await load();
  }

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quoteForm)
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel criar o orcamento.");
      return;
    }
    setQuoteForm({ ...quoteInitial, validUntil: todayPlus(7) });
    setMessage(payload.item.approvalRequired ? "Orcamento criado com alerta de aprovacao." : "Orcamento criado e pronto para aprovacao.");
    await load();
  }

  async function approveQuote(id: string) {
    if (!confirm("Aprovar este orcamento e gerar pedido, producao e recebimento?")) return;
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/quotes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel aprovar o orcamento.");
      return;
    }
    setMessage(`Pedido ${payload.order.number} e ordem de producao criados automaticamente.`);
    await load();
  }

  async function updateProduction(id: string, status: string) {
    const note = status === "BLOCKED" ? prompt("Informe o impedimento da producao") || "" : "";
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/production", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, note })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel atualizar a producao.");
      return;
    }
    setMessage("Producao atualizada.");
    await load();
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Modulo nativo</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">Gestao da Grafica</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Contato, oportunidade, orcamento, pedido, producao, entrega e recebimento em um fluxo unico.</p>
        </div>
        <button className="secondary-action inline-flex items-center gap-2 px-4 py-2" onClick={load} type="button">
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div> : null}
      {loading ? <div className="surface-panel flex items-center gap-2 p-5 text-sm font-bold text-slate-600"><Loader2 className="animate-spin" size={18} /> Carregando modulo...</div> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <MetricCard label="Oportunidades abertas" value={String(metrics.opportunitiesOpen || 0)} hint="funil grafico" />
        <MetricCard label="Retornos hoje" value={String(metrics.returnsToday || 0)} hint={`${metrics.overdueReturns || 0} atrasados`} tone={metrics.overdueReturns ? "warn" : "default"} />
        <MetricCard label="Alertas de qualidade" value={String(metrics.qualityAlerts || 0)} hint="sem proximo passo completo" tone={metrics.qualityAlerts ? "danger" : "good"} />
        <MetricCard label="Orcamentos aprovados" value={String(metrics.quotesApproved || 0)} hint={`${metrics.quotesSent || 0} enviados/visualizados`} tone="good" />
        <MetricCard label="Producao aberta" value={String(metrics.productionOpen || 0)} hint="ordens pendentes" />
        <MetricCard label="Recebimento pendente" value={brl(metrics.openReceivablesCents || 0)} hint={metrics.dataQuality || "valor aberto"} tone={metrics.overdueReceivablesCents ? "danger" : "warn"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[.95fr_1.05fr]">
        <form className="surface-panel p-4" onSubmit={createOpportunity}>
          <div className="mb-4 flex items-center gap-2">
            <Plus size={18} className="text-emerald-600" />
            <h2 className="text-lg font-black text-slate-950">Cadastro rapido</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={inputClass} placeholder="Cliente" value={opportunityForm.clientName} onChange={(event) => setOpportunityForm({ ...opportunityForm, clientName: event.target.value })} />
            <input className={inputClass} placeholder="Telefone/WhatsApp" value={opportunityForm.phone} onChange={(event) => setOpportunityForm({ ...opportunityForm, phone: event.target.value })} />
            <input className={inputClass} placeholder="Email" value={opportunityForm.email} onChange={(event) => setOpportunityForm({ ...opportunityForm, email: event.target.value })} />
            <input className={inputClass} placeholder="Cidade" value={opportunityForm.city} onChange={(event) => setOpportunityForm({ ...opportunityForm, city: event.target.value })} />
            <input className={inputClass} placeholder="Oportunidade" value={opportunityForm.title} onChange={(event) => setOpportunityForm({ ...opportunityForm, title: event.target.value })} />
            <select className={inputClass} value={opportunityForm.productInterest} onChange={(event) => setOpportunityForm({ ...opportunityForm, productInterest: event.target.value })}>
              {["Banner", "Adesivo", "Placa ACM", "Chaveiro imobiliario", "Impresso comercial", "Comunicacao visual"].map((item) => <option key={item}>{item}</option>)}
            </select>
            <input className={inputClass} placeholder="Valor estimado" value={opportunityForm.estimatedValue} onChange={(event) => setOpportunityForm({ ...opportunityForm, estimatedValue: event.target.value })} />
            <input className={inputClass} type="date" value={opportunityForm.nextFollowUp} onChange={(event) => setOpportunityForm({ ...opportunityForm, nextFollowUp: event.target.value })} />
            <input className={`${inputClass} sm:col-span-2`} placeholder="Proximo passo" value={opportunityForm.nextAction} onChange={(event) => setOpportunityForm({ ...opportunityForm, nextAction: event.target.value })} />
          </div>
          <button className="primary-action mt-4 inline-flex w-full items-center justify-center gap-2 py-3" disabled={saving}>
            <Plus size={16} /> Criar oportunidade
          </button>
        </form>

        <form className="surface-panel p-4" onSubmit={createQuote}>
          <div className="mb-4 flex items-center gap-2">
            <FileText size={18} className="text-violet-600" />
            <h2 className="text-lg font-black text-slate-950">Orcamento com custo</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select className={`${inputClass} sm:col-span-2`} value={quoteForm.opportunityId} onChange={(event) => {
              const selected = openOpportunities.find((item: AnyRow) => item.id === event.target.value);
              setQuoteForm({ ...quoteForm, opportunityId: event.target.value, clientId: selected?.clientId || "", description: selected?.productInterest || selected?.title || quoteForm.description });
            }}>
              <option value="">Selecione oportunidade</option>
              {openOpportunities.map((item: AnyRow) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <input className={inputClass} type="date" value={quoteForm.validUntil} onChange={(event) => setQuoteForm({ ...quoteForm, validUntil: event.target.value })} />
            <input className={`${inputClass} sm:col-span-3`} placeholder="Descricao do item" value={quoteForm.description} onChange={(event) => setQuoteForm({ ...quoteForm, description: event.target.value })} />
            <input className={inputClass} placeholder="Qtd" value={quoteForm.quantity} onChange={(event) => setQuoteForm({ ...quoteForm, quantity: event.target.value })} />
            <input className={inputClass} placeholder="Largura" value={quoteForm.width} onChange={(event) => setQuoteForm({ ...quoteForm, width: event.target.value })} />
            <input className={inputClass} placeholder="Altura" value={quoteForm.height} onChange={(event) => setQuoteForm({ ...quoteForm, height: event.target.value })} />
            <input className={inputClass} placeholder="Material R$" value={quoteForm.materialCost} onChange={(event) => setQuoteForm({ ...quoteForm, materialCost: event.target.value })} />
            <input className={inputClass} placeholder="Processo R$" value={quoteForm.processCost} onChange={(event) => setQuoteForm({ ...quoteForm, processCost: event.target.value })} />
            <input className={inputClass} placeholder="Terceiros R$" value={quoteForm.outsourcedCost} onChange={(event) => setQuoteForm({ ...quoteForm, outsourcedCost: event.target.value })} />
            <input className={inputClass} placeholder="Mao de obra R$" value={quoteForm.laborCost} onChange={(event) => setQuoteForm({ ...quoteForm, laborCost: event.target.value })} />
            <input className={inputClass} placeholder="Frete R$" value={quoteForm.freight} onChange={(event) => setQuoteForm({ ...quoteForm, freight: event.target.value })} />
            <input className={inputClass} placeholder="Instalacao R$" value={quoteForm.installation} onChange={(event) => setQuoteForm({ ...quoteForm, installation: event.target.value })} />
            <input className={inputClass} placeholder="Preco negociado R$" value={quoteForm.negotiatedPrice} onChange={(event) => setQuoteForm({ ...quoteForm, negotiatedPrice: event.target.value })} />
            <input className={inputClass} placeholder="Desconto R$" value={quoteForm.discount} onChange={(event) => setQuoteForm({ ...quoteForm, discount: event.target.value })} />
            <input className={inputClass} placeholder="Urgencia R$" value={quoteForm.urgency} onChange={(event) => setQuoteForm({ ...quoteForm, urgency: event.target.value })} />
          </div>
          <button className="primary-action mt-4 inline-flex w-full items-center justify-center gap-2 py-3" disabled={saving}>
            <FileText size={16} /> Gerar orcamento
          </button>
        </form>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="surface-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Search size={17} />
            <input className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" placeholder="Buscar oportunidade" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="space-y-2">
            {filteredOpportunities.length ? filteredOpportunities.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-slate-950">{item.title}</h3>
                    <p className="text-xs font-semibold text-slate-500">{item.productInterest || "Produto a definir"} | {item.source || "Origem nao informada"}</p>
                  </div>
                  {item.qualityAlert ? <AlertTriangle className="text-amber-500" size={18} /> : null}
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.nextAction || "Sem proximo passo"} em {day(item.nextFollowUp)}</p>
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhuma oportunidade encontrada.</p>}
          </div>
        </div>

        <div className="surface-panel p-4">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList size={18} className="text-violet-600" />
            <h2 className="text-lg font-black text-slate-950">Orcamentos</h2>
          </div>
          <div className="space-y-2">
            {draftQuotes.length ? draftQuotes.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-slate-950">#{item.number} - {brl(item.totalPriceCents)}</h3>
                    <p className="text-xs font-semibold text-slate-500">Margem {Number(item.marginPercent || 0).toFixed(1)}% | validade {day(item.validUntil)}</p>
                  </div>
                  {item.approvalRequired ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">Aprovar</span> : null}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">{item.approvalReason || "Dentro dos parametros atuais."}</p>
                <button className="secondary-action mt-3 inline-flex w-full items-center justify-center gap-2 py-2" onClick={() => approveQuote(item.id)} type="button">
                  <CheckCircle2 size={16} /> Aprovar e gerar pedido
                </button>
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Sem orcamentos pendentes.</p>}
          </div>
        </div>

        <div className="surface-panel p-4">
          <div className="mb-4 flex items-center gap-2">
            <Factory size={18} className="text-emerald-600" />
            <h2 className="text-lg font-black text-slate-950">Producao</h2>
          </div>
          <div className="space-y-2">
            {productionRows.length ? productionRows.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="font-black text-slate-950">Pedido #{item.order?.number || "-"}</h3>
                <p className="text-xs font-semibold text-slate-500">Status {item.status} | promessa {day(item.promisedAt)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="secondary-action py-2 text-xs" onClick={() => updateProduction(item.id, "RELEASED")} type="button">Liberar</button>
                  <button className="secondary-action py-2 text-xs" onClick={() => updateProduction(item.id, "IN_PROGRESS")} type="button">Iniciar</button>
                  <button className="secondary-action py-2 text-xs" onClick={() => updateProduction(item.id, "BLOCKED")} type="button">Bloquear</button>
                  <button className="primary-action py-2 text-xs" onClick={() => updateProduction(item.id, "COMPLETED")} type="button">Concluir</button>
                </div>
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhuma ordem de producao.</p>}
          </div>
        </div>
      </section>

      <section className="surface-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <Banknote size={18} className="text-emerald-600" />
          <h2 className="text-lg font-black text-slate-950">Venda, faturamento e recebimento</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Valor vendido" value={brl(metrics.soldCents || 0)} />
          <MetricCard label="Valor faturado" value={brl(metrics.billedCents || 0)} />
          <MetricCard label="Valor recebido" value={brl(metrics.receivedCents || 0)} tone="good" />
        </div>
      </section>
    </div>
  );
}
