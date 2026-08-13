const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const output = process.argv[2] || path.join(process.cwd(), "data", `sqlite-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

const models = [
  "tenant",
  "user",
  "auditLog",
  "client",
  "transaction",
  "category",
  "invoice",
  "adBudget",
  "accountReceivable",
  "accountPayable",
  "goal",
  "lead",
  "servicePlan",
  "monthlySummary",
  "buyer",
  "product",
  "planting",
  "harvest",
  "stockMovement",
  "sale",
  "agendaEvent",
  "financialAccount",
  "costCenter",
  "budget",
  "budgetLine",
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
  "assistantMessage"
];

async function main() {
  const data = {};
  for (const model of models) {
    if (!prisma[model]) continue;
    data[model] = await prisma[model].findMany();
    console.log(`${model}: ${data[model].length}`);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2));
  console.log(`Exportado para ${output}`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
