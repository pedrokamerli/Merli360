"use client";

import { useState } from "react";
import { FileText, Loader2, MessageCircle } from "lucide-react";

type Lead = Record<string, any>;
type Stage = { id: string; name: string };
type TenantUser = { id: string; name?: string | null; username: string };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const when = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";

function phonesFor(lead: Lead) {
  const source = [lead.normalizedPhone, lead.contact].filter(Boolean).join(" ");
  const split = source.split(/[\/,;|\n]+/);
  const matches = source.match(/(?:55)?\s*\(?\d{2}\)?\s*9?\d{4,5}[-\s]?\d{4}/g) || [];
  return [...new Set([...split, ...matches].map((value) => value.replace(/\D/g, "").replace(/^55/, "")).filter((value) => value.length === 10 || value.length === 11))];
}
function phoneLabel(phone: string) { return phone.length === 11 ? `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}` : `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`; }
function isWhatsapp(phone: string) { return phone.length === 11 && phone[2] === "9"; }
const actionPresets: Record<string, { type: string; result: string; status: string; nextAction: string; chance?: number }> = {
  "Contato realizado": { type: "Contato realizado", result: "Primeira abordagem feita", status: "Contatado", nextAction: "Acompanhar resposta" },
  "Sem resposta": { type: "Contato realizado", result: "Sem resposta", status: "Nao respondeu", nextAction: "Fazer novo follow-up" },
  "Respondeu": { type: "Contato realizado", result: "Respondeu", status: "Respondeu", nextAction: "Qualificar necessidade", chance: 15 },
  "Reuniao marcada": { type: "Reuniao marcada", result: "Reuniao marcada", status: "Reuniao marcada", nextAction: "Preparar reuniao", chance: 35 },
  "Proposta enviada": { type: "Proposta enviada", result: "Proposta enviada", status: "Proposta enviada", nextAction: "Cobrar retorno da proposta", chance: 60 },
  "Sem interesse": { type: "Contato realizado", result: "Sem interesse", status: "Sem interesse", nextAction: "", chance: 0 }
};

export function CrmLeadDetailPanel({ lead, initialMode, stages, users, currentUserId, currentUserName, onClose, onSave, onWhatsApp, onChanged }: { lead: Lead; initialMode?: "operation" | "edit"; stages: Stage[]; users: TenantUser[]; currentUserId?: string; currentUserName?: string; onClose: () => void; onSave: (id: string, data: Record<string, unknown>) => void; onWhatsApp: (lead: Lead, phone: string) => void; onChanged?: () => void }) {
  const [mode, setMode] = useState<"operation" | "edit">(initialMode || "operation");
  const [localLead, setLocalLead] = useState<Lead>(lead);
  const [activities, setActivities] = useState<any[]>(lead.activities || []);
  const [form, setForm] = useState<Lead>({ ...lead, nextFollowUp: lead.nextFollowUp?.slice(0, 10) || "", expectedCloseDate: lead.expectedCloseDate?.slice(0, 10) || "" });
  const [savingAction, setSavingAction] = useState(false);
  const [startingQuote, setStartingQuote] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [operation, setOperation] = useState({
    type: "Contato realizado",
    channel: "WhatsApp",
    result: "Sem resposta",
    leadStatus: lead.status || "Novo",
    ownerName: lead.ownerName || currentUserName || "",
    nextAction: lead.nextAction || "Fazer novo follow-up",
    nextActionDate: lead.nextFollowUp?.slice(0, 10) || "",
    proposedValue: lead.proposedValue || 0,
    closeChance: lead.closeChance || 0,
    note: ""
  });
  const phones = phonesFor(form);
  const lockActive = Boolean(localLead.contactLockedUntil && new Date(localLead.contactLockedUntil) > new Date());
  const lockedByOther = Boolean(lockActive && localLead.lastActionByUserId && currentUserId && localLead.lastActionByUserId !== currentUserId);
  const lockedByMe = Boolean(lockActive && localLead.lastActionByUserId && currentUserId && localLead.lastActionByUserId === currentUserId);
  const update = (patch: Record<string, unknown>) => setForm({ ...form, ...patch });
  const updateOperation = (patch: Record<string, unknown>) => setOperation({ ...operation, ...patch });

  async function registerOperation() {
    setSavingAction(true);
    setActionMessage("");
    const response = await fetch("/api/crm/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, ...operation, ownerName: currentUserName || operation.ownerName })
    });
    const body = await response.json();
    setSavingAction(false);
    if (!response.ok) {
      setActionMessage(body.error || "Nao foi possivel registrar a acao.");
      return;
    }
    const now = new Date().toISOString();
    const nextLock = ["whatsapp", "ligacao", "email", "instagram"].includes(String(operation.channel || "").toLowerCase()) ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : localLead.contactLockedUntil;
    const updatedLead = {
      ...localLead,
      status: operation.leadStatus,
      ownerName: currentUserName || operation.ownerName || null,
      nextAction: operation.nextAction || null,
      nextFollowUp: operation.nextActionDate || null,
      proposedValue: operation.proposedValue,
      closeChance: operation.closeChance,
      lastContactAt: now,
      lastActionByUserId: currentUserId || localLead.lastActionByUserId,
      lastActionByName: currentUserName || localLead.lastActionByName,
      lastActionAt: now,
      contactLockedUntil: nextLock,
      lastContactResult: operation.result,
      attempts: Number(localLead.attempts || 0) + (operation.type === "WhatsApp aberto" ? 0 : 1)
    };
    setLocalLead(updatedLead);
    setActivities([{ ...body.item, createdAt: now }, ...activities]);
    setActionMessage("Acao registrada no historico e lead atualizado.");
    onChanged?.();
  }

  async function startGraphicQuote() {
    setStartingQuote(true);
    setActionMessage("");
    const response = await fetch(`/api/crm/leads/${lead.id}/quote-handoff`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      setStartingQuote(false);
      setActionMessage(body.error || "Nao foi possivel preparar o orcamento.");
      return;
    }
    window.location.assign(`/crm?area=grafica&clientId=${encodeURIComponent(body.client.id)}&opportunityId=${encodeURIComponent(body.opportunity.id)}`);
  }

  return <div className="fixed inset-0 z-50 bg-slate-950/40" onClick={onClose}>
    <aside className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-5" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Lead</p><h2 className="text-2xl font-black">{localLead.companyName || localLead.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar">x</button></div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button className={`rounded-xl px-4 py-3 text-sm font-black ${mode === "operation" ? "bg-white text-violet-700 shadow-sm" : "text-slate-600"}`} onClick={() => setMode("operation")}>Operacao</button><button className={`rounded-xl px-4 py-3 text-sm font-black ${mode === "edit" ? "bg-white text-violet-700 shadow-sm" : "text-slate-600"}`} onClick={() => setMode("edit")}>Editar</button></div>
      {lockedByOther ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{localLead.lastActionByName || "Um membro da equipe"} assumiu este contato em {when(localLead.lastActionAt)}. Nova abordagem fica bloqueada ate {when(localLead.contactLockedUntil)}.</p> : null}
      {lockedByMe ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Voce assumiu este contato em {when(localLead.lastActionAt)}. Pode continuar registrando a abordagem normalmente.</p> : null}
      <section className="mt-4 rounded-xl border border-slate-200 p-4"><h3 className="font-black">Formas de contato</h3><div className="mt-3 space-y-2 text-sm">
        {phones.map((phone) => <div key={phone} className="flex items-center justify-between gap-3"><span className="font-bold">{phoneLabel(phone)} <small className={isWhatsapp(phone) ? "text-emerald-700" : "text-slate-500"}>{isWhatsapp(phone) ? "WhatsApp" : "Telefone"}</small></span>{isWhatsapp(phone) ? <button disabled={Boolean(lockedByOther || localLead.doNotContact || localLead.optOut)} className="secondary-action px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onWhatsApp(localLead, phone)}><MessageCircle size={15}/> WhatsApp</button> : null}</div>)}
        {localLead.email ? <a className="block font-bold text-violet-700" href={`mailto:${localLead.email}`}>E-mail: {localLead.email}</a> : null}
        {localLead.website ? <a className="block font-bold text-violet-700" href={localLead.website.startsWith("http") ? localLead.website : `https://${localLead.website}`} target="_blank" rel="noreferrer">Site: {localLead.website}</a> : null}
        {localLead.socialLink ? <a className="block font-bold text-violet-700" href={localLead.socialLink.startsWith("http") ? localLead.socialLink : `https://${localLead.socialLink}`} target="_blank" rel="noreferrer">Rede social / Instagram</a> : null}
        {localLead.googleMapsUrl ? <a className="block font-bold text-violet-700" href={localLead.googleMapsUrl} target="_blank" rel="noreferrer">Abrir no Google Maps</a> : null}
        {localLead.address ? <p className="font-semibold text-slate-600">Endereco: {localLead.address}</p> : null}
        {!phones.length && !localLead.email && !localLead.website && !localLead.socialLink ? <p className="text-slate-500">Nenhum canal de contato informado.</p> : null}
      </div></section>
      {mode === "operation" ? <section className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-black uppercase text-slate-500">Etapa</p><p className="mt-1 font-black text-slate-950">{localLead.status || "Novo"}</p></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-black uppercase text-slate-500">Responsavel</p><p className="mt-1 font-black text-slate-950">{localLead.ownerName || "Sem responsavel"}</p></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-black uppercase text-slate-500">Tentativas</p><p className="mt-1 font-black text-slate-950">{localLead.attempts || 0}</p></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-black uppercase text-slate-500">Ultimo contato</p><p className="mt-1 font-black text-slate-950">{when(localLead.lastContactAt) || "Sem contato"}</p></div></div>
        <section className="rounded-xl border border-violet-200 bg-violet-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase text-violet-700">Proximo passo comercial</p><h3 className="mt-1 font-black text-slate-950">Criar orcamento da grafica</h3><p className="mt-1 text-sm font-semibold text-slate-600">O cadastro deste lead sera aproveitado no pedido.</p></div><button className="primary-action px-4 py-3 disabled:opacity-60" disabled={startingQuote} onClick={startGraphicQuote}>{startingQuote ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}{startingQuote ? "Preparando..." : "Criar orcamento"}</button></div></section>
        <div className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap gap-2">{Object.keys(actionPresets).map((item) => <button key={item} className={`rounded-xl px-3 py-2 text-xs font-black ${operation.type === actionPresets[item].type && operation.result === actionPresets[item].result ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => { const preset = actionPresets[item]; updateOperation({ type: preset.type, result: preset.result, leadStatus: preset.status, nextAction: preset.nextAction, closeChance: preset.chance ?? operation.closeChance }); }}>{item}</button>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-black uppercase">Canal</span><select className="form-control" value={operation.channel} onChange={(event) => updateOperation({ channel: event.target.value })}><option>WhatsApp</option><option>Ligacao</option><option>Email</option><option>Instagram</option><option>Visita</option><option>Outro</option></select></label><label><span className="text-xs font-black uppercase">Resultado</span><select className="form-control" value={operation.result} onChange={(event) => updateOperation({ result: event.target.value })}><option>Primeira abordagem feita</option><option>Sem resposta</option><option>Respondeu</option><option>Interessado</option><option>Reuniao marcada</option><option>Proposta enviada</option><option>Pediu retorno depois</option><option>Sem interesse</option><option>Contato invalido</option></select></label><label><span className="text-xs font-black uppercase">Etapa no funil</span><select className="form-control" value={operation.leadStatus} onChange={(event) => updateOperation({ leadStatus: event.target.value })}>{stages.map((stage) => <option key={stage.id}>{stage.name}</option>)}</select></label><label><span className="text-xs font-black uppercase">Responsavel</span><select className="form-control" value={operation.ownerName} onChange={(event) => updateOperation({ ownerName: event.target.value })}><option value="">Sem responsavel</option>{users.map((user) => <option key={user.id} value={user.name || user.username}>{user.name || user.username}</option>)}</select></label><label><span className="text-xs font-black uppercase">Proxima acao</span><input className="form-control" value={operation.nextAction} onChange={(event) => updateOperation({ nextAction: event.target.value })}/></label><label><span className="text-xs font-black uppercase">Data do follow-up</span><input className="form-control" type="date" value={operation.nextActionDate} onChange={(event) => updateOperation({ nextActionDate: event.target.value })}/></label><label><span className="text-xs font-black uppercase">Valor potencial</span><input className="form-control" type="number" value={operation.proposedValue} onChange={(event) => updateOperation({ proposedValue: Number(event.target.value) })}/></label><label><span className="text-xs font-black uppercase">Chance (%)</span><input className="form-control" type="number" value={operation.closeChance} onChange={(event) => updateOperation({ closeChance: Number(event.target.value) })}/></label><label className="sm:col-span-2"><span className="text-xs font-black uppercase">Anotacao da conversa</span><textarea className="form-control min-h-24" value={operation.note} onChange={(event) => updateOperation({ note: event.target.value })} placeholder="Ex: falei com a recepcao, pediu para retornar amanha de manha."/></label></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button className="secondary-action px-4 py-3" onClick={() => setMode("edit")}>Editar dados cadastrais</button><button disabled={savingAction} className="primary-action disabled:opacity-60" onClick={registerOperation}>{savingAction ? "Registrando..." : "Registrar acao no CRM"}</button></div>{actionMessage ? <p className="mt-3 rounded-xl bg-violet-50 p-3 text-sm font-bold text-violet-800">{actionMessage}</p> : null}</div>
      </section> : null}
      {mode === "edit" ? <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="text-xs font-black uppercase">Nome / empresa</span><input className="form-control" value={form.name || ""} onChange={(event) => update({ name: event.target.value, companyName: event.target.value })}/></label>
        <label><span className="text-xs font-black uppercase">Telefone(s)</span><input className="form-control" value={form.contact || ""} onChange={(event) => update({ contact: event.target.value })}/></label>
        <label><span className="text-xs font-black uppercase">E-mail</span><input className="form-control" value={form.email || ""} onChange={(event) => update({ email: event.target.value })}/></label>
        <label><span className="text-xs font-black uppercase">Cidade</span><input className="form-control" value={form.city || ""} onChange={(event) => update({ city: event.target.value })}/></label>
        <label><span className="text-xs font-black uppercase">UF</span><input className="form-control" value={form.state || ""} onChange={(event) => update({ state: event.target.value })}/></label>
        <label><span className="text-xs font-black uppercase">Tipo</span><input className="form-control" value={form.type || ""} onChange={(event) => update({ type: event.target.value })} placeholder="Ex: Comercio local"/></label>
        <label><span className="text-xs font-black uppercase">Categoria</span><input className="form-control" value={form.segment || ""} onChange={(event) => update({ segment: event.target.value })} placeholder="Ex: Clinica, Oficina automotiva"/></label>
        <label><span className="text-xs font-black uppercase">Etapa</span><select className="form-control" value={form.status} onChange={(event) => update({ status: event.target.value })}>{stages.map((stage) => <option key={stage.id}>{stage.name}</option>)}</select></label>
        <label><span className="text-xs font-black uppercase">Responsavel</span><select className="form-control" value={form.ownerName || ""} onChange={(event) => update({ ownerName: event.target.value || null })}><option value="">Sem responsavel</option>{users.map((user) => <option key={user.id} value={user.name || user.username}>{user.name || user.username}</option>)}</select></label>
        <label><span className="text-xs font-black uppercase">Valor estimado</span><input className="form-control" type="number" value={form.proposedValue || 0} onChange={(event) => update({ proposedValue: Number(event.target.value), hasOpportunity: true })}/></label>
        <label><span className="text-xs font-black uppercase">Probabilidade (%)</span><input className="form-control" type="number" value={form.closeChance || 0} onChange={(event) => update({ closeChance: Number(event.target.value), probabilityManual: true })}/></label>
        <label><span className="text-xs font-black uppercase">Previsao de fechamento</span><input className="form-control" type="date" value={form.expectedCloseDate} onChange={(event) => update({ expectedCloseDate: event.target.value })}/></label>
        <label><span className="text-xs font-black uppercase">Situacao</span><select className="form-control" value={form.opportunityStatus || "aberta"} onChange={(event) => update({ opportunityStatus: event.target.value })}><option value="aberta">Aberta</option><option value="ganha">Ganha</option><option value="perdida">Perdida</option><option value="pausada">Pausada</option></select></label>
        <label className="sm:col-span-2"><span className="text-xs font-black uppercase">Proxima acao</span><input className="form-control" value={form.nextAction || ""} onChange={(event) => update({ nextAction: event.target.value })}/></label>
        <label className="sm:col-span-2"><span className="text-xs font-black uppercase">Follow-up</span><input className="form-control" type="date" value={form.nextFollowUp} onChange={(event) => update({ nextFollowUp: event.target.value })}/></label>
        <label className="sm:col-span-2"><span className="text-xs font-black uppercase">Site</span><input className="form-control" value={form.website || ""} onChange={(event) => update({ website: event.target.value })}/></label>
        <label className="sm:col-span-2"><span className="text-xs font-black uppercase">Instagram / rede social</span><input className="form-control" value={form.socialLink || ""} onChange={(event) => update({ socialLink: event.target.value })}/></label>
        <label className="sm:col-span-2"><span className="text-xs font-black uppercase">Endereco</span><input className="form-control" value={form.address || ""} onChange={(event) => update({ address: event.target.value })}/></label>
        <label className="sm:col-span-2"><span className="text-xs font-black uppercase">Observacoes</span><textarea className="form-control min-h-28" value={form.notes || ""} onChange={(event) => update({ notes: event.target.value })}/></label>
      </div>
      <div className="mt-4 flex justify-end"><button className="primary-action" onClick={() => onSave(lead.id, { ...form, hasOpportunity: true })}>Salvar alteracoes</button></div>
      <div className="mt-5 rounded-xl bg-violet-50 p-4"><p className="text-xs font-black uppercase text-violet-700">Receita ponderada</p><p className="text-2xl font-black text-violet-900">{money.format((form.proposedValue || 0) * (form.closeChance || 0) / 100)}</p></div>
      </> : null}
      <section className="mt-5"><h3 className="font-black">Historico compartilhado</h3><div className="mt-3 space-y-2">{activities.map((activity: any) => <article key={activity.id} className="rounded-xl border p-3 text-sm"><div className="flex justify-between gap-3"><b>{activity.type}</b><span className="text-xs text-slate-500">{when(activity.createdAt)}</span></div><p>{activity.result || activity.note || "Sem anotacao"}</p>{activity.nextAction ? <p className="mt-1 text-xs font-bold text-slate-500">Proxima acao: {activity.nextAction} {activity.nextActionDate ? `em ${when(activity.nextActionDate)}` : ""}</p> : null}<small className="font-bold text-violet-700">{activity.user?.name || activity.user?.username || "Sistema"} via {activity.channel}</small></article>)}{!activities.length ? <p className="text-sm text-slate-500">Sem atividades registradas.</p> : null}</div></section>
    </aside>
  </div>;
}
