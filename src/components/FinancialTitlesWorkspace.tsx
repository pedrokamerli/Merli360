"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { formatDate, money } from "@/lib/format";

type Row = Record<string, any>;

type TitleRow = Row & {
  id: string;
  type: "RECEIVABLE" | "PAYABLE";
  description: string;
  category: string;
  dueDate: string;
  originalAmountCents: number;
  status: string;
  contactLegacyId?: string | null;
};

type SettlementRow = Row & {
  id: string;
  titleId: string;
  effectiveDate: string;
  accountName: string;
  principalAmountCents: number;
  effectiveAmountCents: number;
  discountCents: number;
  writeOffCents: number;
  status: string;
};

const defaultPayment = {
  accountName: "PJ",
  paymentMethod: "Pix",
  effectiveDate: new Date().toISOString().slice(0, 10),
  principalAmount: "",
  interestAmount: "0",
  fineAmount: "0",
  discountAmount: "0",
  feeAmount: "0",
  writeOffAmount: "0",
  notes: ""
};

function activeSettlementValue(settlement: SettlementRow) {
  if (settlement.status !== "ACTIVE") return 0;
  return (settlement.principalAmountCents || 0) + (settlement.discountCents || 0) + (settlement.writeOffCents || 0);
}

function titleOpenCents(title: TitleRow, settlements: SettlementRow[]) {
  const settled = settlements.filter((item) => item.titleId === title.id).reduce((sum, item) => sum + activeSettlementValue(item), 0);
  return Math.max((title.originalAmountCents || 0) - settled, 0);
}

function badgeTone(status: string) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "PARTIAL") return "bg-amber-50 text-amber-700";
  if (status === "CANCELED" || status === "REVERSED") return "bg-slate-100 text-slate-500";
  return "bg-violet-50 text-violet-700";
}

export function FinancialTitlesWorkspace() {
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [clients, setClients] = useState<Row[]>([]);
  const [settling, setSettling] = useState<TitleRow | null>(null);
  const [payment, setPayment] = useState(defaultPayment);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("abertos");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [titlesResponse, settlementsResponse, clientsResponse] = await Promise.all([
      fetch("/api/financialTitles", { cache: "no-store" }),
      fetch("/api/settlements", { cache: "no-store" }),
      fetch("/api/clients", { cache: "no-store" })
    ]);
    const [titlesData, settlementsData, clientsData] = await Promise.all([
      titlesResponse.json(),
      settlementsResponse.json(),
      clientsResponse.json()
    ]);
    setTitles(titlesData.items ?? []);
    setSettlements(settlementsData.items ?? []);
    setClients(clientsData.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const decorated = useMemo(
    () =>
      titles.map((title) => ({
        ...title,
        openCents: titleOpenCents(title, settlements),
        contactName: clients.find((client) => client.id === title.contactLegacyId)?.name ?? "-"
      })),
    [titles, settlements, clients]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return decorated.filter((title) => {
      if (needle && !JSON.stringify(title).toLowerCase().includes(needle)) return false;
      if (typeFilter !== "todos" && title.type !== typeFilter) return false;
      if (statusFilter === "abertos" && !["OPEN", "PARTIAL"].includes(title.status)) return false;
      if (statusFilter !== "todos" && statusFilter !== "abertos" && title.status !== statusFilter) return false;
      return true;
    });
  }, [decorated, query, typeFilter, statusFilter]);

  const summary = useMemo(() => {
    const openReceivables = decorated.filter((title) => title.type === "RECEIVABLE").reduce((sum, title) => sum + title.openCents, 0);
    const openPayables = decorated.filter((title) => title.type === "PAYABLE").reduce((sum, title) => sum + title.openCents, 0);
    const activeSettlements = settlements.filter((item) => item.status === "ACTIVE");
    const settledIn = activeSettlements
      .filter((item) => titles.find((title) => title.id === item.titleId)?.type === "RECEIVABLE")
      .reduce((sum, item) => sum + item.effectiveAmountCents, 0);
    const settledOut = activeSettlements
      .filter((item) => titles.find((title) => title.id === item.titleId)?.type === "PAYABLE")
      .reduce((sum, item) => sum + item.effectiveAmountCents, 0);
    return { openReceivables, openPayables, settledIn, settledOut };
  }, [decorated, settlements, titles]);

  function startSettlement(title: TitleRow & { openCents: number }) {
    setSettling(title);
    setPayment({ ...defaultPayment, principalAmount: String(title.openCents / 100) });
  }

  async function settle() {
    if (!settling) return;
    const response = await fetch("/api/financial-titles/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titleId: settling.id,
        ...payment,
        principalAmount: Number(payment.principalAmount || 0),
        interestAmount: Number(payment.interestAmount || 0),
        fineAmount: Number(payment.fineAmount || 0),
        discountAmount: Number(payment.discountAmount || 0),
        feeAmount: Number(payment.feeAmount || 0),
        writeOffAmount: Number(payment.writeOffAmount || 0)
      })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nao foi possivel baixar o titulo.");
      return;
    }
    setSettling(null);
    await load();
  }

  async function reverse(settlementId: string) {
    if (!confirm("Estornar esta baixa? O movimento de caixa sera cancelado e o saldo do titulo reaberto.")) return;
    const response = await fetch("/api/settlements/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settlementId })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nao foi possivel estornar.");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <p className="eyebrow">Financeiro</p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Titulos, baixas e estornos</h2>
            <p className="mt-1 text-sm text-slate-500">Controle saldo aberto, baixa parcial, baixa total e estorno auditavel.</p>
          </div>
          <button className="secondary-action" onClick={load}>Atualizar</button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["A receber aberto", summary.openReceivables],
          ["A pagar aberto", summary.openPayables],
          ["Recebido em baixas", summary.settledIn],
          ["Pago em baixas", summary.settledOut]
        ].map(([label, value]) => (
          <div key={String(label)} className="metric-card">
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{money.format(Number(value) / 100)}</p>
          </div>
        ))}
      </div>

      <div className="surface-panel grid gap-3 p-4 md:grid-cols-[1fr_170px_170px]">
        <input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por descricao, contato ou categoria" />
        <select className="form-control" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="todos">Todos os tipos</option>
          <option value="RECEIVABLE">A receber</option>
          <option value="PAYABLE">A pagar</option>
        </select>
        <select className="form-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="abertos">Abertos</option>
          <option value="todos">Todos</option>
          <option value="OPEN">Aberto</option>
          <option value="PARTIAL">Parcial</option>
          <option value="PAID">Quitado</option>
          <option value="CANCELED">Cancelado</option>
        </select>
      </div>

      <div className="grid gap-3">
        {loading ? <p className="surface-panel p-4 text-sm text-slate-500">Carregando titulos...</p> : null}
        {!loading && filtered.length === 0 ? <p className="surface-panel p-4 text-sm text-slate-500">Nenhum titulo encontrado.</p> : null}
        {filtered.map((title) => {
          const titleSettlements = settlements.filter((item) => item.titleId === title.id);
          return (
            <article key={title.id} className="surface-panel overflow-hidden">
              <div className="grid gap-4 p-4 lg:grid-cols-[1.3fr_140px_140px_140px_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeTone(title.status)}`}>{title.status}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                      {title.type === "RECEIVABLE" ? "A receber" : "A pagar"}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-slate-950">{title.description}</h3>
                  <p className="mt-1 text-sm text-slate-500">{title.contactName} - {title.category} - vence em {formatDate(title.dueDate)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">Original</p>
                  <p className="mt-1 font-bold text-slate-800">{money.format(title.originalAmountCents / 100)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">Aberto</p>
                  <p className="mt-1 font-bold text-slate-950">{money.format(title.openCents / 100)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">Baixas</p>
                  <p className="mt-1 font-bold text-slate-800">{titleSettlements.filter((item) => item.status === "ACTIVE").length}</p>
                </div>
                <button className="primary-action justify-center" disabled={title.openCents <= 0 || title.status === "CANCELED"} onClick={() => startSettlement(title)}>
                  <Check size={17} />
                  Baixar
                </button>
              </div>

              {titleSettlements.length ? (
                <div className="border-t border-slate-100 bg-slate-50/70 p-4">
                  <p className="mb-3 text-xs font-bold uppercase text-slate-500">Historico de baixas</p>
                  <div className="grid gap-2">
                    {titleSettlements.map((settlement) => (
                      <div key={settlement.id} className="flex flex-col gap-2 rounded-xl bg-white p-3 text-sm md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">
                            {formatDate(settlement.effectiveDate)} - {settlement.accountName} - {money.format(settlement.effectiveAmountCents / 100)}
                          </p>
                          <p className="text-xs text-slate-500">
                            Principal {money.format(settlement.principalAmountCents / 100)} | Status {settlement.status}
                          </p>
                        </div>
                        {settlement.status === "ACTIVE" ? (
                          <button className="secondary-action text-red-600" onClick={() => reverse(settlement.id)}>
                            <RotateCcw size={16} />
                            Estornar
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {settling ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow">{settling.type === "RECEIVABLE" ? "Recebimento" : "Pagamento"}</p>
                <h3 className="text-xl font-bold text-slate-950">Baixar titulo</h3>
                <p className="mt-1 text-sm text-slate-500">{settling.description}</p>
              </div>
              <button className="icon-action" onClick={() => setSettling(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Conta</span>
                <select className="form-control" value={payment.accountName} onChange={(event) => setPayment({ ...payment, accountName: event.target.value })}>
                  {["PJ", "pessoal", "dinheiro", "cartao", "outro"].map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Forma de pagamento</span>
                <select className="form-control" value={payment.paymentMethod} onChange={(event) => setPayment({ ...payment, paymentMethod: event.target.value })}>
                  {["Pix", "Dinheiro", "Credito", "Debito", "Boleto", "Transferencia", "Outro"].map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Data efetiva</span>
                <input className="form-control" type="date" value={payment.effectiveDate} onChange={(event) => setPayment({ ...payment, effectiveDate: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Valor principal</span>
                <input className="form-control" type="number" step="0.01" value={payment.principalAmount} onChange={(event) => setPayment({ ...payment, principalAmount: event.target.value })} />
              </label>
              {[
                ["interestAmount", "Juros"],
                ["fineAmount", "Multa"],
                ["discountAmount", "Desconto"],
                ["feeAmount", "Tarifa"],
                ["writeOffAmount", "Abatimento/perda"]
              ].map(([key, label]) => (
                <label key={key}>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
                  <input className="form-control" type="number" step="0.01" value={(payment as any)[key]} onChange={(event) => setPayment({ ...payment, [key]: event.target.value })} />
                </label>
              ))}
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Observacoes</span>
                <textarea className="form-control min-h-24" value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="secondary-action" onClick={() => setSettling(null)}>Cancelar</button>
              <button className="primary-action" onClick={settle}>
                <Check size={17} />
                Confirmar baixa
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
