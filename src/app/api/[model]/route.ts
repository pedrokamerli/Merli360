import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiModule, requireApiUser } from "@/lib/auth";
import { cleanupAdBudgetAutomation, syncAdBudgetTransactions } from "@/lib/transaction-sync";
import { syncHarvestStock, syncSaleAutomation } from "@/lib/rural-sync";
import { syncPayableToLedger, syncReceivableToLedger } from "@/lib/financial-ledger";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const modelMap = {
  transactions: prisma.transaction,
  clients: prisma.client,
  categories: prisma.category,
  invoices: prisma.invoice,
  adBudgets: prisma.adBudget,
  receivables: prisma.accountReceivable,
  payables: prisma.accountPayable,
  goals: prisma.goal,
  leads: prisma.lead,
  servicePlans: prisma.servicePlan,
  buyers: prisma.buyer,
  products: prisma.product,
  plantings: prisma.planting,
  harvests: prisma.harvest,
  stockMovements: prisma.stockMovement,
  sales: prisma.sale,
  agendaEvents: prisma.agendaEvent,
  financialAccounts: prisma.financialAccount,
  costCenters: prisma.costCenter,
  budgets: prisma.budget,
  budgetLines: prisma.budgetLine,
  financialTitles: prisma.financialTitle,
  settlements: prisma.settlement,
  cashMovements: prisma.cashMovement,
  bankImportBatches: prisma.bankImportBatch,
  bankTransactions: prisma.bankTransaction,
  reconciliationGroups: prisma.reconciliationGroup,
  reconciliationAllocations: prisma.reconciliationAllocation,
  attachments: prisma.attachment,
  pushSubscriptions: prisma.webPushSubscription,
  notificationRules: prisma.notificationRule
} as const;

type ModelName = keyof typeof modelMap;

function moduleForModel(model: string) {
  return model === "leads" ? "crm" : "financeiro";
}

function delegate(model: string) {
  if (!(model in modelMap)) return null;
  return modelMap[model as ModelName] as any;
}

function coerceDates(data: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...data };
  const dateFields = new Set(["date", "dueDate", "paidDate", "startDate", "endDate", "nextAdjustment", "expectedIssueDate", "issueDate", "nextFollowUp", "plantingDate", "expectedHarvest", "harvestDate", "saleDate", "deliveryDate", "initialBalanceDate", "observedBalanceDate", "lastImportAt", "issueDate", "competenceDate", "effectiveDate"]);
  for (const key of Object.keys(out)) {
    if (out[key] === "") out[key] = null;
    if (dateFields.has(key) && out[key]) {
      const text = String(out[key]);
      out[key] = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00.000Z`) : new Date(text);
    }
    if (key.endsWith("Cents") && out[key] !== null && out[key] !== undefined) {
      out[key] = Math.round(Number(out[key]) * 100);
    }
  }
  return out;
}

function hasTenant(model: string) {
  return !["servicePlans"].includes(model);
}

function withTenant(model: string, tenantId: string) {
  return hasTenant(model) ? { tenantId } : {};
}

function applySaleRules(data: Record<string, unknown>) {
  const out = { ...data };
  out.quantity = Number(out.quantity || 0);
  out.unitPrice = Number(out.unitPrice || 0);
  out.totalAmount = Number(out.totalAmount || 0) || Number(out.quantity) * Number(out.unitPrice);
  if (out.paymentMethod === "Marcar na conta") {
    out.status = "pendente";
    out.paidDate = null;
  } else if (!out.status || out.status === "pendente") {
    out.status = "recebido";
  }
  return out;
}

function applyAdBudgetRules(data: Record<string, unknown>) {
  const out = { ...data };
  const budgetType = String(out.budgetType || "Conferir origem");
  const approved = Number(out.approvedAmount || 0);
  const spent = Number(out.spentAmount || 0);
  const reimbursed = Number(out.reimbursedAmount || 0);

  if (budgetType === "Cliente enviou verba") {
    out.receivedAmount = approved;
    out.balance = approved - spent;
    out.reimbursementDue = Math.max(spent - approved - reimbursed, 0);
  } else if (budgetType === "Pedro antecipou") {
    out.receivedAmount = 0;
    out.balance = -spent;
    out.reimbursementDue = Math.max(spent - reimbursed, 0);
  } else if (budgetType === "Cartao do cliente") {
    out.receivedAmount = 0;
    out.balance = 0;
    out.reimbursementDue = 0;
  } else {
    out.receivedAmount = Number(out.receivedAmount || 0);
    out.balance = Number(out.receivedAmount || 0) - spent;
    out.reimbursementDue = Math.max(spent - Number(out.receivedAmount || 0) - reimbursed, 0);
  }

  if (!out.status) out.status = budgetType === "Conferir origem" ? "conferir" : "ativo";
  return out;
}

function apiError(error: unknown) {
  const err = error as { code?: string; message?: string; meta?: { target?: string[] } };
  if (err.code === "P2002") {
    const field = err.meta?.target?.join(", ") || "campo unico";
    return NextResponse.json({ error: `Registro duplicado em: ${field}` }, { status: 409 });
  }
  return NextResponse.json({ error: err.message || "Erro interno ao salvar" }, { status: 500 });
}

export async function GET(_: NextRequest, context: { params: Promise<{ model: string }> }) {
  const user = await requireApiUser();
  const { model } = await context.params;
  const db = delegate(model);
  if (!db) return NextResponse.json({ error: "Modelo nao encontrado" }, { status: 404 });
  try { await requireApiModule(moduleForModel(model)); } catch { return NextResponse.json({ error: "Modulo nao liberado" }, { status: 403 }); }
  const items = await db.findMany({ where: withTenant(model, user.tenantId), orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest, context: { params: Promise<{ model: string }> }) {
  const user = await requireApiUser();
  const { model } = await context.params;
  const db = delegate(model);
  if (!db) return NextResponse.json({ error: "Modelo nao encontrado" }, { status: 404 });
  try { await requireApiModule(moduleForModel(model)); } catch { return NextResponse.json({ error: "Modulo nao liberado" }, { status: 403 }); }
  try {
    const body = await request.json();
    const rawData = body.data ?? body;
    const ruled = model === "adBudgets" ? applyAdBudgetRules(rawData) : model === "sales" ? applySaleRules(rawData) : rawData;
    const item = await db.create({ data: { ...coerceDates(ruled), ...withTenant(model, user.tenantId) } });
    if (model === "adBudgets") await syncAdBudgetTransactions(item);
    if (model === "harvests") await syncHarvestStock(item);
    if (model === "sales") await syncSaleAutomation(item);
    if (model === "payables") await syncPayableToLedger(item);
    if (model === "receivables") await syncReceivableToLedger(item);
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "create",
      entity: model,
      entityId: item.id,
      request,
      metadata: { data: rawData }
    });
    return NextResponse.json({ item });
  } catch (error) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "create",
      entity: model,
      status: "error",
      message: error instanceof Error ? error.message : "Erro ao criar registro",
      request
    });
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ model: string }> }) {
  const user = await requireApiUser();
  const { model } = await context.params;
  const db = delegate(model);
  if (!db) return NextResponse.json({ error: "Modelo nao encontrado" }, { status: 404 });
  try { await requireApiModule(moduleForModel(model)); } catch { return NextResponse.json({ error: "Modulo nao liberado" }, { status: 403 }); }
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });
    const rawData = body.data ?? {};
    const ruled = model === "adBudgets" ? applyAdBudgetRules(rawData) : model === "sales" ? applySaleRules(rawData) : rawData;
    const existing = await db.findFirst({ where: { id: body.id, ...withTenant(model, user.tenantId) } });
    if (!existing) return NextResponse.json({ error: "Registro nao encontrado" }, { status: 404 });
    const item = await db.update({ where: { id: body.id }, data: coerceDates(ruled) });
    if (model === "adBudgets") await syncAdBudgetTransactions(item);
    if (model === "harvests") await syncHarvestStock(item);
    if (model === "sales") await syncSaleAutomation(item);
    if (model === "payables") await syncPayableToLedger(item);
    if (model === "receivables") await syncReceivableToLedger(item);
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "update",
      entity: model,
      entityId: item.id,
      request,
      metadata: { data: rawData }
    });
    return NextResponse.json({ item });
  } catch (error) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "update",
      entity: model,
      status: "error",
      message: error instanceof Error ? error.message : "Erro ao editar registro",
      request
    });
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ model: string }> }) {
  const user = await requireApiUser();
  const { model } = await context.params;
  const db = delegate(model);
  if (!db) return NextResponse.json({ error: "Modelo nao encontrado" }, { status: 404 });
  try { await requireApiModule(moduleForModel(model)); } catch { return NextResponse.json({ error: "Modulo nao liberado" }, { status: 403 }); }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });
  const existing = await db.findFirst({ where: { id, ...withTenant(model, user.tenantId) } });
  if (!existing) return NextResponse.json({ error: "Registro nao encontrado" }, { status: 404 });
  await db.delete({ where: { id } });
  if (model === "adBudgets") await cleanupAdBudgetAutomation(existing);
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "delete",
    entity: model,
    entityId: id,
    request
  });
  return NextResponse.json({ ok: true });
}
