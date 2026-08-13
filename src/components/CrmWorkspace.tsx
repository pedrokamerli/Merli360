"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileUp, MessageCircle, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";

type Activity = { id: string; type: string; channel: string; result?: string | null; note?: string | null; nextAction?: string | null; nextActionDate?: string | null; createdAt: string; user?: { name: string; username: string } | null };
type Lead = Record<string, any> & { id?: string; name: string; activities?: Activity[] };
type Stage = { id: string; name: string; color: string; position: number; kind: string };
type Template = { id: string; name: string; content: string; isDefault: boolean };

const blankLead = { name: "", companyName: "", type: "Imobiliaria", city: "", state: "SP", contact: "", email: "", address: "", website: "", socialLink: "", googleMapsUrl: "", publicSource: "", sourceCriteria: "", ownerName: "", status: "Novo", temperature: "Morno", priority: "Media", interestService: "", origin: "Pesquisa publica", proposedValue: 0, closeChance: 0, nextAction: "", nextFollowUp: "", notes: "", doNotContact: false, optOut: false, blockReason: "" };
const brDate = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "-";
const dateInput = (value?: string | null) => value ? String(value).slice(0, 10) : "";

export function CrmWorkspace() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [currentUserName, setCurrentUserName] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ status: "", city: "", type: "", temperature: "", priority: "", followUp: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [activity, setActivity] = useState({ type: "Follow-up", channel: "WhatsApp", result: "", note: "", nextAction: "", nextActionDate: "" });

  async function load(nextPage = page) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
    if (query) params.set("search", query);
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    const response = await fetch(`/api/crm/leads?${params}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Nao foi possivel carregar o CRM.");
    setLeads(data.items || []); setStages(data.stages || []); setTemplates(data.templates || []); setCurrentUserName(data.currentUserName || ""); setTotal(data.total || 0); setPage(data.page || nextPage);
    if (selected) setSelected((data.items || []).find((item: Lead) => item.id === selected.id) || selected);
  }
  useEffect(() => { load(1); }, [pageSize]);
  useEffect(() => { const timer = setTimeout(() => load(1), 250); return () => clearTimeout(timer); }, [query, filters]);

  const cities = useMemo(() => [...new Set(leads.map((lead) => lead.city).filter(Boolean))].sort(), [leads]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function saveLead() {
    if (!editing?.name.trim()) return setMessage("Informe o nome da empresa ou profissional.");
    const response = await fetch("/api/crm/leads", { method: editing.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing.id ? { id: editing.id, data: editing } : { data: editing }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Nao foi possivel salvar o lead.");
    setEditing(null); setMessage("Lead salvo."); await load(); setSelected(data.item);
  }
  async function removeLead(id: string) {
    if (!confirm("Arquivar este lead? O historico sera preservado, mas ele sai da lista.") ) return;
    await fetch(`/api/crm/leads?id=${id}`, { method: "DELETE" }); setSelected(null); await load();
  }
  async function registerActivity(typeOverride?: string) {
    if (!selected) return;
    const payload = { ...activity, type: typeOverride || activity.type, leadId: selected.id };
    const response = await fetch("/api/crm/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Nao foi possivel registrar a atividade.");
    setActivity({ type: "Follow-up", channel: "WhatsApp", result: "", note: "", nextAction: "", nextActionDate: "" }); setMessage("Atividade registrada."); await load();
  }
  function openWhatsApp() {
    if (!selected) return;
    const phone = String(selected.normalizedPhone || selected.contact || "").replace(/\D/g, "").replace(/^55/, "");
    if (phone.length < 10) return setMessage("O telefone precisa ter DDD e numero valido.");
    if (selected.doNotContact || selected.optOut) return setMessage(selected.blockReason || "Este lead esta bloqueado para contato.");
    const template = templates.find((item) => item.isDefault)?.content || "Ola, tudo bem?";
    const text = template.replaceAll("[CIDADE]", selected.city || "sua cidade").replaceAll("[EMPRESA]", selected.companyName || selected.name).replaceAll("[NOME]", currentUserName || "nosso time");
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    registerActivity("WhatsApp aberto");
  }
  async function previewImport() {
    if (!importFile) return;
    const form = new FormData(); form.append("file", importFile);
    const response = await fetch("/api/crm/import", { method: "POST", body: form }); const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Nao foi possivel ler a planilha.");
    setPreview(data.preview || []); setMessage(`${data.total} linha(s) identificada(s). Revise e confirme.`);
  }
  async function confirmImport() {
    if (!importFile) return;
    const form = new FormData(); form.append("file", importFile); form.append("confirm", "true");
    const response = await fetch("/api/crm/import", { method: "POST", body: form }); const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Nao foi possivel importar.");
    setPreview(null); setImportFile(null); setMessage(`Importacao concluida: ${data.inserted} inseridos, ${data.updated} atualizados, ${data.rejected} rejeitados.`); await load(1);
  }
  function exportCsv() {
    const headers = ["Nome", "Cidade", "Telefone", "Etapa", "Temperatura", "Responsavel", "Proxima acao", "Follow-up", "Prioridade"];
    const content = [headers, ...leads.map((lead) => [lead.name, lead.city, lead.contact, lead.status, lead.temperature, lead.ownerName, lead.nextAction, dateInput(lead.nextFollowUp), lead.priority])].map((row) => row.map((item) => `"${String(item || "").replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "crm-leads.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-4">
    <header className="surface-panel flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
      <div><p className="eyebrow">Comercial</p><h1 className="text-2xl font-black text-slate-950">CRM de Leads</h1><p className="mt-1 text-sm font-semibold text-slate-500">Organize pesquisa, contatos, follow-ups e oportunidades.</p></div>
      <div className="flex flex-wrap gap-2"><label className="secondary-action cursor-pointer"><FileUp size={16} /> Importar<input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setPreview(null); }} /></label>{importFile ? <button className="secondary-action" onClick={previewImport}>Ler planilha</button> : null}<button className="secondary-action" onClick={exportCsv}>Exportar CSV</button><button className="primary-action" onClick={() => setEditing({ ...blankLead } as Lead)}><Plus size={17} /> Novo lead</button></div>
    </header>
    {message ? <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">{message}</p> : null}
    {preview ? <section className="surface-panel p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-black text-slate-950">Previa da importacao</h2><div className="flex gap-2"><button className="secondary-action" onClick={() => setPreview(null)}>Cancelar</button><button className="primary-action" onClick={confirmImport}><Check size={16} /> Confirmar importacao</button></div></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-2">Nome</th><th className="p-2">Cidade</th><th className="p-2">Telefone</th><th className="p-2">Etapa</th></tr></thead><tbody>{preview.map((lead, index) => <tr key={index} className="border-b border-slate-100"><td className="p-2 font-bold">{lead.name}</td><td className="p-2">{lead.city}</td><td className="p-2">{lead.contact}</td><td className="p-2">{lead.status}</td></tr>)}</tbody></table></div></section> : null}
    <section className="surface-panel p-4"><div className="grid gap-2 md:grid-cols-3 xl:grid-cols-7"><label className="relative xl:col-span-2"><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input className="form-control pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, telefone, e-mail ou cidade" /></label><select className="form-control" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todas etapas</option>{stages.map((stage) => <option key={stage.id}>{stage.name}</option>)}</select><select className="form-control" value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })}><option value="">Todas cidades</option>{cities.map((city) => <option key={city}>{city}</option>)}</select><select className="form-control" value={filters.temperature} onChange={(event) => setFilters({ ...filters, temperature: event.target.value })}><option value="">Temperatura</option>{["Frio", "Morno", "Quente"].map((item) => <option key={item}>{item}</option>)}</select><select className="form-control" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="">Prioridade</option>{["Alta", "Media", "Baixa", "Bloqueado"].map((item) => <option key={item}>{item}</option>)}</select><select className="form-control" value={filters.followUp} onChange={(event) => setFilters({ ...filters, followUp: event.target.value })}><option value="">Follow-up</option><option value="overdue">Atrasados</option><option value="today">Hoje</option><option value="uncontacted">Nao contatados</option></select></div></section>
    <section className="surface-panel overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Nome", "Cidade", "Telefone", "Etapa", "Temperatura", "Responsavel", "Proxima acao", "Follow-up", "Prioridade", ""].map((item) => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{leads.map((lead) => { const overdue = lead.nextFollowUp && new Date(lead.nextFollowUp) < new Date(new Date().toDateString()); return <tr key={lead.id} className={overdue ? "bg-red-50/70" : "hover:bg-slate-50"}><td className="px-4 py-3 font-black text-slate-900"><button onClick={() => setSelected(lead)}>{lead.companyName || lead.name}</button><p className="text-xs font-medium text-slate-400">{lead.type}</p></td><td className="px-4 py-3">{lead.city || "-"}</td><td className="px-4 py-3">{lead.contact || "-"}</td><td className="px-4 py-3"><span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">{lead.status}</span></td><td className="px-4 py-3">{lead.temperature}</td><td className="px-4 py-3">{lead.ownerName || "Sem responsavel"}</td><td className="px-4 py-3">{lead.nextAction || "-"}</td><td className={overdue ? "px-4 py-3 font-black text-red-600" : "px-4 py-3"}>{dateInput(lead.nextFollowUp) || "-"}</td><td className="px-4 py-3">{lead.priority}</td><td className="px-4 py-3"><button className="icon-button" onClick={() => setSelected(lead)} title="Abrir lead"><ChevronRight size={17} /></button></td></tr>; })}</tbody></table></div><div className="flex items-center justify-between border-t p-3 text-sm font-bold text-slate-600"><span>{total} lead(s)</span><div className="flex items-center gap-2"><select className="form-control w-20 py-1" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{[10,25,50,100].map((item) => <option key={item}>{item}</option>)}</select><button className="icon-button" disabled={page <= 1} onClick={() => load(page - 1)}><ChevronLeft size={16}/></button><span>{page}/{totalPages}</span><button className="icon-button" disabled={page >= totalPages} onClick={() => load(page + 1)}><ChevronRight size={16}/></button></div></div></section>
    {editing ? <LeadEditor lead={editing} stages={stages} onChange={setEditing} onClose={() => setEditing(null)} onSave={saveLead} /> : null}
    {selected ? <LeadDrawer lead={selected} stages={stages} activity={activity} setActivity={setActivity} onClose={() => setSelected(null)} onEdit={() => setEditing({ ...selected, nextFollowUp: dateInput(selected.nextFollowUp) })} onWhatsApp={openWhatsApp} onActivity={registerActivity} onDelete={() => selected.id && removeLead(selected.id)} /> : null}
  </div>;
}

function LeadEditor({ lead, stages, onChange, onClose, onSave }: { lead: Lead; stages: Stage[]; onChange: (lead: Lead) => void; onClose: () => void; onSave: () => void }) {
  const field = (key: string, label: string, type = "text") => <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">{label}</span><input className="form-control" type={type} value={lead[key] ?? ""} onChange={(event) => onChange({ ...lead, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value })} /></label>;
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-3 md:p-8"><section className="mx-auto max-w-5xl rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">CRM</p><h2 className="text-xl font-black">{lead.id ? "Editar lead" : "Novo lead"}</h2></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="grid gap-3 md:grid-cols-3">{field("name", "Nome / razao social")}{field("companyName", "Empresa (se diferente)")}<label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Tipo</span><select className="form-control" value={lead.type} onChange={(event) => onChange({ ...lead, type: event.target.value })}><option>Imobiliaria</option><option>Corretor</option></select></label>{field("contact", "Telefone / WhatsApp")}{field("email", "E-mail", "email")}{field("city", "Cidade")}{field("state", "Estado")}{field("ownerName", "Responsavel")}{field("website", "Site")}{field("socialLink", "Instagram / rede social")}{field("googleMapsUrl", "Google Maps")}{field("publicSource", "Fonte publica")}{field("sourceCriteria", "Criterio da fonte")}<label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Etapa</span><select className="form-control" value={lead.status} onChange={(event) => onChange({ ...lead, status: event.target.value })}>{stages.map((stage) => <option key={stage.id}>{stage.name}</option>)}</select></label><label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Temperatura</span><select className="form-control" value={lead.temperature} onChange={(event) => onChange({ ...lead, temperature: event.target.value })}>{["Frio", "Morno", "Quente"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Prioridade</span><select className="form-control" value={lead.priority} onChange={(event) => onChange({ ...lead, priority: event.target.value })}>{["Alta", "Media", "Baixa", "Bloqueado"].map((item) => <option key={item}>{item}</option>)}</select></label>{field("interestService", "Servico de interesse")}{field("proposedValue", "Potencial financeiro", "number")}{field("closeChance", "Chance de fechamento (%)", "number")}{field("nextAction", "Proxima acao")}{field("nextFollowUp", "Data do follow-up", "date")}</div><label className="mt-3 block"><span className="mb-1 block text-xs font-black uppercase text-slate-500">Observacoes comerciais</span><textarea className="form-control min-h-28" value={lead.notes || ""} onChange={(event) => onChange({ ...lead, notes: event.target.value })}/></label><div className="mt-4 flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(lead.doNotContact)} onChange={(event) => onChange({ ...lead, doNotContact: event.target.checked })}/> Nao contatar</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(lead.optOut)} onChange={(event) => onChange({ ...lead, optOut: event.target.checked })}/> Opt-out solicitado</label></div><div className="mt-5 flex justify-end gap-2"><button className="secondary-action" onClick={onClose}>Cancelar</button><button className="primary-action" onClick={onSave}><Save size={17}/> Salvar lead</button></div></section></div>;
}

function LeadDrawer({ lead, activity, setActivity, onClose, onEdit, onWhatsApp, onActivity, onDelete }: any) { return <div className="fixed inset-0 z-50 bg-slate-950/40" onClick={onClose}><aside className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Lead</p><h2 className="text-2xl font-black text-slate-950">{lead.companyName || lead.name}</h2><p className="text-sm font-semibold text-slate-500">{lead.city || "Cidade nao informada"} · {lead.type}</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="mt-4 flex flex-wrap gap-2"><button className="primary-action" disabled={lead.doNotContact || lead.optOut} onClick={onWhatsApp}><MessageCircle size={17}/> Abrir WhatsApp</button><button className="secondary-action" onClick={onEdit}><Pencil size={16}/> Editar</button><button className="secondary-action text-red-600" onClick={onDelete}><Trash2 size={16}/> Arquivar</button></div>{lead.doNotContact || lead.optOut ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">Contato bloqueado: {lead.blockReason || "Nao contatar"}</p> : null}<section className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm"><p><b>Telefone:</b> {lead.contact || "-"}</p><p><b>E-mail:</b> {lead.email || "-"}</p><p><b>Etapa:</b> {lead.status} · <b>Temperatura:</b> {lead.temperature}</p><p><b>Responsavel:</b> {lead.ownerName || "Sem responsavel"}</p><p><b>Proxima acao:</b> {lead.nextAction || "-"} {lead.nextFollowUp ? `em ${brDate(lead.nextFollowUp)}` : ""}</p>{lead.website ? <a className="font-bold text-violet-700" target="_blank" href={lead.website}>Abrir site</a> : null}{lead.socialLink ? <a className="font-bold text-violet-700" target="_blank" href={lead.socialLink}>Abrir rede social</a> : null}</section><section className="mt-5 rounded-2xl border border-slate-200 p-4"><h3 className="font-black">Registrar atividade</h3><div className="mt-3 grid gap-2 sm:grid-cols-2"><select className="form-control" value={activity.type} onChange={(event) => setActivity({ ...activity, type: event.target.value })}>{["Primeiro contato","Follow-up","Reuniao","Diagnostico","Proposta","Negociacao","Pos-venda","Opt-out"].map((item) => <option key={item}>{item}</option>)}</select><select className="form-control" value={activity.channel} onChange={(event) => setActivity({ ...activity, channel: event.target.value })}>{["Telefone","WhatsApp","E-mail","Instagram","LinkedIn","Presencial","Outro"].map((item) => <option key={item}>{item}</option>)}</select><input className="form-control" placeholder="Resultado" value={activity.result} onChange={(event) => setActivity({ ...activity, result: event.target.value })}/><input className="form-control" type="date" value={activity.nextActionDate} onChange={(event) => setActivity({ ...activity, nextActionDate: event.target.value })}/><input className="form-control sm:col-span-2" placeholder="Proxima acao" value={activity.nextAction} onChange={(event) => setActivity({ ...activity, nextAction: event.target.value })}/><textarea className="form-control min-h-20 sm:col-span-2" placeholder="Anotacao" value={activity.note} onChange={(event) => setActivity({ ...activity, note: event.target.value })}/></div><button className="primary-action mt-3" onClick={() => onActivity()}>Salvar atividade</button></section><section className="mt-5"><h3 className="font-black">Historico</h3><div className="mt-3 space-y-3">{(lead.activities || []).map((item: Activity) => <article key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm"><div className="flex justify-between gap-3"><b>{item.type} · {item.channel}</b><span className="text-xs text-slate-500">{brDate(item.createdAt)}</span></div><p className="mt-1 text-slate-600">{item.result || item.note || "Sem anotacao"}</p>{item.nextAction ? <p className="mt-1 font-bold text-violet-700">Proxima: {item.nextAction} {item.nextActionDate ? `(${brDate(item.nextActionDate)})` : ""}</p> : null}</article>)}{!(lead.activities || []).length ? <p className="text-sm text-slate-500">Nenhuma atividade registrada.</p> : null}</div></section></aside></div>; }
