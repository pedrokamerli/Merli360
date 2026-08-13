import Link from "next/link";
import { AlertTriangle, BrainCircuit, CheckCircle2, FileWarning, Paperclip } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDate, money } from "@/lib/format";
import { getPendingCenter } from "@/lib/pending-center";

const severityClass = {
  high: "border-rose-200 bg-rose-50 text-rose-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600"
};

const sourceIcon = {
  assistantPlan: BrainCircuit,
  attachment: Paperclip,
  bankTransaction: FileWarning,
  cashMovement: FileWarning,
  financialTitle: AlertTriangle,
  accountReceivable: AlertTriangle,
  accountPayable: AlertTriangle,
  product: AlertTriangle,
  planting: AlertTriangle,
  sale: AlertTriangle
};

export default async function PendenciasPage() {
  const user = await requireUser();
  const pending = await getPendingCenter(user.tenantId, {
    userId: user.id,
    tenantKind: user.tenant.kind
  });

  const cards = [
    { label: "Pendencias", value: pending.summary.total, tone: "text-violet-700", hint: "total para revisar" },
    { label: "Criticas", value: pending.summary.high, tone: "text-rose-600", hint: "vencidas ou travadas" },
    { label: "Extratos", value: pending.summary.reviewBankTransactions, tone: "text-amber-600", hint: "movimentos a conciliar" },
    { label: "IA", value: pending.summary.pendingAiPlans, tone: "text-indigo-600", hint: "acoes aguardando" }
  ];

  return (
    <main className="space-y-6 pb-24">
      <section className="page-header">
        <div>
          <p className="eyebrow">Central operacional</p>
          <h1 className="text-3xl font-black text-slate-950">Pendencias</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
            Tudo que precisa de revisao antes de entrar limpo no caixa, relatórios e assistente.
          </p>
        </div>
        <Link href="/ia" className="btn-primary">
          Abrir IA
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="metric-card">
            <div className="metric-icon bg-violet-100 text-violet-700">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="metric-label">{card.label}</p>
              <strong className={`metric-value ${card.tone}`}>{card.value}</strong>
              <p className="metric-note">{card.hint}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="panel p-0">
        <div className="border-b border-slate-200 p-5">
          <p className="eyebrow">Revisao</p>
          <h2 className="text-xl font-black text-slate-950">Fila de acoes</h2>
        </div>

        {pending.items.length ? (
          <div className="divide-y divide-slate-100">
            {pending.items.map((item) => {
              const Icon = sourceIcon[item.source as keyof typeof sourceIcon] || AlertTriangle;
              return (
                <Link key={item.id} href={item.href} className="grid gap-3 p-4 transition hover:bg-slate-50 md:grid-cols-[auto_1fr_auto] md:items-center">
                  <span className={`grid h-11 w-11 place-items-center rounded-2xl border ${severityClass[item.severity]}`}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-slate-950">{item.title}</strong>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-black uppercase ${severityClass[item.severity]}`}>
                        {item.type}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-slate-500">{item.description}</span>
                    {item.date ? <span className="mt-1 block text-xs font-bold text-slate-400">{formatDate(item.date)}</span> : null}
                  </span>
                  <span className="text-left md:text-right">
                    {typeof item.amountCents === "number" ? (
                      <strong className={item.amountCents < 0 ? "text-rose-600" : "text-emerald-600"}>
                        {money.format(item.amountCents / 100)}
                      </strong>
                    ) : null}
                    <span className="block text-xs font-black uppercase text-violet-600">Resolver</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="grid place-items-center gap-3 p-10 text-center">
            <CheckCircle2 className="text-emerald-500" size={42} />
            <div>
              <h2 className="text-xl font-black text-slate-950">Tudo limpo por aqui</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Quando a IA, os extratos ou as contas precisarem de revisao, elas aparecem aqui.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
