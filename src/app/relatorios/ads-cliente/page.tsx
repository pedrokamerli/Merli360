import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/PrintButton";
import { prisma } from "@/lib/prisma";
import { currentMonth, formatDate, money } from "@/lib/format";

export const dynamic = "force-dynamic";

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1, 12))
  );
}

function campaignPeriod(start?: Date | null, end?: Date | null) {
  if (start && end) return `${formatDate(start)} ate ${formatDate(end)}`;
  if (start) return `Desde ${formatDate(start)}`;
  if (end) return `Ate ${formatDate(end)}`;
  return "Periodo nao informado";
}

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ clientId?: string; month?: string }>;
}) {
  const params = await searchParams;
  const month = params.month ?? currentMonth();

  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  const selectedClientId = params.clientId || clients[0]?.id || "";
  const selectedClient = clients.find((client) => client.id === selectedClientId);

  const adBudgets = selectedClientId
    ? await prisma.adBudget.findMany({
        where: { clientId: selectedClientId, referenceMonth: month },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }]
      })
    : [];

  const totals = adBudgets.reduce(
    (acc, item) => {
      acc.approved += item.approvedAmount;
      acc.received += item.receivedAmount;
      acc.spent += item.spentAmount;
      acc.balance += item.balance;
      acc.reimbursement += item.reimbursementDue;
      acc.reimbursed += item.reimbursedAmount;
      return acc;
    },
    { approved: 0, received: 0, spent: 0, balance: 0, reimbursement: 0, reimbursed: 0 }
  );

  return (
    <div className="space-y-5">
      <header className="rounded border border-line bg-white p-5 shadow-sm print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/relatorios" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand print:hidden">
              <ArrowLeft size={16} />
              Voltar
            </Link>
            <p className="text-sm font-semibold uppercase text-muted">Merli360</p>
            <h1 className="mt-1 text-2xl font-bold">Relatorio de Ads por cliente</h1>
            <p className="mt-1 text-sm text-muted">
              {selectedClient?.name || "Cliente nao selecionado"} - {monthLabel(month)}
            </p>
          </div>
          <PrintButton />
        </div>

        <form className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto] print:hidden">
          <select name="clientId" defaultValue={selectedClientId} className="input">
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <input name="month" type="month" defaultValue={month} className="input" />
          <button className="btn-primary" type="submit">
            Gerar
          </button>
        </form>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <div className="metric-card">
          <span>Verba aprovada</span>
          <strong>{money.format(totals.approved)}</strong>
        </div>
        <div className="metric-card">
          <span>Verba recebida</span>
          <strong>{money.format(totals.received)}</strong>
        </div>
        <div className="metric-card">
          <span>Valor gasto</span>
          <strong>{money.format(totals.spent)}</strong>
        </div>
        <div className="metric-card">
          <span>Saldo atual</span>
          <strong>{money.format(totals.balance)}</strong>
        </div>
        <div className="metric-card">
          <span>Reembolso pendente</span>
          <strong>{money.format(totals.reimbursement)}</strong>
        </div>
      </section>

      <section className="rounded border border-line bg-white p-5 shadow-sm print:border-0 print:shadow-none">
        <h2 className="text-lg font-bold">Resumo para envio</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          No periodo de {monthLabel(month)}, foram aprovados {money.format(totals.approved)} para campanhas de ads.
          O gasto registrado foi de {money.format(totals.spent)}. O saldo atual da verba e {money.format(totals.balance)}.
          Reembolso ja recebido: {money.format(totals.reimbursed)}. Reembolso pendente: {money.format(totals.reimbursement)}.
        </p>
      </section>

      <section className="table-wrap bg-white print:border-0 print:shadow-none">
        <table>
          <thead>
            <tr>
              <th>Campanha</th>
              <th>Plataforma</th>
              <th>Periodo</th>
              <th>Origem da verba</th>
              <th>Aprovado</th>
              <th>Gasto</th>
              <th>Saldo</th>
              <th>Reembolso</th>
            </tr>
          </thead>
          <tbody>
            {adBudgets.map((item) => (
              <tr key={item.id}>
                <td>{item.campaign || "Campanha sem nome"}</td>
                <td>{item.platform}</td>
                <td>{campaignPeriod(item.startDate, item.endDate)}</td>
                <td>{item.budgetType}</td>
                <td>{money.format(item.approvedAmount)}</td>
                <td>{money.format(item.spentAmount)}</td>
                <td>{money.format(item.balance)}</td>
                <td>{money.format(item.reimbursementDue)}</td>
              </tr>
            ))}
            {!adBudgets.length && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  Nenhum lancamento de ads encontrado para este cliente e mes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
