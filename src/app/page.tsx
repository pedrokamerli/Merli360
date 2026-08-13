import { MetricCard } from "@/components/MetricCard";
import { DashboardAutoRefresh } from "@/components/DashboardAutoRefresh";
import { DashboardSetupActions } from "@/components/DashboardSetupActions";
import { SimpleBarChart } from "@/components/SimpleBarChart";
import { WalletCards } from "@/components/WalletCards";
import { getDashboard } from "@/lib/dashboard";
import { currentMonth, money } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { hasModuleAccess } from "@/lib/crm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  if (!hasModuleAccess(user, "financeiro") && hasModuleAccess(user, "crm")) redirect("/crm");
  const params = await searchParams;
  const month = params.month ?? currentMonth();
  const data = await getDashboard(month);
  const isAgro = data.tenantKind === "agro";

  return (
    <div className="space-y-4 md:space-y-6">
      <DashboardAutoRefresh />
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-950 md:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">{isAgro ? "Financeiro, vendas, producao e estoque" : "Visao geral do seu negocio"}</p>
        </div>
        <form className="surface-panel flex items-center gap-2 p-2">
          <input name="month" type="month" defaultValue={month} className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-sm font-bold text-slate-700 outline-none" />
          <button className="primary-action px-4 py-2">Filtrar</button>
        </form>
      </header>

      <DashboardSetupActions brandName={data.tenantKind === "agro" ? "Gestao Rural 360" : "Merli360"} />

      <section className="grid grid-cols-2 gap-2.5 md:gap-4 xl:grid-cols-4">
        <MetricCard label={isAgro ? "Vendas do Mes" : "Saldo consolidado"} value={money.format(isAgro ? data.rural.salesTotal : data.currentBalance)} hint={isAgro ? `${data.rural.salesCount} vendas registradas` : "carteiras ativas do sistema"} tone={data.currentBalance >= 0 ? "good" : "danger"} />
        <MetricCard label="Entradas realizadas" value={money.format(data.totalRevenue)} hint="soma das entradas do fluxo" tone="good" />
        <MetricCard label="Saidas realizadas" value={money.format(data.monthOutputs)} hint="soma das saidas do fluxo" tone="danger" />
        <MetricCard label="Resultado de caixa" value={money.format(data.monthBalance)} hint="entradas menos saidas" tone={data.monthBalance >= 0 ? "good" : "danger"} />
        <MetricCard label={isAgro ? "Produtos/Culturas" : "Contatos Ativos"} value={String(isAgro ? data.rural.productsCount : data.activeClients)} hint={isAgro ? `${data.rural.stockQuantity} unidades em estoque` : `${data.recurringClients} contratos recorrentes`} tone="default" />
        <MetricCard label="Contas a Receber" value={money.format(data.receivableOpen)} hint={`${money.format(data.receivablePaid)} recebidos no mes`} tone="warn" />
        <MetricCard label="Contas a Pagar" value={money.format(data.payableOpen)} hint={`${money.format(data.payablePaid)} pagos no mes`} tone="danger" />
        <MetricCard label={isAgro ? "Proximas Colheitas" : "Vencidos"} value={isAgro ? String(data.rural.upcomingHarvests) : money.format(data.projection.overdueReceivables + data.projection.overduePayables)} hint={isAgro ? `${data.rural.deliveries} entregas no mes` : "receber + pagar em atraso"} tone={data.projection.overdueReceivables + data.projection.overduePayables > 0 ? "danger" : "default"} />
      </section>

      <WalletCards wallets={data.wallets} />

      {!isAgro ? <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <SimpleBarChart data={data.chart} />
        <div className="surface-panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-950">Projecao de caixa</h2>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">30/60/90</span>
          </div>
          <div className="mt-5 space-y-3">
            {[
              ["Saldo projetado em 30 dias", data.projection.days30],
              ["Saldo projetado em 60 dias", data.projection.days60],
              ["Saldo projetado em 90 dias", data.projection.days90]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-700">{String(label)}</p>
                <p className={`mt-1 text-2xl font-black ${Number(value) >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money.format(Number(value))}</p>
              </div>
            ))}
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">Vencidos hoje</p>
              <p className="mt-1 text-sm text-slate-500">A receber: {money.format(data.projection.overdueReceivables)} | A pagar: {money.format(data.projection.overduePayables)}</p>
            </div>
          </div>
        </div>
      </section> : <SimpleBarChart data={data.chart} />}

      <section className="grid gap-4 xl:grid-cols-2">
        {!isAgro ? <div className="surface-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-950">Resumo financeiro</h2>
            <span className="text-xs font-bold text-violet-600">Merli360</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Saldo Consolidado" value={money.format(data.currentBalance)} tone={data.currentBalance >= 0 ? "good" : "danger"} />
            <MetricCard label="Notas Pendentes" value={String(data.invoicesToIssue)} hint={`${money.format(data.invoicesIssuedValue)} emitidos`} />
            <MetricCard label="Receita Prevista" value={money.format(data.expectedRevenue)} hint="contas a receber do mes" tone="good" />
            <MetricCard label="Despesas Previstas" value={money.format(data.expectedExpenses)} hint="contas a pagar do mes" tone="danger" />
            <MetricCard label="Vencido a Receber" value={money.format(data.projection.overdueReceivables)} tone="warn" />
            <MetricCard label="Vencido a Pagar" value={money.format(data.projection.overduePayables)} tone="danger" />
          </div>
        </div> : null}
        <div className="surface-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-950">{isAgro ? "Resumo rural" : "Resumo operacional"}</h2>
            <span className="text-xs font-bold text-violet-600">{isAgro ? "Agro" : "Financeiro"}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {isAgro ? (
              <>
                <MetricCard label="Vendas Pendentes" value={String(data.rural.pendingSales)} tone="warn" />
                <MetricCard label="Entregas no Mes" value={String(data.rural.deliveries)} />
                <MetricCard label="Estoque Total" value={String(data.rural.stockQuantity)} tone="good" />
                <MetricCard label="Colheitas Previstas" value={String(data.rural.upcomingHarvests)} />
              </>
            ) : (
              <>
                <MetricCard label="Entradas do Mes" value={money.format(data.monthInputs)} tone="good" />
                <MetricCard label="Saidas do Mes" value={money.format(data.monthOutputs)} tone="danger" />
                <MetricCard label="Aberto a Receber" value={money.format(data.receivableOpen)} tone="warn" />
                <MetricCard label="Aberto a Pagar" value={money.format(data.payableOpen)} tone="danger" />
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
