"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { money } from "@/lib/format";

type ImportResult = {
  error?: string;
  detectedHeaders?: string[];
  diagnostics?: any;
  batch?: {
    diagnostics?: any;
  };
  summary?: {
    totalInputs: number;
    totalOutputs: number;
    net: number;
    count: number;
    reviewCount: number;
    duplicates: number;
  };
  preview?: Array<Record<string, any>>;
  inserted?: number;
};

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [account, setAccount] = useState("PJ");
  const [accounts, setAccounts] = useState<Array<{ name: string; type?: string; status?: string }>>([]);
  const [useAi, setUseAi] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/financialAccounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const active = (data.items ?? []).filter((item: { status?: string }) => item.status !== "inativa" && item.status !== "cancelada");
        setAccounts(active);
        const pj = active.find((item: { name: string }) => item.name.toLowerCase() === "pj");
        if (active.length) setAccount((current) => current || pj?.name || active[0].name);
      })
      .catch(() => setAccounts([]));
  }, []);

  async function send(confirm: boolean) {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const form = new FormData();
    form.set("file", file);
    form.set("confirm", String(confirm));
    form.set("account", account);
    form.set("useAi", String(useAi));
    const response = await fetch("/api/import", { method: "POST", body: form });
    const text = await response.text();
    let data: ImportResult;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || "A importacao falhou sem retornar detalhes." };
    }
    setResult(data);
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <h1 className="text-2xl font-bold">Importacao de Extrato Bancario</h1>
        <p className="mt-1 text-sm text-muted">
          Aceita CSV, Excel/XLSX, OFX do banco e PDF com texto selecionavel. O sistema pre-visualiza, evita duplicidade e marca tudo para conferencia.
        </p>
      </header>

      <section className="surface-panel grid gap-4 p-5 md:grid-cols-[1fr_220px]">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Arquivo do extrato</span>
          <input
            type="file"
            accept=".csv,.txt,.ofx,.qfx,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
            }}
            className="form-control"
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-semibold">Conta do extrato</span>
          <select className="form-control" value={account} onChange={(event) => setAccount(event.target.value)}>
            {(accounts.length ? accounts : [{ name: "PJ" }, { name: "pessoal" }, { name: "dinheiro" }, { name: "cartao" }, { name: "outro" }]).map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}{option.type ? ` - ${option.type}` : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-semibold text-slate-500">Entradas e saidas importadas vao atualizar essa carteira.</span>
        </label>
        <label className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 md:col-span-2">
          <input
            type="checkbox"
            checked={useAi}
            onChange={(event) => setUseAi(event.target.checked)}
            className="mt-1 h-5 w-5 accent-violet-600"
          />
          <span>
            <span className="block text-sm font-black text-slate-900">Usar IA para classificar e identificar recorrencias</span>
            <span className="mt-1 block text-xs font-semibold text-slate-500">
              Sugere categoria, forma de pagamento, contato e recorrencia. Se a IA nao estiver configurada, o sistema usa as regras automaticas normais.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button disabled={!file || loading} onClick={() => send(false)} className="primary-action disabled:opacity-50">
            <Upload size={17} />
            Pre-visualizar
          </button>
          <button disabled={!result?.preview || loading} onClick={() => send(true)} className="secondary-action disabled:opacity-50">
            <CheckCircle2 size={17} />
            Confirmar importacao
          </button>
        </div>
      </section>

      {result ? (
        <section className="space-y-4">
          {result.error ? (
            <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <strong className="block text-base">Nao foi possivel importar.</strong>
              <span>{result.error}</span>
              {result.detectedHeaders?.length ? <p className="mt-2">Colunas detectadas: {result.detectedHeaders.join(", ")}</p> : null}
              {result.diagnostics ? (
                <details className="mt-3 rounded-xl border border-red-200 bg-white/70 p-3">
                  <summary className="cursor-pointer font-bold">Diagnostico do arquivo</summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify(result.diagnostics, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          ) : null}

          {result.summary ? (
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded border border-line bg-white p-4">
                <p className="text-sm text-muted">Entradas</p>
                <strong>{money.format(result.summary.totalInputs)}</strong>
              </div>
              <div className="rounded border border-line bg-white p-4">
                <p className="text-sm text-muted">Saidas</p>
                <strong>{money.format(result.summary.totalOutputs)}</strong>
              </div>
              <div className="rounded border border-line bg-white p-4">
                <p className="text-sm text-muted">Saldo liquido</p>
                <strong>{money.format(result.summary.net)}</strong>
              </div>
              <div className="rounded border border-line bg-white p-4">
                <p className="text-sm text-muted">Lancamentos</p>
                <strong>{result.summary.count}</strong>
              </div>
              <div className="rounded border border-line bg-white p-4">
                <p className="text-sm text-muted">A conferir</p>
                <strong>{result.summary.reviewCount}</strong>
              </div>
              <div className="rounded border border-line bg-white p-4">
                <p className="text-sm text-muted">Duplicados</p>
                <strong>{result.summary.duplicates}</strong>
              </div>
            </div>
          ) : null}

          {typeof result.inserted === "number" ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-900">
              {result.inserted} lancamentos importados e marcados para conferencia.
            </div>
          ) : null}

          {result.preview ? (
            <div className="overflow-hidden rounded border border-line bg-white shadow-sm">
              {result.batch?.diagnostics ? (
                <details className="border-b border-line bg-slate-50 p-3 text-sm">
                  <summary className="cursor-pointer font-bold text-slate-700">Diagnostico da leitura</summary>
                  <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(result.batch.diagnostics, null, 2)}</pre>
                </details>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-panel text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Descricao</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Forma</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Observacoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((row, index) => (
                      <tr key={`${row.importHash}-${index}`} className="border-t border-line">
                        <td className="px-4 py-3">{String(row.date).slice(0, 10)}</td>
                        <td className="px-4 py-3">{row.description}</td>
                        <td className="px-4 py-3">{row.type}</td>
                        <td className="px-4 py-3">{row.category}</td>
                        <td className="px-4 py-3">{row.paymentMethod || "-"}</td>
                        <td className="px-4 py-3">{money.format(row.amount)}</td>
                        <td className="px-4 py-3">{row.status}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{row.notes || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
