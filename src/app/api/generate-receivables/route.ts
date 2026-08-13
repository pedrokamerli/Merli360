import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function daysInMonth(year: number, monthNumber: number) {
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function monthlyDates(year: number, monthNumber: number, day?: number | null) {
  const safeDay = Math.min(Math.max(day || 10, 1), daysInMonth(year, monthNumber));
  return [new Date(Date.UTC(year, monthNumber - 1, safeDay, 12))];
}

function weeklyDates(year: number, monthNumber: number, startDay: number, step: number) {
  const max = daysInMonth(year, monthNumber);
  const dates: Date[] = [];
  for (let day = Math.min(Math.max(startDay || 1, 1), max); day <= max; day += step) {
    dates.push(new Date(Date.UTC(year, monthNumber - 1, day, 12)));
  }
  return dates;
}

function recurrenceDates(year: number, monthNumber: number, recurrence?: string | null, recurrenceDay?: number | null) {
  if (recurrence === "semanal") return weeklyDates(year, monthNumber, recurrenceDay || 1, 7);
  if (recurrence === "quinzenal") return weeklyDates(year, monthNumber, recurrenceDay || 1, 14);
  return monthlyDates(year, monthNumber, recurrenceDay);
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const { month } = await request.json();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Mes invalido" }, { status: 400 });
  }

  const [year, monthNumber] = month.split("-").map(Number);
  let created = 0;

  const clients = await prisma.client.findMany({
    where: { tenantId: user.tenantId, status: "ativo", type: "recorrente" }
  });

  for (const client of clients) {
    const dueDate = monthlyDates(year, monthNumber, client.dueDay ?? 10)[0];
    const description = `Mensalidade ${client.name} - ${month}`;
    const exists = await prisma.accountReceivable.findFirst({
      where: { tenantId: user.tenantId, clientId: client.id, description }
    });
    if (!exists) {
      await prisma.accountReceivable.create({
        data: {
          clientId: client.id,
          tenantId: user.tenantId,
          description,
          amount: client.monthlyValue,
          dueDate,
          status: "pendente",
          type: "mensalidade"
        }
      });
      created += 1;
    }
  }

  const templates = await prisma.accountReceivable.findMany({
    where: {
      tenantId: user.tenantId,
      recurring: true
    }
  });

  for (const template of templates) {
    for (const dueDate of recurrenceDates(year, monthNumber, template.recurrence, template.recurrenceDay || template.dueDate.getUTCDate())) {
      const day = String(dueDate.getUTCDate()).padStart(2, "0");
      const description = `${template.description} - ${month}-${day}`;
      const exists = await prisma.accountReceivable.findFirst({
        where: {
          tenantId: user.tenantId,
          description,
          dueDate
        }
      });
      if (!exists) {
        await prisma.accountReceivable.create({
          data: {
            tenantId: user.tenantId,
            clientId: template.clientId,
            description,
            amount: template.amount,
            dueDate,
            status: "pendente",
            type: template.type,
            recurring: false,
            notes: `Gerado automaticamente a partir de recorrencia ${template.id}.`
          }
        });
        created += 1;
      }
    }
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "generate_recurring_receivables",
    entity: "receivables",
    request,
    metadata: { month, created }
  });

  return NextResponse.json({ created });
}
