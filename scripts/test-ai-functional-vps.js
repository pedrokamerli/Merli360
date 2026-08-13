const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function secret() {
  return process.env.AUTH_SECRET || process.env.BASIC_AUTH_PASSWORD || "merli360-local-secret";
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function createSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, createdAt: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

async function api(path, token, body) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `merli360_session=${token}`,
      host: "gestao.evolyncagenda.com"
    },
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
  return json;
}

async function main() {
  const slug = `teste-ia-funcional-${Date.now()}`;
  const tenant = await prisma.tenant.create({
    data: { name: "Teste IA Funcional", slug, kind: "consultoria", brandName: "Teste IA" }
  });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: slug,
      passwordHash: hashPassword("teste123"),
      name: "Teste IA",
      role: "admin"
    }
  });
  const token = createSessionToken(user.id);

  try {
    const category = await api("/api/assistant/chat", token, {
      message: "Cria uma categoria de saida chamada Delivery"
    });
    console.log("CHAT_CATEGORY", JSON.stringify({ answer: category.answer, pendingAction: category.pendingAction }));
    if (category.pendingAction?.action !== "create_record" || category.pendingAction?.targetModel !== "categories") {
      throw new Error("Categoria nao gerou pendingAction create_record.");
    }

    const categoryConfirm = await api("/api/assistant/confirm", token, {
      message: "confirmar categoria",
      operation: category.pendingAction
    });
    console.log("CONFIRM_CATEGORY", JSON.stringify({
      executed: categoryConfirm.actionResult?.executed,
      message: categoryConfirm.answer
    }));
    const savedCategory = await prisma.category.findFirst({
      where: { tenantId: tenant.id, name: { equals: "Delivery", mode: "insensitive" } }
    });
    if (!savedCategory) throw new Error("Categoria nao foi salva no banco.");

    const expense = await api("/api/assistant/chat", token, {
      message: "Gastei R$ 16 com pastel hoje em dinheiro"
    });
    console.log("CHAT_EXPENSE", JSON.stringify({ answer: expense.answer, pendingAction: expense.pendingAction }));
    if (expense.pendingAction?.action !== "create_transaction") {
      throw new Error("Gasto nao gerou pendingAction create_transaction.");
    }

    const expenseConfirm = await api("/api/assistant/confirm", token, {
      message: "confirmar gasto",
      operation: expense.pendingAction
    });
    console.log("CONFIRM_EXPENSE", JSON.stringify({
      executed: expenseConfirm.actionResult?.executed,
      message: expenseConfirm.answer
    }));
    const txCount = await prisma.transaction.count({ where: { tenantId: tenant.id } });
    const cashCount = await prisma.cashMovement.count({ where: { tenantId: tenant.id } });
    if (txCount < 1 || cashCount < 1) {
      throw new Error(`Lancamento incompleto. tx=${txCount} cash=${cashCount}`);
    }

    const balance = await api("/api/assistant/chat", token, {
      message: "Meu saldo inicial e PJ R$ 1200 e dinheiro R$ 50"
    });
    console.log("CHAT_BALANCE", JSON.stringify({ answer: balance.answer, pendingAction: balance.pendingAction }));
    if (balance.pendingAction?.action !== "update_initial_balance") {
      throw new Error("Saldo inicial nao gerou pendingAction update_initial_balance.");
    }
    const balanceConfirm = await api("/api/assistant/confirm", token, {
      message: "confirmar saldo inicial",
      operation: balance.pendingAction
    });
    console.log("CONFIRM_BALANCE", JSON.stringify({
      executed: balanceConfirm.actionResult?.executed,
      message: balanceConfirm.answer
    }));
    const accounts = await prisma.financialAccount.findMany({
      where: { tenantId: tenant.id },
      select: { name: true, initialBalanceCents: true }
    });
    console.log("ACCOUNTS", JSON.stringify(accounts));
    if (!accounts.some((account) => /pj/i.test(account.name) && account.initialBalanceCents === 120000)) {
      throw new Error("Saldo inicial PJ nao foi salvo.");
    }

    console.log("AI_FUNCTIONAL_TEST_OK");
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("AI_FUNCTIONAL_TEST_FAIL", error);
  await prisma.$disconnect();
  process.exit(1);
});
