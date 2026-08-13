import { EntityManager } from "@/components/EntityManager";
import { requireUser } from "@/lib/auth";
import { currentMonth, money, monthBounds } from "@/lib/format";
import { modelConfigs } from "@/lib/models";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const { start, end } = monthBounds(currentMonth());
  const [contacts, receivables, payables] = await Promise.all([
    prisma.client.findMany({ where: { tenantId: user.tenantId } }),
    prisma.accountReceivable.findMany({ where: { tenantId: user.tenantId, status: { not: "pago" }, dueDate: { gte: start, lt: end } } }),
    prisma.accountPayable.findMany({ where: { tenantId: user.tenantId, status: { not: "pago" }, dueDate: { gte: start, lt: end } } })
  ]);
  const active = contacts.filter((contact) => contact.status === "ativo");
  const recurring = active.filter((contact) => contact.type === "recorrente");
  const recurringValue = recurring.reduce((sum, contact) => sum + contact.monthlyValue, 0);
  const averageTicket = recurring.length ? recurringValue / recurring.length : 0;
  const receivableOpen = receivables.reduce((sum, item) => sum + item.amount, 0);
  const payableOpen = payables.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-muted">Contatos ativos</p>
          <strong>{active.length}</strong>
        </div>
        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-muted">Recorrente previsto</p>
          <strong>{money.format(recurringValue)}</strong>
        </div>
        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-muted">Ticket medio</p>
          <strong>{money.format(averageTicket)}</strong>
        </div>
        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-muted">Aberto no mes</p>
          <strong>{money.format(receivableOpen - payableOpen)}</strong>
        </div>
      </div>
      <EntityManager config={modelConfigs.clients} />
    </div>
  );
}
