"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, CheckCircle2, CircleDollarSign, Mail, Phone, Plus, Search } from "lucide-react";

type Lead = Record<string, any>;

const serviceOptions = [
  "Impressos comerciais",
  "Embalagens",
  "Adesivos e rotulos",
  "Comunicacao visual",
  "Material promocional",
  "Outros servicos graficos"
];

const statusOptions = ["Novo", "Qualificado", "Reuniao marcada", "Proposta enviada", "Negociacao", "Cliente", "Nutricao", "Sem interesse"];

const initialForm = {
  name: "",
  contact: "",
  email: "",
  city: "",
  state: "",
  segment: "Impressos comerciais",
  proposedValue: "",
  nextAction: "Entender demanda grafica",
  nextFollowUp: "",
  notes: ""
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const day = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Sem data";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function asNumber(value: unknown) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortByWork(leads: Lead[]) {
  return [...leads].sort((a, b) => {
    const aDate = a.nextFollowUp ? new Date(a.nextFollowUp).getTime() : Number.MAX_SAFE_INTEGER;
    const bDate = b.nextFollowUp ? new Date(b.nextFollowUp).getTime() : Number.MAX_SAFE_INTEGER;
    return aDate - bDate || String(a.status || "").localeCompare(String(b.status || ""));
  });
}

export function GraficaCrmWorkspace() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const params = new URLSearchParams({ pageSize: "500", origin: "Grafica" });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    const response = await fetch(`/api/crm/leads?${params}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Nao foi possivel carregar a carteira grafica.");
      return;
    }
    setLeads(data.items || []);
    setStages(data.stages || []);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
  }, [search, status]);

  const metrics = useMemo(() => {
    const open = leads.filter((lead) => !["Cliente", "Sem interesse", "Nao contatar"].includes(lead.status));
    const proposal = leads.filter((lead) => ["Proposta enviada", "Negociacao"].includes(lead.status));
    const won = leads.filter((lead) => lead.status === "Cliente" || lead.opportunityStatus === "ganha");
    const today = todayInput();
    return {
      total: leads.length,
      open: open.length,
      proposal: proposal.length,
      won: won.length,
      value: open.reduce((sum, lead) => sum + Number(lead.proposedValue || 0), 0),
      followUps: open.filter((lead) => lead.nextFollowUp && String(lead.nextFollowUp).slice(0, 10) <= today).length
    };
  }, [leads]);

  const grouped = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const lead of leads) {
      const key = lead.segment || "Sem categoria";
      map.set(key, [...(map.get(key) || []), lead]);
    }
    return [...map.entries()].map(([label, items]) => ({ label, items })).sort((a, b) => b.items.length - a.items.length);
  }, [leads]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const payload = {
      name: form.name.trim(),
      companyName: form.name.trim(),
      contact: form.contact.trim(),
      email: form.email.trim(),
      city: form.city.trim(),
      state: form.state.trim() || "SP",
      type: "Cliente grafica",
      segment: form.segment,
      origin: "Grafica",
      status: "Novo",
      temperature: "Morno",
      priority: "Media",
      interestService: form.segment,
      hasOpportunity: asNumber(form.proposedValue) > 0,
      proposedValue: asNumber(form.proposedValue),
      closeChance: asNumber(form.proposedValue) > 0 ? 15 : 0,
      nextAction: form.nextAction.trim() || "Entender demanda grafica",
      nextFollowUp: form.nextFollowUp || null,
      notes: form.notes.trim()
    };
    const response = await fetch("/api/crm/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: payload })
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error || "Nao foi possivel cadastrar.");
      return;
    }
    setForm(initialForm);
    setMessage("Cliente grafico criado no CRM.");
    await load();
  }

  async function moveLead(lead: Lead, nextStatus: string) {
    const stage = stages.find((item) => item.name === nextStatus);
    const response = await fetch("/api/crm/leads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: lead.id,
        data: {
          status: nextStatus,
          hasOpportunity: ["Proposta enviada", "Negociacao", "Cliente"].includes(nextStatus) || lead.hasOpportunity,
          closeChance: nextStatus === "Cliente" ? 100 : stage && "defaultProbability" in stage ? (stage as any).defaultProbability : lead.closeChance,
          nextAction: nextStatus === "Cliente" ? "Acompanhar entrega e recorrencia" : lead.nextAction
        }
      })
    });
    const data = await response.json();
    setMessage(response.ok ? `Etapa atualizada para ${nextStatus}.` : data.error || "Nao foi possivel atualizar etapa.");
    if (response.ok) await load();
  }

  const ordered = sortByWork(leads);

  return <div className="space-y-5">
    <header className="surface-panel grid gap-4 p-5 xl:grid-cols-[1fr_auto] xl:items-center">
      <div>
        <p className="eyebrow">Grafica integrada ao CRM</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">Carteira comercial grafica</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">Cadastre clientes, acompanhe orcamentos e avance oportunidades usando os mesmos usuarios e tenants do Merli360.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Leads" value={metrics.total} />
        <Metric label="Abertos" value={metrics.open} />
        <Metric label="Propostas" value={metrics.proposal} />
        <Metric label="Potencial" value={money.format(metrics.value)} />
      </div>
    </header>

    {message ? <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">{message}</p> : null}

    <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <form className="surface-panel space-y-3 p-5" onSubmit={submit}>
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Plus size={18} /></span>
          <div>
            <h2 className="font-black text-slate-950">Novo cliente grafico</h2>
            <p className="text-xs font-bold text-slate-500">Entra direto na fila do CRM.</p>
          </div>
        </div>
        <label><span className="text-xs font-black uppercase text-slate-500">Empresa / cliente</span><input className="form-control" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="text-xs font-black uppercase text-slate-500">Telefone</span><input className="form-control" value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} /></label>
          <label><span className="text-xs font-black uppercase text-slate-500">E-mail</span><input className="form-control" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_72px]">
          <label><span className="text-xs font-black uppercase text-slate-500">Cidade</span><input className="form-control" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
          <label><span className="text-xs font-black uppercase text-slate-500">UF</span><input className="form-control" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></label>
        </div>
        <label><span className="text-xs font-black uppercase text-slate-500">Servico principal</span><select className="form-control" value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })}>{serviceOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="text-xs font-black uppercase text-slate-500">Valor potencial</span><input className="form-control" inputMode="decimal" value={form.proposedValue} onChange={(event) => setForm({ ...form, proposedValue: event.target.value })} /></label>
          <label><span className="text-xs font-black uppercase text-slate-500">Follow-up</span><input className="form-control" type="date" value={form.nextFollowUp} onChange={(event) => setForm({ ...form, nextFollowUp: event.target.value })} /></label>
        </div>
        <label><span className="text-xs font-black uppercase text-slate-500">Proxima acao</span><input className="form-control" value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} /></label>
        <label><span className="text-xs font-black uppercase text-slate-500">Observacoes</span><textarea className="form-control min-h-24" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="primary-action w-full justify-center" disabled={saving}>{saving ? "Salvando..." : "Salvar no CRM"}</button>
      </form>

      <div className="space-y-4">
        <section className="surface-panel grid gap-2 p-4 md:grid-cols-[1fr_220px]">
          <label className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={16} /><input className="form-control pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, cidade, telefone ou e-mail" /></label>
          <select className="form-control" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todas etapas</option>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select>
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <Insight icon={CalendarClock} label="Follow-ups vencendo" value={metrics.followUps} />
          <Insight icon={CircleDollarSign} label="Potencial em aberto" value={money.format(metrics.value)} />
          <Insight icon={CheckCircle2} label="Clientes fechados" value={metrics.won} />
        </section>

        <section className="surface-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4"><h2 className="font-black text-slate-950">Fila grafica</h2></div>
          <div className="divide-y divide-slate-100">
            {ordered.map((lead) => <article key={lead.id} className="grid gap-3 p-4 xl:grid-cols-[1fr_170px_220px] xl:items-center">
              <div>
                <button className="text-left font-black text-slate-950">{lead.companyName || lead.name}</button>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1"><Building2 size={13} /> {lead.segment || "Sem categoria"}</span>
                  {lead.contact ? <span className="inline-flex items-center gap-1"><Phone size={13} /> {lead.contact}</span> : null}
                  {lead.email ? <span className="inline-flex items-center gap-1"><Mail size={13} /> {lead.email}</span> : null}
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-600">{lead.nextAction || "Sem proxima acao"} - {day(lead.nextFollowUp)}</p>
              </div>
              <div>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{lead.status || "Novo"}</span>
                <p className="mt-2 text-sm font-black text-slate-800">{money.format(Number(lead.proposedValue || 0))}</p>
              </div>
              <div className="flex flex-wrap gap-2 xl:justify-end">
                {["Qualificado", "Proposta enviada", "Cliente"].map((item) => <button key={item} className="secondary-action px-3 py-2 text-xs" onClick={() => moveLead(lead, item)}>{item}</button>)}
              </div>
            </article>)}
            {!ordered.length ? <p className="p-8 text-center text-sm font-bold text-slate-500">Nenhum cliente grafico encontrado neste tenant.</p> : null}
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {grouped.slice(0, 4).map((group) => <div key={group.label} className="surface-panel p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="font-black text-slate-950">{group.label}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{group.items.length}</span></div>
            <div className="mt-3 space-y-2">{group.items.slice(0, 4).map((lead) => <p key={lead.id} className="flex justify-between gap-3 text-sm font-bold"><span className="truncate">{lead.companyName || lead.name}</span><span className="text-violet-700">{lead.status}</span></p>)}</div>
          </div>)}
        </section>
      </div>
    </section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-2"><p className="text-[11px] font-black uppercase text-slate-500">{label}</p><p className="text-lg font-black text-slate-950">{value}</p></div>;
}

function Insight({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return <div className="surface-panel flex items-center gap-3 p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={20} /></span><div><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="text-xl font-black text-slate-950">{value}</p></div></div>;
}
