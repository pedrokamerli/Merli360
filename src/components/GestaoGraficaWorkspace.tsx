"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, ClipboardList, Factory, FileText, Loader2, PackageCheck, Plus, RefreshCw, Search, Settings, Star, Upload } from "lucide-react";
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
  productId: "",
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
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<AnyRow | null>(null);
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
  const metricNotes = data?.metricNotes || [];
  const openOpportunities = (data?.opportunities || []).filter((item: AnyRow) => ["OPEN", "QUOTE_CREATED"].includes(item.status));
  const draftQuotes = (data?.quotes || []).filter((item: AnyRow) => item.status !== "APPROVED");
  const productionRows = data?.productionOrders || [];
  const deliveryRows = data?.deliveries || [];
  const receivableRows = data?.receivables || [];
  const postSaleRows = data?.postSales || [];
  const products = data?.products || [];
  const materials = data?.materials || [];
  const processes = data?.processes || [];
  const settings = data?.settings || [];
  const settingMap = Object.fromEntries(settings.map((item: AnyRow) => [item.key, item.value]));

  async function saveCatalog(type: string, payload: AnyRow) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload })
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel salvar o cadastro.");
      return false;
    }
    setMessage("Cadastro grafico salvo.");
    await load();
    return true;
  }

  async function importSpreadsheet(confirm = false) {
    if (!importFile) return;
    setSaving(true);
    setMessage("");
    const form = new FormData();
    form.append("file", importFile);
    if (confirm) form.append("confirm", "true");
    const response = await fetch("/api/gestao-grafica/import", { method: "POST", body: form });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel importar a planilha.");
      return;
    }
    if (!confirm) {
      setImportPreview(result);
      setMessage(`Previa carregada: ${result.total || 0} itens encontrados.`);
      return;
    }
    setImportPreview(null);
    setImportFile(null);
    setMessage(`Importacao concluida: ${result.total || 0} itens processados.`);
    await load();
  }

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

  async function quoteAction(id: string, action: string) {
    const reason = ["refuse", "cancel"].includes(action) ? prompt(action === "refuse" ? "Motivo da recusa" : "Motivo do cancelamento") || "" : "";
    if (["refuse", "cancel"].includes(action) && !reason) return;
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/quotes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, reason })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel alterar o orcamento.");
      return;
    }
    setMessage(action === "duplicate" ? `Orcamento duplicado: #${payload.item?.number}.` : "Orcamento atualizado.");
    await load();
  }

  async function updateProduction(id: string, status: string, extra: AnyRow = {}) {
    const note = status === "BLOCKED" ? prompt("Informe o impedimento da producao") || "" : "";
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/production", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, note, ...extra })
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

  async function updateProductionAction(id: string, payload: AnyRow, success = "Producao atualizada.") {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/production", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payload })
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel atualizar a producao.");
      return false;
    }
    setMessage(success);
    await load();
    return true;
  }

  async function uploadGraphicAttachment(file: File, linkedModel: string, linkedId: string, purpose = "PHOTO") {
    setSaving(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    form.append("linkedModel", linkedModel);
    form.append("linkedId", linkedId);
    form.append("purpose", purpose);
    const response = await fetch("/api/gestao-grafica/attachments", { method: "POST", body: form });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel anexar o arquivo.");
      return false;
    }
    setMessage("Arquivo anexado com seguranca.");
    await load();
    return true;
  }

  async function updateDelivery(id: string, status: string) {
    const note = status === "COMPLAINT" ? prompt("Informe a reclamacao ou motivo") || "" : "";
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/deliveries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, note, deliveredAt: new Date().toISOString().slice(0, 10) })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel atualizar a entrega.");
      return;
    }
    setMessage(status === "DELIVERED" || status === "ACCEPTED" ? "Entrega registrada e pos-venda criado." : "Entrega atualizada.");
    await load();
  }

  async function registerPayment(id: string) {
    const amount = prompt("Valor recebido");
    if (!amount) return;
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, amount, method: "Manual", paidAt: new Date().toISOString().slice(0, 10) })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel registrar o recebimento.");
      return;
    }
    setMessage(payload.pendingCents > 0 ? `Recebimento parcial registrado. Pendente: ${brl(payload.pendingCents)}.` : "Recebimento quitado.");
    await load();
  }

  async function closePostSale(id: string) {
    const satisfaction = prompt("Satisfacao de 1 a 5", "5");
    if (!satisfaction) return;
    const note = prompt("Observacao do pos-venda", "Cliente contatado apos entrega.") || "";
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/post-sales", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, satisfaction, note, status: "DONE" })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel fechar o pos-venda.");
      return;
    }
    setMessage("Pos-venda registrado.");
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
        <MetricCard label="Entregas abertas" value={String(metrics.deliveriesOpen || 0)} hint={`${metrics.postSalesOpen || 0} pos-vendas`} />
        <MetricCard label="Recebimento pendente" value={metrics.openReceivablesCents === null ? "Restrito" : brl(metrics.openReceivablesCents || 0)} hint={metrics.dataQuality || "valor aberto"} tone={metrics.overdueReceivablesCents ? "danger" : "warn"} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metricNotes.map((item: AnyRow) => (
          <article key={item.key} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-black text-slate-950">{item.label}</h2>
              <span className={item.quality === "OK" ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700" : item.quality === "RESTRICTED" ? "rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600" : "rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700"}>
                {item.quality === "OK" ? "OK" : item.quality === "RESTRICTED" ? "Restrito" : "Insuficiente"}
              </span>
            </div>
            {item.message ? <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs font-bold text-slate-600">{item.message}</p> : null}
            <dl className="mt-3 space-y-2 text-xs text-slate-600">
              <div><dt className="font-black text-slate-800">Formula</dt><dd className="font-semibold">{item.formula}</dd></div>
              <div><dt className="font-black text-slate-800">Fonte</dt><dd className="font-semibold">{item.source}</dd></div>
              <div><dt className="font-black text-slate-800">Periodo</dt><dd className="font-semibold">{item.period}</dd></div>
              <div><dt className="font-black text-slate-800">Criterio</dt><dd className="font-semibold">{item.criteria}</dd></div>
            </dl>
          </article>
        ))}
      </section>

      <section className="surface-panel p-4">
        <div className="mb-4 flex items-center gap-2">
          <Settings size={18} className="text-emerald-600" />
          <h2 className="text-lg font-black text-slate-950">Produtos, custos e parametros</h2>
        </div>
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-black text-slate-950">Importar base da grafica</h3>
              <p className="text-xs font-semibold text-slate-500">Abas aceitas neste ciclo: PARAMETROS, MATERIAIS, PROCESSOS e PRODUTOS.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="secondary-action inline-flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
                <Upload size={15} /> Excel
                <input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); }} />
              </label>
              <button className="secondary-action px-3 py-2 text-xs" type="button" disabled={!importFile || saving} onClick={() => importSpreadsheet(false)}>Ler previa</button>
              <button className="primary-action px-3 py-2 text-xs" type="button" disabled={!importPreview || saving} onClick={() => importSpreadsheet(true)}>Confirmar</button>
            </div>
          </div>
          {importFile ? <p className="mt-2 text-xs font-bold text-slate-500">{importFile.name}</p> : null}
          {importPreview ? (
            <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr]">
              <div className="rounded-md bg-slate-50 p-3 text-xs font-bold text-slate-600">
                <p>Total: {importPreview.total || 0}</p>
                <p>Produtos: {importPreview.summary?.product || 0}</p>
                <p>Materiais: {importPreview.summary?.material || 0}</p>
                <p>Processos: {importPreview.summary?.process || 0}</p>
                <p>Parametros: {importPreview.summary?.setting || 0}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(importPreview.items || []).slice(0, 8).map((item: AnyRow, index: number) => (
                  <div key={`${item.type}-${item.key}-${index}`} className="rounded-md border border-slate-100 p-2">
                    <p className="text-xs font-black text-slate-700">{item.name || item.key}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-400">{item.type} | {item.sheet}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="grid gap-4 xl:grid-cols-4">
          <CatalogBox title="Produto" fields={[
            { key: "name", placeholder: "Produto" },
            { key: "category", placeholder: "Categoria", value: "Comunicacao visual" },
            { key: "unit", placeholder: "Unidade", value: "unidade" }
          ]} onSave={(payload) => saveCatalog("product", payload)} />
          <CatalogBox title="Material" fields={[
            { key: "name", placeholder: "Material" },
            { key: "unit", placeholder: "Unidade", value: "m2" },
            { key: "currentCost", placeholder: "Custo R$" },
            { key: "wastePercent", placeholder: "Perda %", value: "8" }
          ]} onSave={(payload) => saveCatalog("material", payload)} />
          <CatalogBox title="Processo" fields={[
            { key: "name", placeholder: "Processo" },
            { key: "processType", placeholder: "Tipo", value: "INTERNAL" },
            { key: "unit", placeholder: "Unidade", value: "hora" },
            { key: "cost", placeholder: "Custo R$" }
          ]} onSave={(payload) => saveCatalog("process", payload)} />
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="font-black text-slate-950">Parametros</h3>
            <div className="mt-3 grid gap-2">
              {[
                ["minMarginPercent", "Margem minima %"],
                ["maxDiscountPercent", "Desconto maximo %"],
                ["fixedCostRatePercent", "Custo fixo %"],
                ["taxRatePercent", "Impostos %"],
                ["commissionPercent", "Comissao %"]
              ].map(([key, label]) => (
                <label key={key} className="grid grid-cols-[1fr_84px] items-center gap-2 text-xs font-black text-slate-500">
                  {label}
                  <input className={inputClass} defaultValue={settingMap[key] || ""} onBlur={(event) => event.target.value.trim() && saveCatalog("setting", { key, value: event.target.value })} />
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <CatalogList title="Produtos" rows={products} value={(item) => item.category || item.unit} />
          <CatalogList title="Materiais" rows={materials} value={(item) => `${brl(item.currentCostCents)} | perda ${Number(item.wastePercent || 0).toFixed(1)}%`} />
          <CatalogList title="Processos" rows={processes} value={(item) => `${brl(item.costCents)} | ${item.type}`} />
        </div>
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
            <select className={`${inputClass} sm:col-span-3`} value={quoteForm.productId} onChange={(event) => {
              const selected = products.find((item: AnyRow) => item.id === event.target.value);
              setQuoteForm({ ...quoteForm, productId: event.target.value, description: selected?.name || quoteForm.description });
            }}>
              <option value="">Produto cadastrado opcional</option>
              {products.map((item: AnyRow) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
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
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {item.shareToken ? (
                    <a className="secondary-action inline-flex items-center justify-center gap-2 py-2" href={`/q/grafica/${item.shareToken}`} target="_blank">
                      <FileText size={16} /> Ver link
                    </a>
                  ) : null}
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => approveQuote(item.id)} type="button">
                    <CheckCircle2 size={16} /> Aprovar
                  </button>
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => quoteAction(item.id, "send")} type="button">Enviar</button>
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => quoteAction(item.id, "duplicate")} type="button">Duplicar</button>
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => quoteAction(item.id, "refuse")} type="button">Recusar</button>
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => quoteAction(item.id, "cancel")} type="button">Cancelar</button>
                </div>
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
              <ProductionCard key={item.id} item={item} materials={materials} onStatus={updateProduction} onAction={updateProductionAction} onUpload={uploadGraphicAttachment} />
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

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="surface-panel p-4">
          <div className="mb-4 flex items-center gap-2">
            <PackageCheck size={18} className="text-emerald-600" />
            <h2 className="text-lg font-black text-slate-950">Entregas</h2>
          </div>
          <div className="space-y-2">
            {deliveryRows.length ? deliveryRows.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="font-black text-slate-950">Pedido #{item.order?.number || "-"}</h3>
                <p className="text-xs font-semibold text-slate-500">{item.method} | {item.status} | prevista {day(item.expectedAt)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="secondary-action py-2 text-xs" type="button" onClick={() => updateDelivery(item.id, "SCHEDULED")}>Agendar</button>
                  <button className="primary-action py-2 text-xs" type="button" onClick={() => updateDelivery(item.id, "DELIVERED")}>Entregue</button>
                  <button className="secondary-action py-2 text-xs" type="button" onClick={() => updateDelivery(item.id, "ACCEPTED")}>Aceite</button>
                  <button className="secondary-action py-2 text-xs" type="button" onClick={() => updateDelivery(item.id, "COMPLAINT")}>Reclamacao</button>
                </div>
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhuma entrega pendente.</p>}
          </div>
        </div>

        <div className="surface-panel p-4">
          <div className="mb-4 flex items-center gap-2">
            <Banknote size={18} className="text-emerald-600" />
            <h2 className="text-lg font-black text-slate-950">Recebimentos</h2>
          </div>
          <div className="space-y-2">
            {receivableRows.length ? receivableRows.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="font-black text-slate-950">{brl(item.amountCents - item.receivedCents)} pendente</h3>
                <p className="text-xs font-semibold text-slate-500">Status {item.status} | vence {day(item.dueDate)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Recebido {brl(item.receivedCents)} de {brl(item.amountCents)}</p>
                {item.status !== "PAID" ? (
                  <button className="primary-action mt-3 inline-flex w-full items-center justify-center py-2 text-xs" type="button" onClick={() => registerPayment(item.id)}>Registrar recebimento</button>
                ) : null}
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum recebimento grafico.</p>}
          </div>
        </div>

        <div className="surface-panel p-4">
          <div className="mb-4 flex items-center gap-2">
            <Star size={18} className="text-amber-500" />
            <h2 className="text-lg font-black text-slate-950">Pos-venda</h2>
          </div>
          <div className="space-y-2">
            {postSaleRows.length ? postSaleRows.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="font-black text-slate-950">Pedido #{item.order?.number || "-"}</h3>
                <p className="text-xs font-semibold text-slate-500">Status {item.status} | satisfacao {item.satisfaction || "-"}</p>
                <p className="mt-1 text-sm text-slate-600">{item.note || "Sem observacao."}</p>
                {item.status === "OPEN" ? (
                  <button className="secondary-action mt-3 inline-flex w-full items-center justify-center py-2 text-xs" type="button" onClick={() => closePostSale(item.id)}>Registrar contato</button>
                ) : null}
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum pos-venda aberto.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function CatalogBox({ title, fields, onSave }: { title: string; fields: { key: string; placeholder: string; value?: string }[]; onSave: (payload: AnyRow) => Promise<boolean> }) {
  const [form, setForm] = useState<AnyRow>(() => Object.fromEntries(fields.map((field) => [field.key, field.value || ""])));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSave(form);
    if (saved) setForm(Object.fromEntries(fields.map((field) => [field.key, field.value || ""])));
  }

  return (
    <form className="rounded-lg border border-slate-200 bg-white p-3" onSubmit={submit}>
      <h3 className="font-black text-slate-950">{title}</h3>
      <div className="mt-3 grid gap-2">
        {fields.map((field) => (
          <input
            key={field.key}
            className={inputClass}
            placeholder={field.placeholder}
            value={form[field.key] || ""}
            onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
          />
        ))}
      </div>
      <button className="primary-action mt-3 inline-flex w-full items-center justify-center gap-2 py-2 text-xs" type="submit">
        <Plus size={14} /> Salvar
      </button>
    </form>
  );
}

function CatalogList({ title, rows, value }: { title: string; rows: AnyRow[]; value: (item: AnyRow) => string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="font-black text-slate-950">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.slice(0, 6).map((item) => (
          <div key={item.id} className="rounded-md bg-slate-50 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-black text-slate-800">{item.name || item.key}</p>
              <span className={`rounded-full px-2 py-1 text-[10px] font-black ${item.validationStatus === "VALIDATED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {item.validationStatus === "VALIDATED" ? "Validado" : "Validar"}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">{value(item)}</p>
          </div>
        ))}
        {!rows.length ? <p className="rounded-md bg-slate-50 p-3 text-xs font-bold text-slate-500">Nenhum cadastro ainda.</p> : null}
      </div>
    </div>
  );
}

function parseChecklist(value: unknown) {
  if (!value) return {} as Record<string, boolean>;
  if (typeof value === "object") return value as Record<string, boolean>;
  try {
    return JSON.parse(String(value)) as Record<string, boolean>;
  } catch {
    return {} as Record<string, boolean>;
  }
}

function ProductionCard({ item, materials, onStatus, onAction, onUpload }: { item: AnyRow; materials: AnyRow[]; onStatus: (id: string, status: string, extra?: AnyRow) => Promise<void>; onAction: (id: string, payload: AnyRow, success?: string) => Promise<boolean>; onUpload: (file: File, linkedModel: string, linkedId: string, purpose?: string) => Promise<boolean> }) {
  const checklist = parseChecklist(item.checklist);
  const checklistItems = [
    ["arte", "Arte"],
    ["medidas", "Medidas"],
    ["material", "Material"],
    ["prazo", "Prazo"],
    ["arquivos", "Arquivos"]
  ];
  const missing = checklistItems.filter(([key]) => !checklist[key]).length;

  async function toggleChecklist(key: string, value: boolean) {
    await onAction(item.id, { action: "checklist", checklist: { [key]: value } }, "Checklist atualizado.");
  }

  async function updateStep(step: AnyRow, stepStatus: string) {
    const minutes = stepStatus === "COMPLETED" ? prompt("Tempo realizado em minutos", String(step.actualMinutes || "")) || "" : "";
    await onAction(item.id, { action: "step", stepId: step.id, stepStatus, minutes }, "Etapa atualizada.");
  }

  async function registerConsumption() {
    const description = prompt("Material consumido", materials[0]?.name || "");
    if (!description) return;
    const quantity = prompt("Quantidade consumida", "1");
    if (!quantity) return;
    const wasteQuantity = prompt("Perda registrada", "0") || "0";
    const selected = materials.find((material) => material.name.toLowerCase() === description.toLowerCase());
    await onAction(item.id, { action: "consumption", materialId: selected?.id, description, quantity, wasteQuantity }, "Consumo registrado.");
  }

  async function registerRework() {
    const reason = prompt("Motivo do retrabalho");
    if (!reason) return;
    const impact = prompt("Impacto do retrabalho", "Prazo/custo/qualidade afetado") || "";
    const correctiveAction = prompt("Acao corretiva", "Corrigir e revisar antes da entrega") || "";
    await onAction(item.id, { action: "rework", reason, impact, correctiveAction }, "Retrabalho registrado.");
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-black text-slate-950">Pedido #{item.order?.number || "-"}</h3>
          <p className="text-xs font-semibold text-slate-500">Status {item.status} | promessa {day(item.promisedAt)} | {(item.attachments || []).length} arquivo(s)</p>
        </div>
        <span className={missing ? "rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700" : "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700"}>
          {missing ? `${missing} pend.` : "Checklist ok"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {checklistItems.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={Boolean(checklist[key])} onChange={(event) => toggleChecklist(key, event.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {(item.steps || []).slice(0, 4).map((step: AnyRow) => (
          <div key={step.id} className="rounded-md border border-slate-100 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black text-slate-700">{step.name}</p>
              <span className="text-[10px] font-black text-slate-400">{step.status}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="secondary-action py-2 text-xs" onClick={() => updateStep(step, "IN_PROGRESS")} type="button">Iniciar etapa</button>
              <button className="secondary-action py-2 text-xs" onClick={() => updateStep(step, "COMPLETED")} type="button">Concluir etapa</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="secondary-action py-2 text-xs" onClick={() => onStatus(item.id, "RELEASED")} type="button">Liberar</button>
        <button className="secondary-action py-2 text-xs" onClick={() => onStatus(item.id, "IN_PROGRESS")} type="button">Iniciar</button>
        <button className="secondary-action py-2 text-xs" onClick={registerConsumption} type="button">Consumo</button>
        <button className="secondary-action py-2 text-xs" onClick={registerRework} type="button">Retrabalho</button>
        <label className="secondary-action cursor-pointer py-2 text-center text-xs">
          Anexar
          <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUpload(file, "production", item.id, "PHOTO");
            event.currentTarget.value = "";
          }} />
        </label>
        <button className="secondary-action py-2 text-xs" onClick={() => onStatus(item.id, "BLOCKED")} type="button">Bloquear</button>
        <button className="primary-action py-2 text-xs" onClick={() => onStatus(item.id, "COMPLETED")} type="button">Concluir</button>
      </div>
    </article>
  );
}
