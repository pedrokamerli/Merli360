"use client";

import { useEffect, useState } from "react";
import { Pencil, Save, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";

type Tenant = { id: string; brandName: string; kind: string };
type UserRow = { id: string; username: string; name: string; role: string; tenantId: string; tenantName: string; tenantKind: string; mustChangePassword?: boolean; moduleAccess?: string };
type LogRow = { id: string; action: string; entity?: string | null; status: string; message?: string | null; metadata?: string | null; createdAt: string; user?: { id: string; name: string; username: string } | null };

const emptyForm = {
  tenantMode: "new",
  tenantId: "",
  tenantName: "",
  brandName: "",
  kind: "consultoria",
  name: "",
  username: "",
  password: "",
  role: "admin",
  moduleAccess: ["all"] as string[]
};

function ModulePicker({ value, onChange, compact = false }: { value: string[]; onChange: (value: string[]) => void; compact?: boolean }) {
  const all = value.includes("all");
  return (
    <fieldset className={compact ? "grid gap-1" : "rounded-xl bg-slate-50 p-3"}>
      {!compact ? <legend className="mb-2 text-xs font-black uppercase text-slate-500">Modulos liberados</legend> : null}
      <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <input type="checkbox" checked={all} onChange={(event) => onChange(event.target.checked ? ["all"] : ["crm"])} />
        Todos os modulos
      </label>
      <label className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-700">
        <input type="checkbox" checked={all || value.includes("crm")} onChange={(event) => onChange(event.target.checked ? (all ? ["all"] : ["crm"]) : [])} disabled={all} />
        Somente CRM comercial
      </label>
    </fieldset>
  );
}

export function UsersAdmin() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [selectedLogUser, setSelectedLogUser] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ id: "", tenantId: "", name: "", username: "", role: "user", password: "", mustChangePassword: false, moduleAccess: ["all"] as string[] });

  async function load() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const data = await response.json();
    setUsers(data.users || []);
    setTenants(data.tenants || []);
    setLogs(data.logs || []);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredLogs = selectedLogUser ? logs.filter((log) => log.user?.id === selectedLogUser) : logs;

  async function createUser() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage(data.error || "Nao foi possivel criar o usuario.");
    setMessage(`Usuario criado: ${data.user.username}. No primeiro acesso ele vai escolher a propria senha e preencher o setup da IA.`);
    setForm({ ...emptyForm, tenantMode: form.tenantMode, tenantId: form.tenantId, kind: form.kind });
    await load();
  }

  function startEdit(user: UserRow) {
    setEditingId(user.id);
    setEditForm({
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      username: user.username,
      role: user.role,
      password: "",
      mustChangePassword: Boolean(user.mustChangePassword),
      moduleAccess: user.moduleAccess ? (() => { try { return JSON.parse(user.moduleAccess); } catch { return user.moduleAccess.split(","); } })() : ["all"]
    });
    setMessage("");
  }

  async function saveEdit() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm)
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage(data.error || "Nao foi possivel salvar o usuario.");
    setMessage("Usuario atualizado.");
    setEditingId("");
    await load();
  }

  async function deleteUser(user: UserRow) {
    if (!confirm(`Excluir o usuario ${user.name}? Essa acao remove o acesso e a memoria da IA desse usuario.`)) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id })
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage(data.error || "Nao foi possivel excluir o usuario.");
    setMessage("Usuario excluido.");
    await load();
  }

  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="eyebrow">Super usuario</p>
            <h1 className="text-2xl font-black text-slate-950">Usuarios do SaaS</h1>
            <p className="text-sm font-semibold text-slate-500">Crie, edite e remova acessos separados, com dados e memoria de IA isolados por usuario/tenant.</p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <div className="surface-panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="text-violet-600" size={20} />
            <h2 className="text-lg font-black text-slate-950">Novo acesso</h2>
          </div>
          <div className="grid gap-3">
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Tenant</span>
              <select className="form-control" value={form.tenantMode} onChange={(event) => setForm({ ...form, tenantMode: event.target.value })}>
                <option value="new">Criar novo cliente do SaaS</option>
                <option value="existing">Usar tenant existente</option>
              </select>
            </label>
            <ModulePicker value={form.moduleAccess} onChange={(moduleAccess) => setForm({ ...form, moduleAccess })} />
            {form.tenantMode === "existing" ? (
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Tenant existente</span>
                <select className="form-control" value={form.tenantId} onChange={(event) => setForm({ ...form, tenantId: event.target.value })}>
                  <option value="">Selecione</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.brandName} - {tenant.kind}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  <span className="mb-1 block text-xs font-black uppercase text-slate-500">Nome do cliente/empresa</span>
                  <input className="form-control" value={form.tenantName} onChange={(event) => setForm({ ...form, tenantName: event.target.value, brandName: event.target.value })} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-black uppercase text-slate-500">Tipo</span>
                  <select className="form-control" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                    <option value="consultoria">Generico/financeiro</option>
                    <option value="agro">Agro/rural</option>
                  </select>
                </label>
              </>
            )}
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Nome da pessoa</span>
              <input className="form-control" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Usuario</span>
                <input className="form-control" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Senha temporaria</span>
                <input className="form-control" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              </label>
            </div>
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Permissao</span>
              <select className="form-control" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="admin">Administrador do tenant</option>
                <option value="user">Usuario</option>
                <option value="superadmin">Super usuario</option>
              </select>
            </label>
            <button className="primary-action" onClick={createUser} disabled={saving}>
              <Save size={17} />
              {saving ? "Salvando..." : "Criar acesso"}
            </button>
            {message ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{message}</p> : null}
          </div>
        </div>

        <div className="surface-panel overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-black text-slate-950">Acessos criados</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Pessoa</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Acesso</th>
                  <th className="px-4 py-3">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    {editingId === user.id ? (
                      <>
                        <td className="px-4 py-3"><input className="form-control min-w-44" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></td>
                        <td className="px-4 py-3"><input className="form-control min-w-36" value={editForm.username} onChange={(event) => setEditForm({ ...editForm, username: event.target.value })} /></td>
                        <td className="px-4 py-3">
                          <select className="form-control min-w-44" value={editForm.tenantId} onChange={(event) => setEditForm({ ...editForm, tenantId: event.target.value })}>
                            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.brandName}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select className="form-control min-w-32" value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}>
                            <option value="admin">admin</option>
                            <option value="user">user</option>
                            <option value="superadmin">superadmin</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="grid gap-2">
                            <ModulePicker compact value={editForm.moduleAccess} onChange={(moduleAccess) => setEditForm({ ...editForm, moduleAccess })} />
                            <input className="form-control min-w-40" type="password" placeholder="Nova senha opcional" value={editForm.password} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} />
                            <label className="flex items-center gap-2 text-xs font-black text-slate-600">
                              <input type="checkbox" checked={editForm.mustChangePassword} onChange={(event) => setEditForm({ ...editForm, mustChangePassword: event.target.checked })} />
                              Forcar troca
                            </label>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button className="icon-button" onClick={saveEdit} disabled={saving} title="Salvar"><Save size={16} /></button>
                            <button className="icon-button" onClick={() => setEditingId("")} title="Cancelar"><X size={16} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-black text-slate-900">{user.name}</td>
                        <td className="px-4 py-3 font-semibold text-slate-600">{user.username}</td>
                        <td className="px-4 py-3 font-semibold text-slate-600">{user.tenantName}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-black text-violet-700">{user.role}</span></td>
                        <td className="px-4 py-3">
                          <div className="grid gap-1">
                            <span className={user.mustChangePassword ? "rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-700" : "rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700"}>{user.mustChangePassword ? "Trocar senha" : "Ativo"}</span>
                            <span className="text-xs font-bold text-slate-500">{user.moduleAccess === "all" || !user.moduleAccess ? "Todos modulos" : "CRM"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button className="icon-button" onClick={() => startEdit(user)} title="Editar usuario"><Pencil size={16} /></button>
                            <button className="icon-button text-red-600" onClick={() => deleteUser(user)} title="Excluir usuario"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="surface-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">Auditoria</p>
            <h2 className="text-lg font-black text-slate-950">Logs por usuario</h2>
          </div>
          <select className="form-control max-w-xs" value={selectedLogUser} onChange={(event) => setSelectedLogUser(event.target.value)}>
            <option value="">Todos os usuarios</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name} - {user.username}</option>
            ))}
          </select>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Acao</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className={log.status === "error" ? "bg-red-50/70" : ""}>
                  <td className="px-4 py-3 font-semibold text-slate-600">{new Date(log.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 font-black text-slate-900">{log.user?.name || "Sistema"}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{log.action}</td>
                  <td className={log.status === "error" ? "px-4 py-3 font-black text-red-600" : "px-4 py-3 font-black text-emerald-700"}>{log.status}</td>
                  <td className="max-w-xl truncate px-4 py-3 text-slate-500">{log.message || log.metadata || log.entity || "-"}</td>
                </tr>
              ))}
              {!filteredLogs.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm font-bold text-slate-500">Nenhum log encontrado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
