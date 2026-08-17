import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const passwordHash = crypto.createHash("sha256").update(process.env.STUDIUM_TEAM_PASSWORD || "12345").digest("hex");

const team = [
  { username: "ana", name: "Ana", role: "user", moduleAccess: ["crm"], graphicRole: "GRAPHIC_SALES" },
  { username: "jorge", name: "Jorge", role: "user", moduleAccess: ["gestao-grafica"], graphicRole: "GRAPHIC_OPERATIONS" },
  { username: "marina", name: "Marina", role: "admin", moduleAccess: ["all"], graphicRole: "GRAPHIC_OWNER" }
] as const;

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { OR: [{ slug: "studium" }, { name: "Studium" }] } });
  if (!tenant) throw new Error("Tenant Studium nao encontrado.");

  const studium = await prisma.user.findFirst({ where: { tenantId: tenant.id, username: "studium" } });
  if (!studium) throw new Error("Usuario studium nao encontrado.");
  await prisma.user.update({ where: { id: studium.id }, data: { moduleAccess: JSON.stringify(["all"]) } });
  await prisma.graphicSetting.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: `userRole:${studium.id}` } },
    update: { value: "GRAPHIC_OWNER", status: "ACTIVE", updatedById: studium.id },
    create: { tenantId: tenant.id, key: `userRole:${studium.id}`, value: "GRAPHIC_OWNER", createdById: studium.id, updatedById: studium.id }
  });

  for (const member of team) {
    const user = await prisma.user.upsert({
      where: { username: member.username },
      update: { tenantId: tenant.id, name: member.name, role: member.role, moduleAccess: JSON.stringify(member.moduleAccess), passwordHash, mustChangePassword: false },
      create: { tenantId: tenant.id, username: member.username, name: member.name, role: member.role, moduleAccess: JSON.stringify(member.moduleAccess), passwordHash, mustChangePassword: false }
    });
    await prisma.graphicSetting.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: `userRole:${user.id}` } },
      update: { value: member.graphicRole, status: "ACTIVE", updatedById: studium.id },
      create: { tenantId: tenant.id, key: `userRole:${user.id}`, value: member.graphicRole, createdById: studium.id, updatedById: studium.id }
    });
    const profile = await prisma.assistantProfile.findFirst({ where: { tenantId: tenant.id, userId: user.id } });
    const profileData = { ownerName: member.name, businessName: tenant.brandName || tenant.name, onboardingStep: 4, onboardingCompleted: true };
    if (profile) await prisma.assistantProfile.update({ where: { id: profile.id }, data: profileData });
    else await prisma.assistantProfile.create({ data: { tenantId: tenant.id, userId: user.id, ...profileData } });
  }

  console.log("Equipe Studium configurada: Ana (CRM), Jorge (producao/expedicao), Marina e Studium (acesso total).");
}

main().finally(() => prisma.$disconnect());
