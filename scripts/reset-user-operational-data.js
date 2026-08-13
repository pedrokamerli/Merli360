const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2] || "pedro";
  const user = await prisma.user.findUnique({ where: { username }, include: { tenant: true } });
  if (!user) throw new Error(`Usuario ${username} nao encontrado`);
  const tenantId = user.tenantId;

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
    prisma.budgetLine.deleteMany({ where: { tenantId } }),
    prisma.budget.deleteMany({ where: { tenantId } }),
    prisma.aiLearningRule.deleteMany({ where: { tenantId, userId: user.id } }),
    prisma.assistantMessage.deleteMany({ where: { tenantId, userId: user.id } })
  ]);

  await prisma.financialAccount.updateMany({
    where: { tenantId },
    data: {
      initialBalanceCents: 0,
      observedBalanceCents: null,
      observedBalanceDate: null,
      lastImportAt: null
    }
  });

  const existingProfile = await prisma.assistantProfile.findFirst({ where: { tenantId, userId: user.id } });
  const data = {
    tenantId,
    userId: user.id,
    assistantName: user.tenant.kind === "agro" ? "Assistente Rural 360" : "Assistente Merli360",
    ownerName: user.name,
    businessName: user.tenant.brandName,
    goalsText: "",
    preferences: "",
    personality: "",
    memoryText: "",
    onboardingStep: 0,
    onboardingCompleted: false
  };

  if (existingProfile) {
    await prisma.assistantProfile.update({ where: { id: existingProfile.id }, data });
  } else {
    await prisma.assistantProfile.create({ data });
  }

  console.log(`Dados operacionais zerados para ${username} (${user.name}) no tenant ${user.tenant.slug}.`);
  console.log("Usuarios, categorias, centros de custo e contas financeiras foram preservados; saldos das contas foram zerados.");
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
