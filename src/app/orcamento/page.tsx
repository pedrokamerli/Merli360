import { EntityManager } from "@/components/EntityManager";
import { requireUser } from "@/lib/auth";
import { currentMonth, money, monthBounds } from "@/lib/format";
import { modelConfigs } from "@/lib/models";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const month = params.month ?? currentMonth();
  const { start, end } = monthBounds(month);

  const [budgets, cashMovements] = await Promise.all([
    prisma.budget.findMany({
      where: { tenantId: user.tenantId, month },
      include: { lines: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.cashMovement.findMany({
      where: { tenantId: user.tenantId, date: { gte: start, lt: end }, status: "ACTIVE", source: { not: "TRANSFER" } }
    })
  ]);

  const budgeted = budgets.flatMap((budget) => budget.lines).reduce((sum, line) => sum + line.budgetedCents, 0) / 100;
  const realizedInputs = cashMovements.filter((item) => item.direction === "IN").reduce((sum, item) => sum + item.amountCents / 100, 0);
  const realizedOutputs = cashMovements.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + item.amountCents / 100, 0);
  const realized = realizedInputs + realizedOutputs;
  const variance = budgeted - realized;

  return (
    <div className="space-y-6">
      <header className="surface-panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Financeiro</p>
          <h1 className="text-2xl font-black text-slate-950">Orcamento</h1>
          <p className="mt-1 text-sm text-slate-500">Compare valores orcados com entradas e saidas realizadas no mes.</p>
        </div>
        <form className="flex items-center gap-2">
          <input name="month" type="month" defaultValue={month} className="form-control w-44" />
          <button className="primary-action">Filtrar</button>
        </form>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-muted">Orcado</p>
          <strong>{money.format(budgeted)}</strong>
        </div>
        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-muted">Realizado</p>
          <strong>{money.format(realized)}</strong>
        </div>
        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-muted">Entradas realizadas</p>
          <strong>{money.format(realizedInputs)}</strong>
        </div>
        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-muted">Saldo do orcamento</p>
          <strong className={variance >= 0 ? "text-emerald-700" : "text-red-600"}>{money.format(variance)}</strong>
        </div>
      </section>

      <EntityManager config={modelConfigs.budgets} />
      <EntityManager config={modelConfigs.budgetLines} />
    </div>
  );
}
