"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, RotateCcw, Tag, X } from "lucide-react";
import { formatDate, money } from "@/lib/format";

type BankTransaction = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  direction: "IN" | "OUT";
  accountName: string;
  categorySuggestion?: string | null;
  categorySuggestionSource?: string | null;
  suggestionConfidence?: number | null;
  counterpartyName?: string | null;
  counterpartyDocument?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  status: string;
  cashMovementLegacyId?: string | null;
};

type Batch = {
  id: string;
  filename: string;
  accountName: string;
  importedAt: string;
  insertedRows: number;
  duplicateRows: number;
  totalInCents: number;
  totalOutCents: number;
  status: string;
};

type Category = {
  id: string;
  name: string;
  type: string;
};

type CostCenter = {
  id: string;
  name: string;
};

const paymentMethods = ["Pix", "Transferencia", "Boleto", "Credito", "Debito", "Cartao", "Dinheiro"];

export function BankReconciliationWorkspace() {
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [status, setStatus] = useState("POSTED");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [paymentDraft, setPaymentDraft] = useState("");
  const [costCenterDraft, setCostCenterDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [transactionsResponse, batchesResponse, categoriesResponse, costCentersResponse] = await Promise.all([
      fetch("/api/bankTransactions", { cache: "no-store" }),
      fetch("/api/bankImportBatches", { cache: "no-store" }),
      fetch("/api/categories", { cache: "no-store" }),
      fetch("/api/costCenters", { cache: "no-store" })
    ]);
    const [transactionsData, batchesData, categoriesData, costCentersData] = await Promise.all([
      transactionsResponse.json(),
      batchesResponse.json(),
      categoriesResponse.json(),
      costCentersResponse.json()
    ]);
    setTransactions(transactionsData.items ?? []);
    setBatches(batchesData.items ?? []);
    setCategories(categoriesData.items ?? []);
    setCostCenters(costCentersData.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return transactions.filter((item) => {
      if (status !== "todos" && item.status !== status) return false;
      if (needle && !JSON.stringify(item).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [transactions, status, query]);

  const summary = useMemo(() => {
    const posted = transactions.filter((item) => item.status === "POSTED");
    const reviewed = transactions.filter((item) => item.status === "REVIEWED");
    const reversed = transactions.filter((item) => item.status === "REVERSED");
    return { posted: posted.length, reviewed: reviewed.length, reversed: reversed.length };
  }, [transactions]);

  async function updateStatus(id: string, nextStatus: string) {
    const response = await fetch("/api/bank-transactions/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: nextStatus })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nao foi possivel atualizar o lancamento bancario.");
      return;
    }
    await load();
  }

  function beginCategorize(item: BankTransaction) {
    setEditingId(item.id);
    setCategoryDraft(item.categorySuggestion || "");
    setPaymentDraft(item.paymentMethod || "");
    setCostCenterDraft("");
  }

  async function saveCategory(item: BankTransaction) {
    if (!categoryDraft) {
      alert("Escolha uma categoria para salvar.");
      return;
    }
    setSavingId(item.id);
    const response = await fetch("/api/bank-transactions/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        category: categoryDraft,
        paymentMethod: paymentDraft,
        costCenter: costCenterDraft,
        markReviewed: true
      })
    });
    setSavingId(null);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nao foi possivel categorizar o lancamento.");
      return;
    }
    setEditingId(null);
    await load();
  }

  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <p className="eyebrow">Banco</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Conciliacao bancaria</h2>
        <p className="mt-1 text-sm text-slate-500">Revise extratos importados, confirme classificacoes e estorne linhas importadas quando necessario.</p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="metric-card border-amber-200 bg-amber-50/70">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle size={17} />
            <p className="text-sm font-black">A revisar</p>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-700">{summary.posted}</p>
        </div>
        <div className="metric-card">
          <p className="text-sm font-semibold text-slate-500">Revisados</p>
          <p className="mt-2 text-2xl font-black text-emerald-700">{summary.reviewed}</p>
        </div>
        <div className="metric-card">
          <p className="text-sm font-semibold text-slate-500">Estornados</p>
          <p className="mt-2 text-2xl font-black text-red-600">{summary.reversed}</p>
        </div>
        <div className="metric-card">
          <p className="text-sm font-semibold text-slate-500">Lotes</p>
          <p className="mt-2 text-2xl font-black text-violet-700">{batches.length}</p>
        </div>
      </section>

      <section className="surface-panel grid gap-3 p-4 md:grid-cols-[1fr_180px]">
        <input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por descricao, conta ou categoria" />
        <select className="form-control" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="POSTED">A revisar</option>
          <option value="REVIEWED">Revisado</option>
          <option value="REVERSED">Estornado</option>
          <option value="todos">Todos</option>
        </select>
      </section>

      <section className="surface-panel overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h3 className="font-bold text-slate-950">Ultimos lotes importados</h3>
        </div>
        <div className="grid gap-2 p-4 md:grid-cols-2">
          {batches.slice(0, 6).map((batch) => (
            <div key={batch.id} className="rounded-2xl border border-slate-200 p-3">
              <p className="font-bold text-slate-900">{batch.filename}</p>
              <p className="mt-1 text-xs text-slate-500">{batch.accountName} - {formatDate(batch.importedAt)} - {batch.insertedRows} novos / {batch.duplicateRows} duplicados</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                + {money.format(batch.totalInCents / 100)} | - {money.format(batch.totalOutCents / 100)}
              </p>
            </div>
          ))}
          {!batches.length ? <p className="text-sm text-slate-500">Nenhum lote importado ainda.</p> : null}
        </div>
      </section>

      <section className="grid gap-3">
        {loading ? <p className="surface-panel p-4 text-sm text-slate-500">Carregando conciliacao...</p> : null}
        {!loading && filtered.length === 0 ? <p className="surface-panel p-4 text-sm text-slate-500">Nenhum lancamento encontrado.</p> : null}
        {filtered.map((item) => {
          const needsReview = item.status === "POSTED";
          const categoryOptions = categories.filter((category) => {
            if (item.direction === "IN") return category.type === "entrada" || category.type === "ambos";
            return category.type === "saida" || category.type === "ambos";
          });
          return (
          <article key={item.id} className={`surface-panel p-4 ${needsReview ? "border-amber-200 bg-amber-50/35" : ""}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{formatDate(item.date)}</span>
                  <span className={item.direction === "IN" ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700" : "rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600"}>
                    {item.direction === "IN" ? "Entrada" : "Saida"}
                  </span>
                  <span className={needsReview ? "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700" : "rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700"}>
                    {needsReview ? <AlertTriangle size={13} /> : null}
                    {needsReview ? "Revisar" : item.status}
                  </span>
                </div>
                <h3 className="mt-2 font-bold text-slate-950">{item.description}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {item.accountName} - {item.categorySuggestion || "A conferir"}{item.paymentMethod ? ` - ${item.paymentMethod}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">
                    Sugestao: {item.categorySuggestionSource || "Regra/IA"}
                  </span>
                  {item.suggestionConfidence ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">
                      Confianca: {Math.round(item.suggestionConfidence * 100)}%
                    </span>
                  ) : null}
                  {item.counterpartyName ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">
                      Nome: {item.counterpartyName}
                    </span>
                  ) : null}
                  {item.counterpartyDocument ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">
                      CNPJ/CPF: {item.counterpartyDocument}
                    </span>
                  ) : null}
                </div>
                {item.notes ? <p className="mt-2 max-w-3xl text-xs font-semibold text-slate-500">{item.notes}</p> : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
                <p className="text-xl font-black text-slate-950">{money.format(item.amountCents / 100)}</p>
                <button className="primary-action" onClick={() => beginCategorize(item)}>
                  <Tag size={16} />
                  Categorizar
                </button>
                {item.status === "POSTED" ? (
                  <button className="secondary-action text-emerald-700" onClick={() => updateStatus(item.id, "REVIEWED")}>
                    <Check size={16} />
                    Revisado
                  </button>
                ) : null}
                {item.status !== "REVERSED" ? (
                  <button className="secondary-action text-red-600" onClick={() => updateStatus(item.id, "REVERSED")}>
                    <RotateCcw size={16} />
                    Estornar
                  </button>
                ) : null}
              </div>
            </div>
            {editingId === item.id ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">Categorizar lancamento</p>
                    <p className="text-xs font-semibold text-slate-500">Ao salvar, o item fica revisado, o fluxo recebe a mesma categoria e a IA aprende para proximas importacoes.</p>
                  </div>
                  <button className="icon-action border border-slate-200 bg-white p-2 text-slate-500" onClick={() => setEditingId(null)} aria-label="Fechar">
                    <X size={16} />
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label>
                    <span className="mb-1 block text-xs font-black uppercase text-slate-500">Categoria</span>
                    <select className="form-control" value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)}>
                      <option value="">Selecione</option>
                      {categoryOptions.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-black uppercase text-slate-500">Forma</span>
                    <select className="form-control" value={paymentDraft} onChange={(event) => setPaymentDraft(event.target.value)}>
                      <option value="">A conferir</option>
                      {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-black uppercase text-slate-500">Centro</span>
                    <select className="form-control" value={costCenterDraft} onChange={(event) => setCostCenterDraft(event.target.value)}>
                      <option value="">Manter/sem centro</option>
                      {costCenters.map((center) => <option key={center.id} value={center.name}>{center.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={savingId === item.id} className="primary-action disabled:opacity-50" onClick={() => saveCategory(item)}>
                    <Check size={16} />
                    {savingId === item.id ? "Salvando..." : "Salvar e revisar"}
                  </button>
                  <button className="secondary-action" onClick={() => setEditingId(null)}>Cancelar</button>
                </div>
              </div>
            ) : null}
          </article>
        )})}
      </section>
    </div>
  );
}
