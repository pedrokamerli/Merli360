"use client";

import { useEffect, useState } from "react";
import { Save, UserRound } from "lucide-react";

type Account = {
  name: string;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  document?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  notes?: string | null;
};

const emptyForm = {
  name: "",
  email: "",
  whatsapp: "",
  phone: "",
  document: "",
  address: "",
  addressNumber: "",
  district: "",
  city: "",
  state: "",
  zipCode: "",
  notes: ""
};

export function UserAccountSettings() {
  const [account, setAccount] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/account/settings", { cache: "no-store" });
    const data = await response.json();
    if (data.account) {
      setAccount(data.account);
      setForm({
        name: data.account.name || "",
        email: data.account.email || "",
        whatsapp: data.account.whatsapp || "",
        phone: data.account.phone || "",
        document: data.account.document || "",
        address: data.account.address || "",
        addressNumber: data.account.addressNumber || "",
        district: data.account.district || "",
        city: data.account.city || "",
        state: data.account.state || "",
        zipCode: data.account.zipCode || "",
        notes: data.account.notes || ""
      });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/account/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Nao foi possivel salvar sua conta.");
    } else {
      setAccount(data.account);
      setForm({
        name: data.account.name || "",
        email: data.account.email || "",
        whatsapp: data.account.whatsapp || "",
        phone: data.account.phone || "",
        document: data.account.document || "",
        address: data.account.address || "",
        addressNumber: data.account.addressNumber || "",
        district: data.account.district || "",
        city: data.account.city || "",
        state: data.account.state || "",
        zipCode: data.account.zipCode || "",
        notes: data.account.notes || ""
      });
      setMessage("Dados pessoais salvos.");
    }
    setSaving(false);
  }

  return (
    <section className="surface-panel p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-700">
          <UserRound size={22} />
        </div>
        <div>
          <p className="eyebrow">Perfil</p>
          <h2 className="text-lg font-black text-slate-950">Dados pessoais</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Informacoes basicas para contato e identificacao dentro do sistema.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Nome completo</span>
          <input className="form-control" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">WhatsApp</span>
          <input className="form-control" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} placeholder="(00) 00000-0000" inputMode="tel" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Telefone</span>
          <input className="form-control" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Telefone secundario" inputMode="tel" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">E-mail</span>
          <input className="form-control" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="email@exemplo.com" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">CPF/CNPJ</span>
          <input className="form-control" value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">CEP</span>
          <input className="form-control" value={form.zipCode} onChange={(event) => setForm({ ...form, zipCode: event.target.value })} inputMode="numeric" />
        </label>
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Endereco</span>
          <input className="form-control" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Rua, avenida, sitio, fazenda..." />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Numero/complemento</span>
          <input className="form-control" value={form.addressNumber} onChange={(event) => setForm({ ...form, addressNumber: event.target.value })} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Bairro</span>
          <input className="form-control" value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Cidade</span>
          <input className="form-control" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Estado</span>
          <input className="form-control" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} maxLength={2} placeholder="SP" />
        </label>
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Observacoes</span>
          <textarea className="form-control min-h-24" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Informacoes importantes para suporte, contato ou atendimento." />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="primary-action" onClick={save} disabled={saving}>
          <Save size={17} />
          {saving ? "Salvando..." : "Salvar dados pessoais"}
        </button>
        {message ? <span className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{message}</span> : null}
      </div>
    </section>
  );
}
