"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Check, RotateCcw } from "lucide-react";
import { formatDate, money } from "@/lib/format";

type Account = {
  id: string;
  name: string;
  status: string;
};

type Transfer = {
  id: string;
  date: string;
  fromAccountName: string;
  toAccountName: string;
  amountCents: number;
  description: string;
  paymentMethod?: string | null;
  status: string;
  notes?: string | null;
};

const today = new Date().toISOString().slice(0, 10);

const blank = {
  date: today,
  fromAccountName: "PJ",
  toAccountName: "dinheiro",
  amount: "",
  description: "",
  paymentMethod: "Transferencia",
  notes: ""
};

export function TransfersWorkspace() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    const [accountsResponse, transfersResponse] = await Promise.all([
      fetch("/api/financialAccounts", { cache: "no-store" }),
      fetch("/api/transfers", { cache: "no-store" })
    ]);
    const [accountsData, transfersData] = await Promise.all([accountsResponse.json(), transfersResponse.json()]);
    const activeAccounts = (accountsData.items ?? []).filter((account: Account) => account.status === "ativa");
    setAccounts(activeAccounts);
    setTransfers(transfersData.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return transfers.filter((item) => !needle || JSON.stringify(item).toLowerCase().includes(needle));
  }, [query, transfers]);

  const activeTotal = transfers
    .filter((item) => item.status === "ACTIVE")
    .reduce((sum, item) => sum + item.amountCents, 0);

  async function save() {
    setSaving(true);
    const response = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount || 0)
      })
    });
    setSaving(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nao foi possivel criar a transferencia.");
      return;
    }
    setForm(blank);
    await load();
  }

  async function reverse(id: string) {
    if (!confirm("Estornar esta transferencia? As duas pernas no caixa serao canceladas.")) return;
    const response = await fetch(`/api/transfers?id=${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nao foi possivel estornar.");
      return;
    }
    await load();
  }

  function setField(key: keyof typeof blank, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <p className="eyebrow">Carteiras</p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Transferencias entre contas</h2>
            <p className="mt-1 text-sm text-slate-500">Move saldo entre carteiras sem virar receita ou despesa no dashboard.</p>
          </div>
          <div className="rounded-2xl bg-violet-50 px-4 py-3 text-right">
            <p className="text-xs font-bold uppercase text-violet-500">Total transferido ativo</p>
            <p className="text-lg font-black text-violet-700">{money.format(activeTotal / 100)}</p>
          </div>
        </div>
      </header>

      <section className="surface-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-100 text-violet-700">
            <ArrowRightLeft size={18} />
          </div>
          <div>
            <h3 className="font-bold text-slate-950">Nova transferencia</h3>
            <p className="text-sm text-slate-500">Exemplo: tirar do PJ e colocar no dinheiro, ou pagar cartao com a conta PJ.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Data</span>
            <input className="form-control" type="date" value={form.date} onChange={(event) => setField("date", event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Origem</span>
            <select className="form-control" value={form.fromAccountName} onChange={(event) => setField("fromAccountName", event.target.value)}>
              {accounts.map((account) => <option key={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Destino</span>
            <select className="form-control" value={form.toAccountName} onChange={(event) => setField("toAccountName", event.target.value)}>
              {accounts.map((account) => <option key={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Valor</span>
            <input className="form-control" type="number" step="0.01" value={form.amount} onChange={(event) => setField("amount", event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Forma</span>
            <select className="form-control" value={form.paymentMethod} onChange={(event) => setField("paymentMethod", event.target.value)}>
              {["Transferencia", "Pix", "Dinheiro", "Boleto", "Outro"].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="xl:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Descricao</span>
            <input className="form-control" value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Transferencia entre contas" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Observacoes</span>
            <input className="form-control" value={form.notes} onChange={(event) => setField("notes", event.target.value)} />
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <button className="primary-action" disabled={saving} onClick={save}>
            <Check size={17} />
            {saving ? "Salvando..." : "Salvar transferencia"}
          </button>
        </div>
      </section>

      <section className="surface-panel p-4">
        <input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar transferencias" />
      </section>

      <section className="grid gap-3">
        {loading ? <p className="surface-panel p-4 text-sm text-slate-500">Carregando transferencias...</p> : null}
        {!loading && filtered.length === 0 ? <p className="surface-panel p-4 text-sm text-slate-500">Nenhuma transferencia encontrada.</p> : null}
        {filtered.map((transfer) => (
          <article key={transfer.id} className="surface-panel p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${transfer.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {transfer.status}
                  </span>
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">
                    {formatDate(transfer.date)}
                  </span>
                </div>
                <h3 className="mt-2 font-bold text-slate-950">
                  {transfer.fromAccountName} &rarr; {transfer.toAccountName}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{transfer.description}</p>
              </div>
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <p className="text-xl font-black text-slate-950">{money.format(transfer.amountCents / 100)}</p>
                {transfer.status === "ACTIVE" ? (
                  <button className="secondary-action text-red-600" onClick={() => reverse(transfer.id)}>
                    <RotateCcw size={16} />
                    Estornar
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
