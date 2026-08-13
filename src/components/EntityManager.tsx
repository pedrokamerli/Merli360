"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { FieldConfig, ModelConfig } from "@/lib/models";
import { currentMonth, formatDate, money } from "@/lib/format";

type Row = Record<string, any>;
type LookupOption = { label: string; value: string };
type Lookups = { clients: LookupOption[]; categories: LookupOption[]; buyers: LookupOption[]; products: LookupOption[]; plantings: LookupOption[]; budgets: LookupOption[] };

function blank(fields: FieldConfig[]) {
  return Object.fromEntries(fields.map((field) => [field.key, field.type === "checkbox" ? false : ""]));
}

function normalizePayload(fields: FieldConfig[], data: Row) {
  const payload: Row = {};
  for (const field of fields) {
    const value = data[field.key];
    if (field.type === "number") payload[field.key] = value === "" || value === null ? 0 : Number(value);
    else if (field.type === "checkbox") payload[field.key] = Boolean(value);
    else if (field.type === "date") payload[field.key] = value || null;
    else payload[field.key] = value || null;
  }
  return payload;
}

function getColumnLabel(config: ModelConfig, key: string) {
  return config.fields.find((field) => field.key === key)?.label ?? key;
}

function displayValue(key: string, value: any, lookups: Lookups) {
  if (value === null || value === undefined || value === "") return "-";
  if (key === "clientId") return lookups.clients.find((client) => client.value === value)?.label ?? "-";
  if (key === "buyerId") return lookups.buyers.find((buyer) => buyer.value === value)?.label ?? "-";
  if (key === "productId") return lookups.products.find((product) => product.value === value)?.label ?? "-";
  if (key === "plantingId") return lookups.plantings.find((planting) => planting.value === value)?.label ?? "-";
  if (key === "budgetId") return lookups.budgets.find((budget) => budget.value === value)?.label ?? "-";
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  if (key.toLowerCase().includes("date") || key === "date" || key === "dueDate") return formatDate(value);
  if (key.endsWith("Cents") && typeof value === "number") return money.format(value / 100);
  if (typeof value === "number" && (key.toLowerCase().includes("amount") || key.toLowerCase().includes("value") || key === "gap")) {
    return money.format(value);
  }
  if (key === "closeChance" && typeof value === "number") return `${Math.round(value * 100)}%`;
  return String(value);
}

function fieldOptions(field: FieldConfig, lookups: Lookups) {
  if (field.optionSource === "clients") return lookups.clients;
  if (field.optionSource === "categories") return lookups.categories;
  if (field.optionSource === "buyers") return lookups.buyers;
  if (field.optionSource === "products") return lookups.products;
  if (field.optionSource === "plantings") return lookups.plantings;
  if (field.optionSource === "budgets") return lookups.budgets;
  return field.options?.map((option) => ({ label: option, value: option })) ?? [];
}

function isAttachmentField(key: string) {
  return ["attachmentUrl", "proofUrl", "fileUrl"].includes(key);
}

export function EntityManager({ config }: { config: ModelConfig }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [lookups, setLookups] = useState<Lookups>({ clients: [], categories: [], buyers: [], products: [], plantings: [], budgets: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [receiving, setReceiving] = useState<Row | null>(null);
  const [paying, setPaying] = useState<Row | null>(null);
  const [paymentInfo, setPaymentInfo] = useState({ account: "PJ", paymentMethod: "Pix", paidDate: new Date().toISOString().slice(0, 10) });
  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [dateMode, setDateMode] = useState<"due" | "paid">("due");
  const [statusFilter, setStatusFilter] = useState("todos");

  async function load() {
    setLoading(true);
    const [response, clientsResponse, categoriesResponse, buyersResponse, productsResponse, plantingsResponse, budgetsResponse] = await Promise.all([
      fetch(`/api/${config.api}`, { cache: "no-store" }),
      fetch("/api/clients", { cache: "no-store" }),
      fetch("/api/categories", { cache: "no-store" }),
      fetch("/api/buyers", { cache: "no-store" }),
      fetch("/api/products", { cache: "no-store" }),
      fetch("/api/plantings", { cache: "no-store" }),
      fetch("/api/budgets", { cache: "no-store" })
    ]);
    const [data, clientsData, categoriesData, buyersData, productsData, plantingsData, budgetsData] = await Promise.all([
      response.json(),
      clientsResponse.json(),
      categoriesResponse.json(),
      buyersResponse.json(),
      productsResponse.json(),
      plantingsResponse.json(),
      budgetsResponse.json()
    ]);
    setRows(data.items ?? []);
    setLookups({
      clients: (clientsData.items ?? []).map((client: Row) => ({ label: client.name, value: client.id })),
      categories: (categoriesData.items ?? []).map((category: Row) => ({ label: category.name, value: category.name })),
      buyers: (buyersData.items ?? []).map((buyer: Row) => ({ label: buyer.name, value: buyer.id })),
      products: (productsData.items ?? []).map((product: Row) => ({ label: product.name, value: product.id })),
      plantings: (plantingsData.items ?? []).map((planting: Row) => ({
        label: `${displayValue("productId", planting.productId, {
          clients: [],
          categories: [],
          buyers: [],
          products: (productsData.items ?? []).map((product: Row) => ({ label: product.name, value: product.id })),
          plantings: [],
          budgets: []
        })} - ${String(planting.plantingDate ?? "").slice(0, 10)}`,
        value: planting.id
      })),
      budgets: (budgetsData.items ?? []).map((budget: Row) => ({ label: `${budget.name} - ${budget.month} (${budget.scenario})`, value: budget.id }))
    });
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (needle && !JSON.stringify(row).toLowerCase().includes(needle)) return false;
      if ((config.api === "receivables" || config.api === "payables") && monthFilter) {
        const dateKey = dateMode === "paid" ? "paidDate" : "dueDate";
        const value = row[dateKey];
        if (!value || String(value).slice(0, 7) !== monthFilter) return false;
      }
      if ((config.api === "receivables" || config.api === "payables") && statusFilter !== "todos") {
        if (statusFilter === "atrasado") return isOverdue(row);
        if (row.status !== statusFilter) return false;
      }
      return true;
    });
  }, [rows, query, config.api, monthFilter, dateMode, statusFilter]);

  function isOverdue(row: Row) {
    if (row.status === "pago") return false;
    if (!row.dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(row.dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today;
  }

  function rowTone(row: Row) {
    if ((config.api === "receivables" || config.api === "payables") && isOverdue(row)) return "bg-red-50/80";
    return "";
  }

  async function save() {
    if (!editing) return;
    const missing = config.fields.find((field) => field.required && !editing[field.key]);
    if (missing) {
      alert(`Preencha: ${missing.label}`);
      return;
    }
    const method = editing.id ? "PUT" : "POST";
    const response = await fetch(`/api/${config.api}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing.id, data: normalizePayload(config.fields, editing) })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nao foi possivel salvar. Confira os campos obrigatorios.");
      return;
    }
    setEditing(null);
    await load();
  }

  async function uploadAttachment(fieldKey: string, file?: File | null) {
    if (!file || !editing) return;
    const form = new FormData();
    form.append("file", file);
    form.append("linkedModel", config.api);
    if (editing.id) form.append("linkedId", editing.id);

    const response = await fetch("/api/attachments/upload", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      alert(data?.error || "Nao foi possivel enviar o comprovante.");
      return;
    }
    setEditing({ ...editing, [fieldKey]: data.url });
  }

  async function remove(id: string) {
    if (!confirm("Excluir este registro?")) return;
    await fetch(`/api/${config.api}?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function markReceived() {
    if (!receiving) return;
    const response = await fetch("/api/receivables/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: receiving.id, ...paymentInfo })
    });
    if (!response.ok) {
      alert("Nao foi possivel marcar como recebido.");
      return;
    }
    setReceiving(null);
    await load();
  }

  async function markPayablePaid() {
    if (!paying) return;
    const response = await fetch("/api/payables/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: paying.id, ...paymentInfo })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nao foi possivel marcar como pago.");
      return;
    }
    setPaying(null);
    await load();
  }

  function actionButtons(row: Row) {
    return (
      <div className="flex flex-wrap gap-2">
        {config.api === "receivables" && row.status !== "pago" ? (
          <button className="secondary-action px-3 py-2 text-emerald-600" onClick={() => setReceiving(row)} title="Recebi">
            Recebi
          </button>
        ) : null}
        {config.api === "payables" && row.status !== "pago" ? (
          <button className="secondary-action px-3 py-2 text-emerald-600" onClick={() => setPaying(row)} title="Pago">
            Pago
          </button>
        ) : null}
        <button className="icon-action" onClick={() => setEditing(row)} title="Editar">
          <Pencil size={16} />
        </button>
        <button className="icon-action text-red-500" onClick={() => remove(row.id)} title="Excluir">
          <Trash2 size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="surface-panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Merli360</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">{config.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{config.description}</p>
        </div>
        <button onClick={() => setEditing(blank(config.fields))} className="primary-action">
          <Plus size={18} />
          Novo registro
        </button>
      </header>

      <div className="surface-panel flex items-center gap-3 px-4 py-3">
        <Search size={18} className="text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar por texto, mes, categoria, cliente ou status"
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      </div>

      {config.api === "receivables" || config.api === "payables" ? (
        <div className="surface-panel grid gap-3 p-4 md:grid-cols-[180px_220px_180px]">
          <label>
            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Mes</span>
            <input className="form-control" type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Filtrar por</span>
            <select className="form-control" value={dateMode} onChange={(event) => setDateMode(event.target.value as "due" | "paid")}>
              <option value="due">Vencimento</option>
              <option value="paid">{config.api === "receivables" ? "Recebimento" : "Pagamento"}</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Status</span>
            <select className="form-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="todos">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="atrasado">Atrasado</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {config.columns.map((column) => (
                  <th key={column} className="px-5 py-4">{getColumnLabel(config, column)}</th>
                ))}
                <th className="w-56 px-5 py-4">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-5 py-8 text-slate-500" colSpan={config.columns.length + 1}>Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="px-5 py-8 text-slate-500" colSpan={config.columns.length + 1}>Nenhum registro encontrado.</td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${rowTone(row)}`}>
                    {config.columns.map((column) => (
                      <td key={column} className={`px-5 py-4 align-top ${isOverdue(row) && column === "status" ? "font-bold text-red-600" : "text-slate-700"}`}>
                        {column === "status" && isOverdue(row) ? "atrasado" : displayValue(column, row[column], lookups)}
                      </td>
                    ))}
                    <td className="px-5 py-4">
                      {actionButtons(row)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 lg:hidden">
        {loading ? <p className="surface-panel p-4 text-sm text-slate-500">Carregando...</p> : null}
        {!loading && filtered.length === 0 ? <p className="surface-panel p-4 text-sm text-slate-500">Nenhum registro encontrado.</p> : null}
        {filtered.map((row) => (
          <article key={row.id} className={`surface-panel p-4 ${rowTone(row)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{config.title}</p>
                <h3 className="mt-1 font-bold text-slate-950">{displayValue(config.columns[1] ?? config.columns[0], row[config.columns[1] ?? config.columns[0]], lookups)}</h3>
              </div>
              {actionButtons(row)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {config.columns.slice(0, 6).map((column) => (
                <div key={column} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{getColumnLabel(config, column)}</p>
                  <p className="mt-1 font-semibold text-slate-800">{displayValue(column, row[column], lookups)}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow">Cadastro</p>
                <h3 className="text-xl font-bold text-slate-950">{editing.id ? "Editar registro" : "Novo registro"}</h3>
              </div>
              <button className="icon-action" onClick={() => setEditing(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {config.fields.map((field) => (
                <label key={field.key} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">{field.label}</span>
                  {isAttachmentField(field.key) ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editing[field.key] ?? ""}
                          onChange={(event) => setEditing({ ...editing, [field.key]: event.target.value })}
                          className="form-control"
                          placeholder="Cole um link ou envie um arquivo"
                        />
                        {editing[field.key] ? (
                          <a className="icon-action shrink-0" href={editing[field.key]} target="_blank" title="Abrir comprovante">
                            <ExternalLink size={16} />
                          </a>
                        ) : null}
                      </div>
                      <label className="secondary-action inline-flex cursor-pointer">
                        <Upload size={16} />
                        Enviar arquivo
                        <input className="hidden" type="file" accept="image/*,.pdf" onChange={(event) => uploadAttachment(field.key, event.target.files?.[0])} />
                      </label>
                    </div>
                  ) : field.type === "textarea" ? (
                    <textarea value={editing[field.key] ?? ""} onChange={(event) => setEditing({ ...editing, [field.key]: event.target.value })} className="form-control min-h-24" />
                  ) : field.type === "select" ? (
                    <select value={editing[field.key] ?? ""} onChange={(event) => setEditing({ ...editing, [field.key]: event.target.value })} className="form-control">
                      <option value="">Selecione</option>
                      {fieldOptions(field, lookups).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <input type="checkbox" checked={Boolean(editing[field.key])} onChange={(event) => setEditing({ ...editing, [field.key]: event.target.checked })} className="h-5 w-5 accent-violet-600" />
                  ) : (
                    <input
                      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                      step={field.type === "number" ? "0.01" : undefined}
                      value={
                        field.type === "date" && editing[field.key]
                          ? String(editing[field.key]).slice(0, 10)
                          : field.key.endsWith("Cents") && editing[field.key] !== "" && editing[field.key] !== null && editing[field.key] !== undefined
                            ? Number(editing[field.key]) / 100
                            : editing[field.key] ?? ""
                      }
                      onChange={(event) => setEditing({ ...editing, [field.key]: event.target.value })}
                      className="form-control"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="secondary-action" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="primary-action" onClick={save}>
                <Check size={17} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {receiving ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow">Recebimento</p>
                <h3 className="text-xl font-bold text-slate-950">Marcar como recebido</h3>
                <p className="mt-1 text-sm text-slate-500">{receiving.description} - {money.format(Number(receiving.amount ?? 0))}</p>
              </div>
              <button className="icon-action" onClick={() => setReceiving(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-4">
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Conta que recebeu</span>
                <select className="form-control" value={paymentInfo.account} onChange={(event) => setPaymentInfo({ ...paymentInfo, account: event.target.value })}>
                  {["PJ", "pessoal", "dinheiro", "cartao", "outro"].map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Forma de pagamento</span>
                <select className="form-control" value={paymentInfo.paymentMethod} onChange={(event) => setPaymentInfo({ ...paymentInfo, paymentMethod: event.target.value })}>
                  {["Pix", "Cartao", "Dinheiro", "Boleto", "Transferencia", "Outro"].map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Data do recebimento</span>
                <input className="form-control" type="date" value={paymentInfo.paidDate} onChange={(event) => setPaymentInfo({ ...paymentInfo, paidDate: event.target.value })} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="secondary-action" onClick={() => setReceiving(null)}>Cancelar</button>
              <button className="primary-action" onClick={markReceived}>
                <Check size={17} />
                Confirmar recebimento
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {paying ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow">Pagamento</p>
                <h3 className="text-xl font-bold text-slate-950">Marcar como pago</h3>
                <p className="mt-1 text-sm text-slate-500">{paying.description} - {money.format(Number(paying.amount ?? 0))}</p>
              </div>
              <button className="icon-action" onClick={() => setPaying(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-4">
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Conta que pagou</span>
                <select className="form-control" value={paymentInfo.account} onChange={(event) => setPaymentInfo({ ...paymentInfo, account: event.target.value })}>
                  {["PJ", "pessoal", "dinheiro", "cartao", "outro"].map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Forma de pagamento</span>
                <select className="form-control" value={paymentInfo.paymentMethod} onChange={(event) => setPaymentInfo({ ...paymentInfo, paymentMethod: event.target.value })}>
                  {["Pix", "Cartao", "Dinheiro", "Boleto", "Transferencia", "Outro"].map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Data do pagamento</span>
                <input className="form-control" type="date" value={paymentInfo.paidDate} onChange={(event) => setPaymentInfo({ ...paymentInfo, paidDate: event.target.value })} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="secondary-action" onClick={() => setPaying(null)}>Cancelar</button>
              <button className="primary-action" onClick={markPayablePaid}>
                <Check size={17} />
                Confirmar pagamento
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
