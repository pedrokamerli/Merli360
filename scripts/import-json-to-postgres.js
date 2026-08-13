const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const input = process.argv[2];

if (!input) {
  console.error("Uso: node scripts/import-json-to-postgres.js /app/data/export.json");
  process.exit(1);
}

const order = [
  "tenant",
  "user",
  "servicePlan",
  "category",
  "client",
  "buyer",
  "product",
  "financialAccount",
  "costCenter",
  "budget",
  "budgetLine",
  "transaction",
  "invoice",
  "adBudget",
  "accountReceivable",
  "accountPayable",
  "goal",
  "lead",
  "monthlySummary",
  "planting",
  "harvest",
  "stockMovement",
  "sale",
  "agendaEvent",
  "financialTitle",
  "settlement",
  "cashMovement",
  "transfer",
  "bankImportBatch",
  "bankTransaction",
  "reconciliationGroup",
  "reconciliationAllocation",
  "attachment",
  "webPushSubscription",
  "notificationRule",
  "assistantProfile",
  "assistantMessage",
  "auditLog"
];

function normalize(row) {
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) out[key] = new Date(value);
  }
  return out;
}

async function main() {
  const payload = JSON.parse(fs.readFileSync(input, "utf8"));
  const data = payload.data || {};

  for (const model of order) {
    const rows = data[model] || [];
    if (!rows.length || !prisma[model]) continue;
    for (const row of rows) {
      await prisma[model].upsert({
        where: { id: row.id },
        update: normalize(row),
        create: normalize(row)
      });
    }
    console.log(`${model}: ${rows.length} importados`);
  }
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
