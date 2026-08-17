"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, CalendarClock, CheckCircle2, GripVertical, MessageCircle, Plus, Search, Upload, Users } from "lucide-react";
import { CrmLeadDetailPanel } from "@/components/CrmLeadDetailPanel";
import { CrmToday } from "@/components/CrmToday";
import { GraphicCommercialWorkspaceV2 } from "@/components/GraphicCommercialWorkspaceV2";

type Lead = Record<string, any>;
type Stage = { id: string; name: string; position: number; color: string; defaultProbability: number; kind: string; active?: boolean };
type Data = { items: Lead[]; total: number; stages: Stage[]; templates: any[]; filters?: { cities?: string[]; segments?: string[] }; users: Array<{ id: string; name: string; username: string }>; currentUserId: string; currentUserName: string };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Sem data";
const dateTime = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";

function phoneOptions(lead: Lead) {
  const raw = [lead.normalizedPhone, lead.contact].filter(Boolean).join(" / ");
  const splitPhones = raw.split(/[\/,;|\n]+/);
  const matchedPhones = raw.match(/(?:\+?55)?\s*\(?\d{2}\)?\s*9?\d{4,5}[-\s]?\d{4}/g) || [];
  const phones = [...splitPhones, ...matchedPhones].map((item) => item.replace(/\D/g, "").replace(/^55/, "")).filter((item) => item.length === 10 || item.length === 11);
  return [...new Set(phones)];
}

function displayPhone(phone: string) {
  return phone.length === 11 ? `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}` : `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
}

function isWhatsAppPhone(phone: string) {
  return phone.length === 11 && phone[2] === "9";
}

export function CrmCommandCenter() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"today" | "leads" | "pipeline" | "dashboard" | "graphic">(searchParams.get("area") === "grafica" ? "graphic" : "today");
  const [data, setData] = useState<Data>({ items: [], total: 0, stages: [], templates: [], filters: { cities: [], segments: [] }, users: [], currentUserId: "", currentUserName: "" });
  const [pipelineItems, setPipelineItems] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ status: "", city: "", segment: "", priority: "", followUp: "", channel: "" });
  const [selected, setSelected] = useState<Lead | null>(null);
  const [selectedMode, setSelectedMode] = useState<"operation" | "edit">("operation");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const params = new URLSearchParams({ pageSize: "500" });
    if (search) params.set("search", search);
    Object.entries(filter).forEach(([key, value]) => value && params.set(key, value));
    const [leadsResponse, allLeadsResponse, dashboardResponse] = await Promise.all([fetch(`/api/crm/leads?${params}`, { cache: "no-store" }), fetch("/api/crm/leads?pageSize=500", { cache: "no-store" }), fetch("/api/crm/dashboard", { cache: "no-store" })]);
    const [leads, allLeads, dashboard] = await Promise.all([leadsResponse.json(), allLeadsResponse.json(), dashboardResponse.json()]);
    if (leadsResponse.ok) setData(leads); if (dashboardResponse.ok) setMetrics(dashboard);
    if (allLeadsResponse.ok) setPipelineItems(allLeads.items || []);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const handle = setTimeout(load, 250); return () => clearTimeout(handle); }, [search, filter]);
  useEffect(() => { if (searchParams.get("area") === "grafica") setTab("graphic"); }, [searchParams]);
  const cities = useMemo(() => data.filters?.cities?.length ? data.filters.cities : [...new Set(data.items.map((lead) => lead.city).filter(Boolean))].sort(), [data.filters, data.items]);
  const segments = useMemo(() => data.filters?.segments?.length ? data.filters.segments : [...new Set(data.items.map((lead) => lead.segment).filter(Boolean))].sort(), [data.filters, data.items]);
  const queue = metrics?.workQueue || [];
  const openLead = (lead: Lead, mode: "operation" | "edit" = "operation") => {
    setSelected(lead);
    setSelectedMode(mode);
  };

  async function updateLead(id: string, patch: Record<string, unknown>) {
    const isNew = id === "new";
    const response = await fetch("/api/crm/leads", { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isNew ? { data: patch } : { id, data: patch }) });
    const body = await response.json(); if (!response.ok) return setNotice(body.error || "Nao foi possivel atualizar.");
    setSelected((current) => current?.id === id ? { ...current, ...body.item, activities: current.activities } : body.item || current);
    setSelectedMode("operation");
    setNotice(isNew ? "Lead criado." : "Lead atualizado."); await load();
  }
  async function importLeads(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("confirm", "true");
    const response = await fetch("/api/crm/import", { method: "POST", body: form });
    const body = await response.json();
    setNotice(response.ok ? `Importacao concluida: ${body.inserted} novo(s), ${body.updated} atualizado(s), ${body.rejected} rejeitado(s).` : body.error || "Nao foi possivel importar.");
    event.target.value = "";
    if (response.ok) await load();
  }
  async function bulk(action: string, payload: Record<string, unknown>) {
    if (!selectedIds.length) return setNotice("Selecione ao menos um lead.");
    const response = await fetch("/api/crm/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedIds, action, data: payload }) });
    const body = await response.json(); setNotice(response.ok ? `${body.count} lead(s) atualizado(s).` : body.error || "Erro na acao em massa."); if (response.ok) { setSelectedIds([]); load(); }
  }
  async function openWhatsApp(lead: Lead, selectedPhone?: string) {
    const numbers = phoneOptions(lead).filter(isWhatsAppPhone);
    const number = selectedPhone || numbers[0];
    if (!number || !isWhatsAppPhone(number) || lead.doNotContact || lead.optOut) return setNotice("Nao encontrei celular com WhatsApp neste lead. Confira os canais de contato.");
    const popup = window.open("about:blank", "_blank");
    const reservation = await fetch("/api/crm/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id, type: "Contato realizado", channel: "WhatsApp", result: `Mensagem preparada para ${displayPhone(number)}`, leadStatus: "Contatado", nextAction: "Acompanhar resposta", ownerName: data.currentUserName }) });
    const response = await reservation.json();
    if (!reservation.ok) {
      popup?.close();
      return setNotice(response.error || "Este lead esta sendo atendido por outra pessoa.");
    }
    const template = data.templates.find((item) => item.isDefault)?.content || "Ola, tudo bem?";
    const text = template.replaceAll("[NOME]", data.currentUserName).replaceAll("[EMPRESA]", lead.companyName || lead.name).replaceAll("[CIDADE]", lead.city || "sua cidade");
    if (popup) popup.location.replace(`https://wa.me/55${number}?text=${encodeURIComponent(text)}`);
    else window.open(`https://wa.me/55${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setSelected((current) => {
      if (!current || current.id !== lead.id) return current;
      return { ...current, status: "Contatado", ownerName: data.currentUserName, nextAction: "Acompanhar resposta", lastActionByUserId: data.currentUserId, lastActionByName: data.currentUserName, lastActionAt: new Date().toISOString(), contactLockedUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(), activities: [{ id: `local-${Date.now()}`, type: "WhatsApp aberto", channel: "WhatsApp", result: `Mensagem preparada para ${displayPhone(number)}`, createdAt: new Date().toISOString(), user: { name: data.currentUserName } }, ...(current.activities || [])] };
    });
    setNotice(`Abordagem registrada para ${displayPhone(number)}. A equipe vera que voce assumiu este contato.`);
    await load();
  }
  const tabs = [["today", "Hoje", CalendarClock], ["leads", "Leads", Users], ["pipeline", "Pipeline", GripVertical], ["graphic", "Vendas da grafica", CheckCircle2], ["dashboard", "Dashboard", BarChart3]] as const;
  return <div className="space-y-4">
    {tab !== "graphic" ? <header className="surface-panel flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="eyebrow">CRM Comercial</p><h1 className="text-2xl font-black text-slate-950">Central de prospeccao</h1><p className="mt-1 text-sm font-semibold text-slate-500">Leads, cadastros, responsaveis e proximos contatos em um lugar.</p></div><div className="flex flex-wrap gap-2"><button className="secondary-action" onClick={() => { setSelected({ id: "new", name: "", companyName: "", status: "Novo", activities: [], proposedValue: 0, closeChance: 0 }); setSelectedMode("edit"); }}><Plus size={17}/> Novo lead</button><button className="secondary-action" onClick={() => importRef.current?.click()}><Upload size={17}/> Importar Excel</button><input ref={importRef} className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={importLeads}/><button className="primary-action" onClick={() => queue[0] && openLead(queue[0])}><CheckCircle2 size={17}/> Iniciar prospeccao</button></div></header> : null}
    {tab !== "graphic" ? <nav className="surface-panel flex overflow-x-auto p-2">{tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex min-w-28 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${tab === id ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={17}/>{label}</button>)}</nav> : null}
    {notice ? <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">{notice}</p> : null}
    {tab === "today" ? <CrmToday metrics={metrics} queue={queue} onLead={openLead} onWhatsApp={openWhatsApp} onDone={(lead: Lead) => updateLead(lead.id, { nextAction: "", nextFollowUp: null })} /> : null}
    {tab === "dashboard" ? <DashboardV2 metrics={metrics} /> : null}
    {tab === "leads" ? <LeadsListV2 data={data} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} cities={cities} segments={segments} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onLead={openLead} onWhatsApp={openWhatsApp} onBulk={bulk} /> : null}
    {tab === "pipeline" ? <Pipeline leads={pipelineItems} stages={data.stages} onLead={openLead} onMove={updateLead} /> : null}
    {tab === "graphic" ? <GraphicCommercialWorkspaceV2 onBackToLeads={() => { window.history.replaceState({}, "", "/crm"); setTab("today"); }} /> : null}
    {selected ? <CrmLeadDetailPanel lead={selected} initialMode={selectedMode} stages={data.stages} users={data.users} currentUserId={data.currentUserId} currentUserName={data.currentUserName} onClose={() => setSelected(null)} onSave={updateLead} onWhatsApp={openWhatsApp} onChanged={load} /> : null}
  </div>;
}

function Today({ metrics, queue, onLead, onWhatsApp, onDone }: any) { const cards = [["Contatos hoje", queue.filter((x: Lead) => x.nextFollowUp).length], ["Atrasados", metrics?.metrics?.overdue || 0], ["Novos sem abordagem", metrics?.metrics?.new || 0], ["Sem proxima acao", metrics?.metrics?.noNextAction || 0], ["Em negociacao", metrics?.groups?.stages?.find((x: any) => x.label === "Negociacao")?.value || 0], ["Propostas abertas", metrics?.metrics?.proposals || 0]]; return <><section className="grid grid-cols-2 gap-3 xl:grid-cols-6">{cards.map(([label, value]) => <div key={String(label)} className="surface-panel p-4"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div>)}</section><section className="surface-panel overflow-hidden"><div className="border-b p-5"><h2 className="text-lg font-black">Fila de trabalho</h2></div><div className="divide-y">{queue.map((lead: Lead) => <div key={lead.id} className="flex flex-wrap items-center gap-3 p-4"><button className="min-w-48 text-left font-black" onClick={() => onLead(lead)}>{lead.companyName || lead.name}<span className="block text-xs font-semibold text-slate-500">{lead.city || "Cidade nao informada"}</span></button><span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">{lead.status}</span><span className="text-sm font-bold text-slate-600">{lead.nextAction || "Sem proxima acao"} · {date(lead.nextFollowUp)}</span><div className="ml-auto flex gap-2"><button className="icon-button" onClick={() => onWhatsApp(lead)} title="WhatsApp"><MessageCircle size={17}/></button><button className="secondary-action px-3 py-2" onClick={() => onDone(lead)}>Concluir</button></div></div>)}{!queue.length ? <p className="p-8 text-center font-bold text-slate-500">Sua fila esta limpa por enquanto.</p> : null}</div></section></> }
function Dashboard({ metrics }: any) { if (!metrics) return <div className="surface-panel p-8">Carregando indicadores...</div>; const m = metrics.metrics; const cards = [["Leads",m.total],["Oportunidades abertas",m.open],["Receita ponderada",currency.format(m.weightedRevenue)],["Valor ganho",currency.format(m.wonValue)],["Conversao",`${m.conversion.toFixed(1)}%`],["Ticket medio",currency.format(m.averageTicket)],["Atrasados",m.overdue],["Sem responsavel",m.noOwner]]; return <div className="space-y-4"><section className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(([label,value])=><div key={String(label)} className="surface-panel p-4"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</section><section className="grid gap-4 xl:grid-cols-3">{[["Leads por etapa",metrics.groups.stages],["Leads por cidade",metrics.groups.cities],["Leads por responsavel",metrics.groups.owners]].map(([title, rows]: any)=><div key={title} className="surface-panel p-5"><h2 className="font-black">{title}</h2><div className="mt-4 space-y-3">{rows.slice(0,8).map((row:any)=><div key={row.label} className="flex justify-between text-sm font-bold"><span>{row.label}</span><span className="text-violet-700">{row.value}</span></div>)}</div></div>)}</section></div> }
function DashboardV2({ metrics }: any) {
  if (!metrics) return <div className="surface-panel p-8 font-bold text-slate-500">Carregando indicadores...</div>;
  const m = metrics.metrics || {};
  const stages = metrics.groups?.stages || [];
  const maxStage = Math.max(1, ...stages.map((row: any) => row.value || 0));
  const cards = [
    ["Leads totais", m.total || 0, "Base ativa"],
    ["Oportunidades", m.open || 0, "Negocios abertos"],
    ["Receita ponderada", currency.format(m.weightedRevenue || 0), "valor x probabilidade"],
    ["Valor ganho", currency.format(m.wonValue || 0), "clientes fechados"],
    ["Conversao", `${Number(m.conversion || 0).toFixed(1)}%`, "ganhos / total"],
    ["Ticket medio", currency.format(m.averageTicket || 0), "ganhos fechados"],
    ["Follow-ups atrasados", m.overdue || 0, "corrigir hoje"],
    ["Sem responsavel", m.noOwner || 0, "distribuir equipe"]
  ];
  return <div className="space-y-4">
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(([label, value, helper]) => <div key={String(label)} className="surface-panel p-4"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs font-bold text-slate-500">{helper}</p></div>)}</section>
    <section className="surface-panel p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">Funil</p><h2 className="text-xl font-black">Pipeline por etapa</h2></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{stages.reduce((sum: number, row: any) => sum + (row.value || 0), 0)} leads</span></div><div className="mt-5 space-y-3">{stages.map((row: any) => <div key={row.label} className="grid gap-2 md:grid-cols-[180px_1fr_48px] md:items-center"><span className="text-sm font-black text-slate-700">{row.label}</span><div className="h-4 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.max(8, ((row.value || 0) / maxStage) * 100)}%` }}/></div><span className="text-right text-sm font-black text-violet-700">{row.value}</span></div>)}</div></section>
    <section className="grid gap-4 xl:grid-cols-3">{[["Categorias", metrics.groups?.segments || []], ["Cidades com mais leads", metrics.groups?.cities || []], ["Responsaveis", metrics.groups?.owners || []]].map(([title, rows]: any) => <div key={title} className="surface-panel p-5"><h2 className="font-black">{title}</h2><div className="mt-4 space-y-3">{rows.slice(0, 10).map((row: any) => <div key={row.label} className="flex justify-between gap-3 text-sm font-bold"><span className="truncate">{row.label || "Nao informado"}</span><span className="text-violet-700">{row.value}</span></div>)}{!rows.length ? <p className="text-sm font-bold text-slate-500">Sem dados.</p> : null}</div></div>)}</section>
  </div>;
}
function LeadsList({ data, search, setSearch, filter, setFilter, cities, selectedIds, setSelectedIds, onLead, onWhatsApp, onBulk }: any) { const all = data.items.length && selectedIds.length === data.items.length; return <div className="space-y-3"><section className="surface-panel grid gap-2 p-4 md:grid-cols-5"><label className="relative md:col-span-2"><Search className="absolute left-3 top-3 text-slate-400" size={16}/><input className="form-control pl-9" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Nome, empresa, telefone ou cidade"/></label><select className="form-control" value={filter.status} onChange={(e)=>setFilter({...filter,status:e.target.value})}><option value="">Todas etapas</option>{data.stages.map((s:Stage)=><option key={s.id}>{s.name}</option>)}</select><select className="form-control" value={filter.city} onChange={(e)=>setFilter({...filter,city:e.target.value})}><option value="">Todas cidades</option>{cities.map((city:string)=><option key={city}>{city}</option>)}</select><select className="form-control" value={filter.followUp} onChange={(e)=>setFilter({...filter,followUp:e.target.value})}><option value="">Todos follow-ups</option><option value="overdue">Atrasados</option><option value="today">Hoje</option><option value="uncontacted">Nao contatados</option></select></section>{selectedIds.length ? <section className="surface-panel flex flex-wrap items-center gap-2 p-3"><b>{selectedIds.length} selecionado(s)</b><select className="form-control w-48" onChange={(e)=>e.target.value && onBulk("stage",{status:e.target.value})} defaultValue=""><option value="">Alterar etapa</option>{data.stages.map((s:Stage)=><option key={s.id}>{s.name}</option>)}</select><button className="secondary-action" onClick={()=>onBulk("doNotContact",{})}>Nao contatar</button><button className="secondary-action text-red-600" onClick={()=>onBulk("archive",{})}>Arquivar</button></section> : null}<section className="surface-panel overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3"><input type="checkbox" checked={Boolean(all)} onChange={()=>setSelectedIds(all?[]:data.items.map((l:Lead)=>l.id))}/></th>{["Lead","Cidade","Etapa","Oportunidade","Proxima acao","Prioridade",""].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody className="divide-y">{data.items.map((lead:Lead)=><tr key={lead.id}><td className="p-3"><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={()=>setSelectedIds(selectedIds.includes(lead.id)?selectedIds.filter((id:string)=>id!==lead.id):[...selectedIds,lead.id])}/></td><td className="p-3"><button className="font-black" onClick={()=>onLead(lead)}>{lead.companyName||lead.name}</button><small className="block text-slate-500">{lead.contact||"Sem telefone"}</small></td><td className="p-3"><span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">{lead.status}</span></td><td className="p-3">{lead.hasOpportunity?currency.format(lead.proposedValue):"-"}<small className="block text-slate-500">{lead.closeChance||0}%</small></td><td className="p-3">{lead.nextAction||"-"}<small className="block text-slate-500">{date(lead.nextFollowUp)}</small></td><td className="p-3">{lead.priority}</td><td className="p-3"><button className="icon-button" onClick={()=>onWhatsApp(lead)}><MessageCircle size={16}/></button></td></tr>)}</tbody></table><p className="border-t p-3 text-sm font-bold text-slate-500">{data.total} resultado(s)</p></section></div> }
function LeadsListV2({ data, search, setSearch, filter, setFilter, cities, segments, selectedIds, setSelectedIds, onLead, onWhatsApp, onBulk }: any) {
  const all = data.items.length > 0 && selectedIds.length === data.items.length;
  return <div className="space-y-3">
    <section className="surface-panel grid gap-2 p-4 md:grid-cols-7">
      <label className="relative md:col-span-2"><Search className="absolute left-3 top-3 text-slate-400" size={16}/><input className="form-control pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, cidade, telefone, e-mail ou site"/></label>
      <select className="form-control" value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">Todas etapas</option>{data.stages.map((stage: Stage) => <option key={stage.id}>{stage.name}</option>)}</select>
      <select className="form-control" value={filter.city} onChange={(event) => setFilter({ ...filter, city: event.target.value })}><option value="">Todas cidades</option>{cities.map((city: string) => <option key={city}>{city}</option>)}</select>
      <select className="form-control" value={filter.segment} onChange={(event) => setFilter({ ...filter, segment: event.target.value })}><option value="">Todas categorias</option>{segments.map((segment: string) => <option key={segment}>{segment}</option>)}</select>
      <select className="form-control" value={filter.followUp} onChange={(event) => setFilter({ ...filter, followUp: event.target.value })}><option value="">Todos follow-ups</option><option value="overdue">Atrasados</option><option value="today">Hoje</option><option value="uncontacted">Nao contatados</option></select>
      <select className="form-control" value={filter.channel} onChange={(event) => setFilter({ ...filter, channel: event.target.value })}><option value="">Todos contatos</option><option value="whatsapp">Com WhatsApp</option><option value="phone">Com telefone</option><option value="email">Com e-mail</option><option value="no-contact">Sem contato</option></select>
    </section>
    {selectedIds.length ? <section className="surface-panel flex flex-wrap items-center gap-2 p-3"><b>{selectedIds.length} selecionado(s)</b><select className="form-control w-48" onChange={(event) => event.target.value && onBulk("stage", { status: event.target.value })} defaultValue=""><option value="">Alterar etapa</option>{data.stages.map((stage: Stage) => <option key={stage.id}>{stage.name}</option>)}</select><button className="secondary-action" onClick={() => onBulk("doNotContact", {})}>Nao contatar</button><button className="secondary-action text-red-600" onClick={() => onBulk("archive", {})}>Arquivar</button></section> : null}
    <section className="surface-panel overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3"><input type="checkbox" checked={all} onChange={() => setSelectedIds(all ? [] : data.items.map((lead: Lead) => lead.id))}/></th>{["Lead", "Cidade", "Etapa", "Responsavel", "Oportunidade", "Proxima acao", "Prioridade", "Acoes"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody className="divide-y">{data.items.map((lead: Lead) => <tr key={lead.id} className="hover:bg-slate-50/70"><td className="p-3"><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={() => setSelectedIds(selectedIds.includes(lead.id) ? selectedIds.filter((id: string) => id !== lead.id) : [...selectedIds, lead.id])}/></td><td className="p-3"><button className="text-left font-black" onClick={() => onLead(lead, "operation")}>{lead.companyName || lead.name}</button><small className="block text-slate-500">{lead.contact || "Sem telefone"}</small></td><td className="p-3 font-bold text-slate-700">{lead.city || "Nao informado"}<small className="block text-slate-500">{lead.segment || lead.state || "Sem categoria"}</small></td><td className="p-3"><span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">{lead.status || "Novo"}</span></td><td className="p-3 font-bold text-slate-600">{lead.ownerName || "Sem responsavel"}</td><td className="p-3">{lead.hasOpportunity ? currency.format(lead.proposedValue || 0) : "-"}<small className="block text-slate-500">{lead.closeChance || 0}%</small></td><td className="p-3">{lead.nextAction || "-"}<small className="block text-slate-500">{date(lead.nextFollowUp)}</small></td><td className="p-3">{lead.priority || "Media"}</td><td className="p-3"><div className="flex items-center gap-2"><button className="icon-button" onClick={() => onWhatsApp(lead)} title="WhatsApp"><MessageCircle size={16}/></button><button className="secondary-action px-3 py-2" onClick={() => onLead(lead, "edit")}>Editar</button></div></td></tr>)}</tbody></table><p className="border-t p-3 text-sm font-bold text-slate-500">{data.total} resultado(s)</p></section>
  </div>;
}
function Pipeline({ leads, stages, onLead, onMove }: any) {
  const [dragged, setDragged] = useState<string>("");
  const columns = stages
    .filter((stage: Stage) => stage.active !== false)
    .map((stage: Stage) => ({ stage, items: leads.filter((lead: Lead) => lead.status === stage.name) }))
    .filter((column: any) => column.items.length > 0);
  if (!columns.length) return <div className="surface-panel p-8 text-center font-bold text-slate-500">Nenhum lead ativo no funil ainda.</div>;
  return <div className="flex gap-3 overflow-x-auto pb-3">{columns.map(({ stage, items }: any) => <section key={stage.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { const lead = leads.find((item: Lead) => item.id === dragged); if (lead) onMove(lead.id, { status: stage.name, closeChance: lead.probabilityManual ? lead.closeChance : stage.defaultProbability || lead.closeChance }); }} className="w-72 shrink-0 rounded-2xl bg-slate-100 p-3"><div className="mb-3 flex justify-between font-black"><span>{stage.name}</span><span>{items.length}</span></div><div className="space-y-2">{items.map((lead: Lead) => <article key={lead.id} draggable onDragStart={() => setDragged(lead.id)} className="rounded-xl bg-white p-3 shadow-sm"><button className="text-left font-black" onClick={() => onLead(lead)}>{lead.companyName || lead.name}</button><p className="mt-1 text-xs text-slate-500">{lead.city || "-"} - {lead.temperature}</p><p className="mt-2 text-sm font-black text-violet-700">{currency.format(lead.proposedValue || 0)} - {lead.closeChance || 0}%</p><p className="mt-1 text-xs font-bold text-slate-600">{lead.ownerName || "Sem responsavel"}</p><p className="mt-1 text-xs font-bold text-slate-500">{lead.nextAction || "Sem proxima acao"}</p></article>)}</div></section>)}</div>;
}function LeadPanel({ lead, stages, onClose, onSave, onWhatsApp }: any) { const [form,setForm]=useState({...lead,nextFollowUp:lead.nextFollowUp?.slice(0,10)||"",expectedCloseDate:lead.expectedCloseDate?.slice(0,10)||""}); return <div className="fixed inset-0 z-50 bg-slate-950/40" onClick={onClose}><aside className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-5" onClick={e=>e.stopPropagation()}><div className="flex justify-between"><div><p className="eyebrow">Lead</p><h2 className="text-2xl font-black">{lead.companyName||lead.name}</h2></div><button className="icon-button" onClick={onClose}>×</button></div><div className="mt-4 flex gap-2"><button className="primary-action" onClick={()=>onWhatsApp(lead)}><MessageCircle size={17}/>WhatsApp</button><button className="secondary-action" onClick={()=>onSave(lead.id,{...form,hasOpportunity:true})}>Salvar</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-black uppercase">Etapa</span><select className="form-control" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{stages.map((s:Stage)=><option key={s.id}>{s.name}</option>)}</select></label><label><span className="text-xs font-black uppercase">Responsavel</span><input className="form-control" value={form.ownerName||""} onChange={e=>setForm({...form,ownerName:e.target.value})}/></label><label><span className="text-xs font-black uppercase">Valor estimado</span><input className="form-control" type="number" value={form.proposedValue||0} onChange={e=>setForm({...form,proposedValue:Number(e.target.value),hasOpportunity:true})}/></label><label><span className="text-xs font-black uppercase">Probabilidade (%)</span><input className="form-control" type="number" value={form.closeChance||0} onChange={e=>setForm({...form,closeChance:Number(e.target.value),probabilityManual:true})}/></label><label><span className="text-xs font-black uppercase">Previsao de fechamento</span><input className="form-control" type="date" value={form.expectedCloseDate} onChange={e=>setForm({...form,expectedCloseDate:e.target.value})}/></label><label><span className="text-xs font-black uppercase">Situacao</span><select className="form-control" value={form.opportunityStatus||"aberta"} onChange={e=>setForm({...form,opportunityStatus:e.target.value})}><option value="aberta">Aberta</option><option value="ganha">Ganha</option><option value="perdida">Perdida</option><option value="pausada">Pausada</option></select></label><label className="sm:col-span-2"><span className="text-xs font-black uppercase">Proxima acao</span><input className="form-control" value={form.nextAction||""} onChange={e=>setForm({...form,nextAction:e.target.value})}/></label><label className="sm:col-span-2"><span className="text-xs font-black uppercase">Follow-up</span><input className="form-control" type="date" value={form.nextFollowUp} onChange={e=>setForm({...form,nextFollowUp:e.target.value})}/></label></div><div className="mt-5 rounded-xl bg-violet-50 p-4"><p className="text-xs font-black uppercase text-violet-700">Receita ponderada</p><p className="text-2xl font-black text-violet-900">{currency.format((form.proposedValue||0)*(form.closeChance||0)/100)}</p></div><section className="mt-5"><h3 className="font-black">Historico</h3><div className="mt-3 space-y-2">{(lead.activities||[]).map((a:any)=><article key={a.id} className="rounded-xl border p-3 text-sm"><b>{a.type}</b><p>{a.result||a.note||"Sem anotacao"}</p></article>)}{!(lead.activities||[]).length?<p className="text-sm text-slate-500">Sem atividades registradas.</p>:null}</div></section></aside></div> }
