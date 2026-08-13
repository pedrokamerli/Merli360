import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function cents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

function dateOnly(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

async function ensureAccount(tx: Prisma.TransactionClient, tenantId: string, name: string) {
  const account = await tx.financialAccount.findFirst({ where: { tenantId, name, status: "ativa" } });
  if (!account) throw new Error(`Conta nao encontrada ou inativa: ${name}`);
  return account;
}

export async function createTransfer(input: {
  tenantId: string;
  date?: string | Date | null;
  fromAccountName: string;
  toAccountName: string;
  amount: number;
  description?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}) {
  const fromAccountName = String(input.fromAccountName || "").trim();
  const toAccountName = String(input.toAccountName || "").trim();
  const amountCents = cents(input.amount);

  if (!fromAccountName) throw new Error("Conta de origem obrigatoria");
  if (!toAccountName) throw new Error("Conta de destino obrigatoria");
  if (fromAccountName === toAccountName) throw new Error("Origem e destino precisam ser contas diferentes");
  if (amountCents <= 0) throw new Error("Valor da transferencia precisa ser maior que zero");

  return prisma.$transaction(async (tx) => {
    await ensureAccount(tx, input.tenantId, fromAccountName);
    await ensureAccount(tx, input.tenantId, toAccountName);

    const date = dateOnly(input.date);
    const groupId = input.idempotencyKey || crypto.randomUUID();
    const description =
      input.description?.trim() || `Transferencia de ${fromAccountName} para ${toAccountName}`;

    const transfer = await tx.transfer.upsert({
      where: { groupId },
      update: {
        date,
        fromAccountName,
        toAccountName,
        amountCents,
        description,
        paymentMethod: input.paymentMethod,
        status: "ACTIVE",
        notes: input.notes
      },
      create: {
        tenantId: input.tenantId,
        groupId,
        date,
        fromAccountName,
        toAccountName,
        amountCents,
        description,
        paymentMethod: input.paymentMethod,
        status: "ACTIVE",
        notes: input.notes
      }
    });

    const outMovement = await tx.cashMovement.upsert({
      where: {
        tenantId_legacyModel_legacyId: {
          tenantId: input.tenantId,
          legacyModel: "TransferOut",
          legacyId: transfer.id
        }
      },
      update: {
        date,
        direction: "OUT",
        amountCents,
        accountName: fromAccountName,
        category: "Transferencia propria",
        costCenter: "Transferencia",
        description,
        status: "ACTIVE",
        source: "TRANSFER",
        transferGroupId: groupId
      },
      create: {
        tenantId: input.tenantId,
        date,
        direction: "OUT",
        amountCents,
        accountName: fromAccountName,
        category: "Transferencia propria",
        costCenter: "Transferencia",
        description,
        status: "ACTIVE",
        source: "TRANSFER",
        transferGroupId: groupId,
        legacyModel: "TransferOut",
        legacyId: transfer.id
      }
    });

    const inMovement = await tx.cashMovement.upsert({
      where: {
        tenantId_legacyModel_legacyId: {
          tenantId: input.tenantId,
          legacyModel: "TransferIn",
          legacyId: transfer.id
        }
      },
      update: {
        date,
        direction: "IN",
        amountCents,
        accountName: toAccountName,
        category: "Transferencia propria",
        costCenter: "Transferencia",
        description,
        status: "ACTIVE",
        source: "TRANSFER",
        transferGroupId: groupId
      },
      create: {
        tenantId: input.tenantId,
        date,
        direction: "IN",
        amountCents,
        accountName: toAccountName,
        category: "Transferencia propria",
        costCenter: "Transferencia",
        description,
        status: "ACTIVE",
        source: "TRANSFER",
        transferGroupId: groupId,
        legacyModel: "TransferIn",
        legacyId: transfer.id
      }
    });

    return tx.transfer.update({
      where: { id: transfer.id },
      data: {
        outCashMovementId: outMovement.id,
        inCashMovementId: inMovement.id
      }
    });
  });
}

export async function reverseTransfer(input: { tenantId: string; transferId: string }) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findFirst({ where: { id: input.transferId, tenantId: input.tenantId } });
    if (!transfer) throw new Error("Transferencia nao encontrada");
    if (transfer.status === "REVERSED") return transfer;

    await tx.cashMovement.updateMany({
      where: { tenantId: input.tenantId, transferGroupId: transfer.groupId },
      data: { status: "REVERSED" }
    });

    return tx.transfer.update({
      where: { id: transfer.id },
      data: { status: "REVERSED" }
    });
  });
}
