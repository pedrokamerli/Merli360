import { addDays, endOfDay, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";

function titleLabel(type: "receivable" | "payable" | "financialTitle") {
  if (type === "receivable") return "Conta a receber";
  if (type === "payable") return "Conta a pagar";
  return "Titulo financeiro";
}

export async function getDueNotifications(tenantId: string, daysAhead = 1) {
  const today = startOfDay(new Date());
  const limit = endOfDay(addDays(today, daysAhead));

  const [receivables, payables, titles] = await Promise.all([
    prisma.accountReceivable.findMany({
      where: { tenantId, status: { not: "pago" }, dueDate: { lte: limit } },
      include: { client: true },
      orderBy: { dueDate: "asc" }
    }),
    prisma.accountPayable.findMany({
      where: { tenantId, status: { not: "pago" }, dueDate: { lte: limit } },
      orderBy: { dueDate: "asc" }
    }),
    prisma.financialTitle.findMany({
      where: { tenantId, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lte: limit } },
      orderBy: { dueDate: "asc" }
    })
  ]);

  const items = [
    ...receivables.map((item) => ({
      id: item.id,
      kind: "receivable",
      label: titleLabel("receivable"),
      description: item.description,
      contact: item.client?.name || null,
      dueDate: item.dueDate,
      amount: item.amount,
      href: "/receber"
    })),
    ...payables.map((item) => ({
      id: item.id,
      kind: "payable",
      label: titleLabel("payable"),
      description: item.description,
      contact: null,
      dueDate: item.dueDate,
      amount: item.amount,
      href: "/pagar"
    })),
    ...titles.map((item) => ({
      id: item.id,
      kind: "financialTitle",
      label: titleLabel("financialTitle"),
      description: item.description,
      contact: null,
      dueDate: item.dueDate,
      amount: item.originalAmountCents / 100,
      href: "/titulos"
    }))
  ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const overdue = items.filter((item) => new Date(item.dueDate) < today).length;
  const dueToday = items.filter((item) => {
    const due = new Date(item.dueDate);
    return due >= today && due <= endOfDay(today);
  }).length;

  return {
    items,
    summary: {
      total: items.length,
      overdue,
      dueToday,
      upcoming: items.length - overdue - dueToday
    }
  };
}
