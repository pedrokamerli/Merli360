"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, RefreshCw } from "lucide-react";
import { currentMonth } from "@/lib/format";

const reports = {
  cashMovements: {
    title: "Fluxo Realizado",
    columns: [
      ["date", "Data"],
      ["directionLabel", "Tipo"],
      ["description", "Descricao"],
      ["accountName", "Conta"],
      ["category", "Categoria"],
      ["costCenter", "Centro"],
      ["amount", "Valor"],
      ["source", "Origem"],
      ["status", "Status"]
    ]
  },
  financialTitles: {
    title: "Titulos Financeiros",
    columns: [
      ["typeLabel", "Tipo"],
      ["description", "Descricao"],
      ["contactName", "Contato"],
      ["category", "Categoria"],
      ["dueDate", "Vencimento"],
      ["originalAmount", "Valor original"],
      ["openAmount", "Saldo aberto"],
      ["status", "Status"]
    ]
  },
  bankTransactions: {
    title: "Extrato Bancario",
    columns: [
      ["date", "Data"],
      ["directionLabel", "Tipo"],
      ["description", "Descricao"],
      ["accountName", "Conta"],
      ["categorySuggestion", "Categoria sugerida"],
      ["amount", "Valor"],
      ["status", "Status"]
    ]
  },
  transfers: {
    title: "Transferencias",
    columns: [
      ["date", "Data"],
      ["fromAccountName", "Origem"],
      ["toAccountName", "Destino"],
      ["amount", "Valor"],
      ["description", "Descricao"],
      ["status", "Status"]
    ]
  },
  budgetVariance: {
    title: "Orcado x Realizado",
    columns: [
      ["category", "Categoria"],
      ["type", "Tipo"],
      ["budgeted", "Orcado"],
      ["realized", "Realizado"],
      ["variance", "Diferenca"]
    ]
  },
  categorySummary: {
    title: "Resumo por Categoria",
    columns: [
      ["category", "Categoria"],
      ["directionLabel", "Tipo principal"],
      ["inputs", "Entradas"],
      ["outputs", "Saidas"],
      ["net", "Resultado"],
      ["entries", "Lancamentos"],
      ["share", "% das saidas"],
      ["budgeted", "Orcado"],
      ["variance", "Diferenca"]
    ]
  },
  clients: {
    title: "Contatos",
    columns: [
      ["name", "Contato"],
      ["type", "Modelo"],
      ["monthlyValue", "Valor recorrente"],
      ["dueDay", "Vencimento"],
      ["status", "Status"],
      ["mainChannel", "Origem"],
      ["perceivedProfit", "Rentabilidade"]
    ]
  },
  receivables: {
    title: "Contas a Receber",
    columns: [
      ["clientName", "Contato"],
      ["description", "Descricao"],
      ["amount", "Valor"],
      ["dueDate", "Vencimento"],
      ["paidDate", "Recebimento"],
      ["status", "Status"],
      ["type", "Tipo"]
    ]
  },
  payables: {
    title: "Contas a Pagar",
    columns: [
      ["description", "Descricao"],
      ["category", "Categoria"],
      ["amount", "Valor"],
      ["dueDate", "Vencimento"],
      ["paidDate", "Pagamento"],
      ["status", "Status"],
      ["recurring", "Recorrente"]
    ]
  },
  invoices: {
    title: "Notas Fiscais",
    columns: [
      ["clientName", "Contato"],
      ["referenceMonth", "Mes"],
      ["serviceDescription", "Servico"],
      ["amount", "Valor"],
      ["expectedIssueDate", "Previsao"],
      ["issueDate", "Emissao"],
      ["status", "Status"]
    ]
  },
  transactions: {
    title: "Fluxo Legado",
    columns: [
      ["date", "Data"],
      ["description", "Descricao"],
      ["type", "Tipo"],
      ["category", "Categoria"],
      ["clientName", "Contato"],
      ["amount", "Valor"],
      ["status", "Status"],
      ["account", "Conta"]
    ]
  }
} as const;

type ReportKey = keyof typeof reports;
type ReportRow = Record<string, string>;

export function ReportExplorer() {
  const [model, setModel] = useState<ReportKey>("cashMovements");
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<string[]>(reports.cashMovements.columns.map(([key]) => key));
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  const columns = reports[model].columns;
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (selected.length) params.set("columns", selected.join(","));
    return params.toString();
  }, [month, status, category, selected]);

  useEffect(() => {
    setSelected(reports[model].columns.map(([key]) => key));
    setStatus("");
    setCategory("");
  }, [model]);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/report-data/${model}?${queryString}`, { cache: "no-store" });
    const data = await response.json();
    setRows(data.rows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [model, queryString]);

  function toggleColumn(key: string) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  return (
    <section className="surface-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Relatorios</p>
          <h2 className="text-xl font-black text-slate-950">Visualizar e exportar</h2>
        </div>
        <a className="primary-action" href={`/api/export/${model}?${queryString}`}>
          <Download size={17} />
          Exportar selecionado
        </a>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[240px_180px_180px_1fr_auto]">
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Relatorio</span>
          <select className="form-control" value={model} onChange={(event) => setModel(event.target.value as ReportKey)}>
            {Object.entries(reports).map(([key, report]) => (
              <option key={key} value={key}>
                {report.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Mes</span>
          <input className="form-control" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Status</span>
          <select className="form-control" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="atrasado">Atrasado</option>
            <option value="conferencia">Conferencia</option>
            <option value="ativo">Ativo</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Categoria ou descricao</span>
          <input
            className="form-control"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Ex: Alimentacao, Pix, Santander..."
          />
        </label>
        <button className="secondary-action mt-5 justify-center" type="button" onClick={load}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {columns.map(([key, label]) => (
          <label key={key} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={selected.includes(key)} onChange={() => toggleColumn(key)} className="accent-violet-600" />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <Eye size={16} />
            {loading ? "Carregando..." : `${rows.length} registros`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {columns
                  .filter(([key]) => selected.includes(key))
                  .map(([key, label]) => (
                    <th key={key} className="px-4 py-3">
                      {label}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className={row.status === "atrasado" ? "border-t border-red-100 bg-red-50/80" : "border-t border-slate-100"}>
                  {columns
                    .filter(([key]) => selected.includes(key))
                    .map(([key]) => (
                      <td key={key} className={row.status === "atrasado" && key === "status" ? "px-4 py-3 font-bold text-red-600" : "px-4 py-3 text-slate-700"}>
                        {row[key]}
                      </td>
                    ))}
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={Math.max(selected.length, 1)}>
                    Nenhum registro para os filtros selecionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
