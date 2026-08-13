"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

type Stage = { id: string; name: string; color: string; position: number; kind: string };
type Template = { id: string; name: string; content: string; isDefault: boolean };

export function CrmSettingsPanel() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [message, setMessage] = useState("");
  const [newStage, setNewStage] = useState({ name: "", color: "violet", kind: "active" });
  const [newTemplate, setNewTemplate] = useState({ name: "", content: "", isDefault: false });
  async function load() { const response = await fetch("/api/crm/settings", { cache: "no-store" }); if (!response.ok) return; const data = await response.json(); setStages(data.stages || []); setTemplates(data.templates || []); setCanManage(Boolean(data.canManage)); }
  useEffect(() => { load(); }, []);
  async function save(kind: string, id: string, data: any) { const response = await fetch("/api/crm/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, data }) }); const body = await response.json(); setMessage(response.ok ? "Configuracao salva." : body.error || "Erro ao salvar."); if (response.ok) load(); }
  async function create(kind: string, data: any) { const response = await fetch("/api/crm/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, data }) }); const body = await response.json(); setMessage(response.ok ? "Configuracao adicionada." : body.error || "Erro ao adicionar."); if (response.ok) { setNewStage({ name: "", color: "violet", kind: "active" }); setNewTemplate({ name: "", content: "", isDefault: false }); load(); } }
  async function remove(kind: string, id: string) { if (!confirm("Excluir este item?") ) return; await fetch(`/api/crm/settings?kind=${kind}&id=${id}`, { method: "DELETE" }); load(); }
  return (
    <section className="surface-panel p-5">
      <p className="eyebrow">CRM comercial</p>
      <h2 className="text-xl font-black text-slate-950">Pipeline e mensagens prontas</h2>
      <p className="mt-1 text-sm font-semibold text-slate-500">Use [NOME], [EMPRESA] e [CIDADE] na mensagem.</p>
      {message ? <p className="mt-3 rounded-xl bg-violet-50 p-3 text-sm font-bold text-violet-800">{message}</p> : null}
      {!canManage ? <p className="mt-4 text-sm font-bold text-slate-500">Somente o administrador do CRM pode editar estas configuracoes.</p> : (
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <div><h3 className="mb-3 font-black">Etapas do funil</h3><div className="space-y-2">{stages.map((stage) => <div key={stage.id} className="flex gap-2"><input className="form-control" value={stage.name} onChange={(event) => setStages(stages.map((item) => item.id === stage.id ? { ...item, name: event.target.value } : item))}/><button className="icon-button" onClick={() => save("stage", stage.id, stage)} title="Salvar"><Save size={16}/></button><button className="icon-button text-red-600" onClick={() => remove("stage", stage.id)} title="Excluir"><Trash2 size={16}/></button></div>)}</div><div className="mt-3 flex gap-2"><input className="form-control" placeholder="Nova etapa" value={newStage.name} onChange={(event) => setNewStage({ ...newStage, name: event.target.value })}/><button className="primary-action" disabled={!newStage.name.trim()} onClick={() => create("stage", { ...newStage, position: stages.length })}><Plus size={16}/>Adicionar</button></div></div>
          <div><h3 className="mb-3 font-black">Mensagens do WhatsApp</h3><div className="space-y-3">{templates.map((template) => <article key={template.id} className="rounded-xl border border-slate-200 p-3"><input className="form-control mb-2" value={template.name} onChange={(event) => setTemplates(templates.map((item) => item.id === template.id ? { ...item, name: event.target.value } : item))}/><textarea className="form-control min-h-28" value={template.content} onChange={(event) => setTemplates(templates.map((item) => item.id === template.id ? { ...item, content: event.target.value } : item))}/><div className="mt-2 flex items-center justify-between"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={template.isDefault} onChange={(event) => setTemplates(templates.map((item) => ({ ...item, isDefault: item.id === template.id ? event.target.checked : event.target.checked ? false : item.isDefault })))} />Padrao</label><div className="flex gap-2"><button className="icon-button" onClick={() => save("template", template.id, template)} title="Salvar"><Save size={16}/></button><button className="icon-button text-red-600" onClick={() => remove("template", template.id)} title="Excluir"><Trash2 size={16}/></button></div></div></article>)}</div><div className="mt-3 rounded-xl bg-slate-50 p-3"><input className="form-control mb-2" placeholder="Nome da mensagem" value={newTemplate.name} onChange={(event) => setNewTemplate({ ...newTemplate, name: event.target.value })}/><textarea className="form-control min-h-24" placeholder="Texto da mensagem" value={newTemplate.content} onChange={(event) => setNewTemplate({ ...newTemplate, content: event.target.value })}/><button className="primary-action mt-2" disabled={!newTemplate.content.trim()} onClick={() => create("template", newTemplate)}><Plus size={16}/>Nova mensagem</button></div></div>
        </div>
      )}
    </section>
  );
}
