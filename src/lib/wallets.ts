import { prisma } from "@/lib/prisma";

const walletOrder = ["PJ", "pessoal", "dinheiro", "cartao", "outro"];
const settledStatuses = ["pago", "realizado", "recebido"];

export type WalletBalance = {
  account: string;
  inputs: number;
  outputs: number;
  balance: number;
};

export async function getWalletBalances(tenantId?: string): Promise<WalletBalance[]> {
  const [accounts, cashMovements] = await Promise.all([
    tenantId
      ? prisma.financialAccount.findMany({
          where: { tenantId, status: "ativa" },
          orderBy: { createdAt: "asc" }
        })
      : Promise.resolve([]),
    tenantId
      ? prisma.cashMovement.findMany({
          where: { tenantId, status: "ACTIVE" },
          select: { accountName: true, direction: true, amountCents: true }
        })
      : Promise.resolve([])
  ]);

  if (accounts.length || cashMovements.length) {
    const balances = new Map<string, WalletBalance>();

    for (const account of accounts) {
      balances.set(account.name, {
        account: account.name,
        inputs: Math.max(account.initialBalanceCents, 0) / 100,
        outputs: account.initialBalanceCents < 0 ? Math.abs(account.initialBalanceCents) / 100 : 0,
        balance: account.initialBalanceCents / 100
      });
    }

    for (const movement of cashMovements) {
      const account = movement.accountName || "outro";
      const current = balances.get(account) ?? { account, inputs: 0, outputs: 0, balance: 0 };
      const amount = movement.amountCents / 100;
      if (movement.direction === "IN") current.inputs += amount;
      if (movement.direction === "OUT") current.outputs += amount;
      current.balance = current.inputs - current.outputs;
      balances.set(account, current);
    }

    return Array.from(balances.values()).sort((a, b) => {
      const indexA = walletOrder.indexOf(a.account);
      const indexB = walletOrder.indexOf(b.account);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: { in: settledStatuses }
    },
    select: {
      account: true,
      type: true,
      amount: true
    }
  });

  const balances = new Map<string, WalletBalance>();

  for (const account of walletOrder) {
    balances.set(account, { account, inputs: 0, outputs: 0, balance: 0 });
  }

  for (const transaction of transactions) {
    const account = transaction.account || "outro";
    const current = balances.get(account) ?? { account, inputs: 0, outputs: 0, balance: 0 };
    if (transaction.type === "entrada") current.inputs += transaction.amount;
    if (transaction.type === "saida") current.outputs += transaction.amount;
    current.balance = current.inputs - current.outputs;
    balances.set(account, current);
  }

  return Array.from(balances.values()).sort((a, b) => {
    const indexA = walletOrder.indexOf(a.account);
    const indexB = walletOrder.indexOf(b.account);
    return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
  });
}
