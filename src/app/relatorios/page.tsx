import Link from "next/link";
import { FileDown } from "lucide-react";
import { ReportExplorer } from "@/components/ReportExplorer";
import { getDashboard } from "@/lib/dashboard";
import { currentMonth, money } from "@/lib/format";

export const dynamic = "force-dynamic";

const reports = [
  ["cashMovements", "Fluxo realizado"],
  ["financialTitles", "Titulos financeiros"],
  ["bankTransactions", "Extrato bancario importado"],
  ["budgetVariance", "Orcado versus realizado"],
  ["categorySummary", "Resumo por categoria"],
  ["transfers", "Transferencias"],
  ["clients", "Relatorio por contato"],
  ["receivables", "Contas a receber"],
  ["payables", "Contas a pagar"],
  ["invoices", "Notas fiscais"]
];

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const month = params.month ?? currentMonth();
  const data = await getDashboard(month);

  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <h1 className="text-2xl font-bold text-slate-950">Relatorios</h1>
        <p className="mt-1 text-sm text-slate-500">Resumo financeiro, extrato, titulos, contas, contatos e orcamento.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="metric-card">
          <p className="text-sm text-slate-500">Receitas</p>
          <strong>{money.format(data.totalRevenue)}</strong>
        </div>
        <div className="metric-card">
          <p className="text-sm text-slate-500">Despesas</p>
          <strong>{money.format(data.monthOutputs)}</strong>
        </div>
        <div className="metric-card">
          <p className="text-sm text-slate-500">Saldo</p>
          <strong>{money.format(data.monthBalance)}</strong>
        </div>
        <div className="metric-card">
          <p className="text-sm text-slate-500">Notas pendentes</p>
          <strong>{data.invoicesToIssue}</strong>
        </div>
      </section>

      <ReportExplorer />

      <section className="surface-panel p-5">
        <h2 className="text-xl font-bold text-slate-950">Exportacoes CSV rapidas</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {reports.map(([model, label]) => (
            <Link
              key={model}
              href={`/api/export/${model}?month=${month}`}
              className="inline-flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold hover:bg-slate-50"
            >
              {label}
              <FileDown size={18} />
            </Link>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-500">Para PDF, abra o relatorio pronto e use imprimir/salvar PDF no navegador.</p>
      </section>
    </div>
  );
}
