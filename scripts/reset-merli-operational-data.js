const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "merli360" } });
  if (!tenant) throw new Error("Tenant merli360 nao encontrado");
  const tenantId = tenant.id;

  await prisma.$transaction([
    prisma.reconciliationAllocation.deleteMany({ where: { tenantId } }),
    prisma.reconciliationGroup.deleteMany({ where: { tenantId } }),
    prisma.bankTransaction.deleteMany({ where: { tenantId } }),
    prisma.bankImportBatch.deleteMany({ where: { tenantId } }),
    prisma.cashMovement.deleteMany({ where: { tenantId } }),
    prisma.settlement.deleteMany({ where: { tenantId } }),
    prisma.financialTitle.deleteMany({ where: { tenantId } }),
    prisma.transfer.deleteMany({ where: { tenantId } }),
    prisma.transaction.deleteMany({ where: { tenantId } }),
    prisma.accountReceivable.deleteMany({ where: { tenantId } }),
    prisma.accountPayable.deleteMany({ where: { tenantId } }),
    prisma.invoice.deleteMany({ where: { tenantId } }),
    prisma.adBudget.deleteMany({ where: { tenantId } }),
    prisma.lead.deleteMany({ where: { tenantId } }),
    prisma.goal.deleteMany({ where: { tenantId } }),
    prisma.client.deleteMany({ where: { tenantId } }),
    prisma.attachment.deleteMany({ where: { tenantId } }),
    prisma.assistantMessage.deleteMany({ where: { tenantId } }),
    prisma.budgetLine.deleteMany({ where: { tenantId } }),
    prisma.budget.deleteMany({ where: { tenantId } })
  ]);

  await prisma.assistantProfile.upsert({
    where: { tenantId },
    update: {
      ownerName: "Pedro",
      goalsText: "",
      memoryText: "",
      preferences: "",
      personality: "",
      businessName: "",
      onboardingStep: 0,
      onboardingCompleted: false
    },
    create: {
      tenantId,
      assistantName: "Assistente Merli360",
      ownerName: "Pedro",
      goalsText: "",
      memoryText: "",
      onboardingStep: 0,
      onboardingCompleted: false
    }
  });

  console.log("Dados operacionais do Merli360 zerados. Usuarios, categorias, contas e tenant preservados.");
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
