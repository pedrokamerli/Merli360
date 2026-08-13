import { AdBudget, AccountPayable, AccountReceivable } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncPayableToLedger, syncReceivableToLedger } from "@/lib/financial-ledger";

function today() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
}

function referenceMonthDate(month?: string | null) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return today();
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1, 12));
}

async function upsertTransaction(data: {
  importHash: string;
  date: Date;
  description: string;
  amount: number;
  type: "entrada" | "saida";
  category: string;
  subcategory?: string;
  costCenter?: string;
  account?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  clientId?: string | null;
  tenantId?: string | null;
}) {
  if (!data.amount || data.amount <= 0) {
    await prisma.transaction.deleteMany({ where: { importHash: data.importHash } });
    return;
  }

  await prisma.transaction.upsert({
    where: { importHash: data.importHash },
    update: {
      date: data.date,
      description: data.description,
      amount: data.amount,
      type: data.type,
      category: data.category,
      subcategory: data.subcategory,
      costCenter: data.costCenter,
      account: data.account || "PJ",
      status: "pago",
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      clientId: data.clientId || null,
      tenantId: data.tenantId || undefined,
      source: "Automacao Merli360"
    },
    create: {
      date: data.date,
      description: data.description,
      amount: data.amount,
      type: data.type,
      category: data.category,
      subcategory: data.subcategory,
      costCenter: data.costCenter,
      account: data.account || "PJ",
      status: "pago",
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      clientId: data.clientId || null,
      tenantId: data.tenantId || undefined,
      source: "Automacao Merli360",
      importHash: data.importHash
    }
  });
}

export async function syncReceivablePayment(
  receivable: AccountReceivable,
  options: { account: string; paymentMethod: string; paidDate?: string | null }
) {
  const paidDate = options.paidDate ? new Date(`${options.paidDate}T12:00:00.000Z`) : today();
  const updated = await prisma.accountReceivable.update({
    where: { id: receivable.id },
    data: {
      status: "pago",
      paidDate
    }
  });

  await upsertTransaction({
    importHash: `receivable-paid-${receivable.id}`,
    date: paidDate,
    description: `Recebimento - ${receivable.description}`,
    amount: receivable.amount,
    type: "entrada",
    category: receivable.type === "reembolso" ? "Reembolso de ads" : receivable.type === "projeto avulso" ? "Projeto avulso" : "Cliente recorrente",
    subcategory: receivable.type,
    costCenter: "Cliente",
    account: options.account,
    paymentMethod: options.paymentMethod,
      clientId: receivable.clientId,
      ...(receivable.tenantId ? { tenantId: receivable.tenantId } : {}),
      notes: "Lancamento automatico criado ao marcar conta a receber como recebida."
  });

  await syncReceivableToLedger(updated, {
    account: options.account,
    paymentMethod: options.paymentMethod,
    paidDate
  });

  const adBudgetId = receivable.notes?.match(/controle de ads ([\w-]+)/)?.[1];
  if (receivable.type === "reembolso" && adBudgetId) {
    const adBudget = await prisma.adBudget.findUnique({ where: { id: adBudgetId } });
    if (adBudget) {
      const reimbursedAmount = Math.max(adBudget.reimbursedAmount, receivable.amount);
      const reimbursementDue =
        adBudget.budgetType === "Pedro antecipou"
          ? Math.max(adBudget.spentAmount - reimbursedAmount, 0)
          : Math.max(adBudget.spentAmount - adBudget.receivedAmount - reimbursedAmount, 0);

      const updatedAdBudget = await prisma.adBudget.update({
        where: { id: adBudget.id },
        data: { reimbursedAmount, reimbursementDue }
      });
      await syncAdBudgetTransactions(updatedAdBudget);
    }
  }

  const ruralSaleId = receivable.notes?.match(/venda rural ([\w-]+)/)?.[1];
  if (receivable.type === "venda rural" && ruralSaleId) {
    await prisma.sale.updateMany({
      where: { id: ruralSaleId, tenantId: receivable.tenantId || undefined },
      data: {
        status: "recebido",
        paidDate,
        account: options.account,
        paymentMethod: options.paymentMethod
      }
    });
  }

  return updated;
}

export async function syncPayablePayment(
  payable: AccountPayable,
  options: { account: string; paymentMethod: string; paidDate?: string | null }
) {
  const paidDate = options.paidDate ? new Date(`${options.paidDate}T12:00:00.000Z`) : today();
  const updated = await prisma.accountPayable.update({
    where: { id: payable.id },
    data: {
      status: "pago",
      paidDate
    }
  });

  await upsertTransaction({
    importHash: `payable-paid-${payable.id}`,
    date: paidDate,
    description: `Pagamento - ${payable.description}`,
    amount: payable.amount,
    type: "saida",
    category: payable.category,
    subcategory: payable.recurring ? "Recorrente" : "Avulso",
    costCenter: "Contas a pagar",
    account: options.account,
    paymentMethod: options.paymentMethod,
    tenantId: payable.tenantId,
    notes: "Lancamento automatico criado ao marcar conta a pagar como paga."
  });

  await syncPayableToLedger(updated, {
    account: options.account,
    paymentMethod: options.paymentMethod,
    paidDate
  });

  return updated;
}

export async function syncAdBudgetTransactions(adBudget: AdBudget) {
  const date = adBudget.startDate || referenceMonthDate(adBudget.referenceMonth);
  const client = adBudget.clientId ? await prisma.client.findUnique({ where: { id: adBudget.clientId } }) : null;
  const label = client?.name ?? "cliente a identificar";
  const account = adBudget.account || "PJ";
  const paymentMethod = adBudget.paymentMethod || "Pix";
  const receivableDescription = `Reembolso ads - ${label} - ${adBudget.campaign || adBudget.platform} - ${adBudget.referenceMonth}`;

  await upsertTransaction({
    importHash: `ads-received-${adBudget.id}`,
    date,
    description: `Verba de ads recebida - ${label}`,
    amount: adBudget.receivedAmount,
    type: "entrada",
    category: "Verba de ads recebida",
    subcategory: adBudget.platform,
    costCenter: "Cliente",
    account,
    paymentMethod,
      clientId: adBudget.clientId,
      ...(adBudget.tenantId ? { tenantId: adBudget.tenantId } : {}),
      notes: "Dinheiro de midia paga recebido do cliente. Nao e receita de servico."
  });

  if (adBudget.budgetType === "Cartao do cliente") {
    await prisma.transaction.deleteMany({ where: { importHash: `ads-spent-${adBudget.id}` } });
  } else {
    await upsertTransaction({
      importHash: `ads-spent-${adBudget.id}`,
      date,
      description: `Gasto de ads - ${label}`,
      amount: adBudget.spentAmount,
      type: "saida",
      category: "Anuncios",
      subcategory: adBudget.platform,
      costCenter: adBudget.budgetType === "Pedro antecipou" ? "Empresa" : "Cliente",
      account,
      paymentMethod,
      clientId: adBudget.clientId,
      ...(adBudget.tenantId ? { tenantId: adBudget.tenantId } : {}),
      notes:
        adBudget.budgetType === "Pedro antecipou"
          ? "Gasto de ads antecipado por Pedro. Acompanhar reembolso pendente."
          : "Gasto de ads vinculado a verba do cliente."
    });
  }

  await upsertTransaction({
    importHash: `ads-reimbursed-${adBudget.id}`,
    date,
    description: `Reembolso de ads recebido - ${label}`,
    amount: adBudget.reimbursedAmount,
    type: "entrada",
    category: "Reembolso de ads",
    subcategory: adBudget.platform,
    costCenter: "Cliente",
    account,
    paymentMethod,
    clientId: adBudget.clientId,
    ...(adBudget.tenantId ? { tenantId: adBudget.tenantId } : {}),
    notes: "Reembolso de valor de ads antecipado por Pedro."
  });

  if (adBudget.reimbursementDue > 0 && adBudget.clientId) {
    const existing = await prisma.accountReceivable.findFirst({
      where: {
        clientId: adBudget.clientId,
        description: receivableDescription,
        status: { not: "pago" }
      }
    });

    const receivableData = {
      clientId: adBudget.clientId,
      tenantId: adBudget.tenantId,
      description: receivableDescription,
      amount: adBudget.reimbursementDue,
      dueDate: adBudget.endDate || date,
      status: "pendente",
      type: "reembolso",
      notes: `Gerado automaticamente pelo controle de ads ${adBudget.id}.`
    };

    if (existing) {
      await prisma.accountReceivable.update({ where: { id: existing.id }, data: receivableData });
    } else {
      await prisma.accountReceivable.create({ data: receivableData });
    }
  } else {
    await prisma.accountReceivable.deleteMany({
      where: {
        clientId: adBudget.clientId,
        description: receivableDescription,
        status: { not: "pago" }
      }
    });
  }
}

export async function cleanupAdBudgetAutomation(adBudget: AdBudget) {
  await prisma.transaction.deleteMany({
    where: {
      importHash: {
        in: [`ads-received-${adBudget.id}`, `ads-spent-${adBudget.id}`, `ads-reimbursed-${adBudget.id}`]
      }
    }
  });

  await prisma.accountReceivable.deleteMany({
    where: {
      status: { not: "pago" },
      notes: { contains: `controle de ads ${adBudget.id}` }
    }
  });
}
