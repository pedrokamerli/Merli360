import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const d = (value: string) => new Date(`${value}T12:00:00.000Z`);

async function main() {
  await prisma.transaction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.adBudget.deleteMany();
  await prisma.accountReceivable.deleteMany();
  await prisma.accountPayable.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.servicePlan.deleteMany();
  await prisma.monthlySummary.deleteMany();
  await prisma.category.deleteMany();
  await prisma.client.deleteMany();

  const categories = [
    ["Cliente recorrente", "entrada"],
    ["Projeto avulso", "entrada"],
    ["Reembolso de ads", "entrada"],
    ["Transferência própria", "entrada"],
    ["Outros", "entrada"],
    ["Ferramentas", "saida"],
    ["MEI/impostos", "saida"],
    ["Anúncios", "saida"],
    ["Alimentação", "saida"],
    ["Transporte", "saida"],
    ["Psicóloga", "saida"],
    ["Academia", "saida"],
    ["Moradia", "saida"],
    ["Despesas compartilhadas", "saida"],
    ["Lazer", "saida"],
    ["Equipamentos", "saida"],
    ["Assinaturas", "saida"],
    ["A conferir", "saida"]
  ];

  await prisma.category.createMany({
    data: categories.map(([name, type]) => ({ name, type }))
  });

  const clients = await Promise.all(
    [
      ["Josué Trainer", 750, 10, "Instagram, consultoria e conteúdo", "Instagram"],
      ["Leandro Lanza", 400, 5, "Gestão digital semanal", "Instagram"],
      ["Mercado do Marcão", 600, 10, "Instagram e presença local", "Instagram"],
      ["Jacaré Smoke House", 400, 10, "Conteúdo e estratégia local", "Instagram"],
      ["Tá em Casa Espetinho", 500, 10, "Instagram e ofertas", "Instagram"],
      ["Veneza", 400, 10, "Presença digital e conteúdo", "Instagram"]
    ].map(([name, monthlyValue, dueDay, services, mainChannel]) =>
      prisma.client.create({
        data: {
          name: String(name),
          type: "recorrente",
          monthlyValue: Number(monthlyValue),
          dueDay: Number(dueDay),
          status: "ativo",
          services: String(services),
          mainChannel: String(mainChannel),
          startDate: d("2026-05-01"),
          growthPotential: Number(monthlyValue) < 700 ? 300 : 500,
          estimatedHoursMonth: 6,
          perceivedProfit: Number(monthlyValue) >= 600 ? "alta" : "média"
        }
      })
    )
  );

  const clientMap = Object.fromEntries(clients.map((client) => [client.name, client]));

  await prisma.client.create({
    data: {
      name: "Landing page Amarílis",
      type: "avulso",
      monthlyValue: 0,
      status: "ativo",
      services: "Landing page",
      mainChannel: "Landing Page",
      notes: "Projeto avulso de R$ 500."
    }
  });

  await prisma.transaction.createMany({
    data: [
      {
        date: d("2026-07-01"),
        description: "Mensalidades recorrentes previstas",
        amount: 3050,
        type: "entrada",
        category: "Cliente recorrente",
        subcategory: "MRR",
        costCenter: "Empresa",
        status: "pendente",
        account: "PJ",
        paymentMethod: "Pix",
        notes: "Receita recorrente inicial da carteira ativa."
      },
      {
        date: d("2026-07-02"),
        description: "Landing page Amarílis",
        amount: 500,
        type: "entrada",
        category: "Projeto avulso",
        subcategory: "Landing Page",
        costCenter: "Empresa",
        status: "pendente",
        account: "PJ",
        paymentMethod: "Pix"
      },
      ...[
        ["CapCut Pro", 60, "Ferramentas"],
        ["ChatGPT", 110, "Ferramentas"],
        ["Internet e celular", 110, "Ferramentas"],
        ["Canva", 50, "Ferramentas"],
        ["MEI", 60, "MEI/impostos"],
        ["Psicóloga quinzenal", 320, "Psicóloga"],
        ["Academia", 94, "Academia"],
        ["Alimentação semanal", 600, "Alimentação"],
        ["Transporte semanal", 200, "Transporte"]
      ].map(([description, amount, category]) => ({
        date: d("2026-07-05"),
        description: String(description),
        amount: Number(amount),
        type: "saida",
        category: String(category),
        subcategory: "Previsto",
        costCenter: ["Psicóloga", "Academia", "Alimentação", "Transporte"].includes(String(category))
          ? "Pessoal"
          : "Empresa",
        status: "pendente",
        account: "PJ",
        paymentMethod: "Cartão/Pix"
      }))
    ]
  });

  await prisma.invoice.createMany({
    data: [
      ...clients.map((client) => ({
        clientId: client.id,
        referenceMonth: "2026-07",
        serviceDescription: "Gestão digital e consultoria 360",
        amount: client.monthlyValue,
        expectedIssueDate: d("2026-07-10"),
        status: "emitir",
        notes: "Gerado no seed inicial."
      })),
      {
        clientId: null,
        referenceMonth: "2026-07",
        serviceDescription: "Landing page Amarílis",
        amount: 500,
        expectedIssueDate: d("2026-07-15"),
        status: "emitir",
        notes: "Projeto avulso."
      }
    ]
  });

  await prisma.accountReceivable.createMany({
    data: [
      ...clients.map((client) => ({
        clientId: client.id,
        description: `Mensalidade ${client.name} - 2026-07`,
        amount: client.monthlyValue,
        dueDate: d(`2026-07-${String(client.dueDay ?? 10).padStart(2, "0")}`),
        status: "pendente",
        type: "mensalidade"
      })),
      {
        clientId: null,
        description: "Landing page Amarílis",
        amount: 500,
        dueDate: d("2026-07-15"),
        status: "pendente",
        type: "projeto avulso"
      }
    ]
  });

  await prisma.accountPayable.createMany({
    data: [
      ["CapCut Pro", "Ferramentas", 60, "2026-07-05", true],
      ["ChatGPT", "Ferramentas", 110, "2026-07-05", true],
      ["Internet e celular", "Ferramentas", 110, "2026-07-10", true],
      ["Canva", "Ferramentas", 50, "2026-07-08", true],
      ["MEI", "MEI/impostos", 60, "2026-07-20", true],
      ["Psicóloga - sessões quinzenais às sextas 12h", "Psicóloga", 320, "2026-07-03", true],
      ["Academia", "Academia", 94, "2026-07-10", true],
      ["Alimentação", "Alimentação", 600, "2026-07-31", true],
      ["Transporte", "Transporte", 200, "2026-07-31", true]
    ].map(([description, category, amount, dueDate, recurring]) => ({
      description: String(description),
      category: String(category),
      amount: Number(amount),
      dueDate: d(String(dueDate)),
      status: "pendente",
      recurring: Boolean(recurring)
    }))
  });

  await prisma.adBudget.create({
    data: {
      clientId: clientMap["Mercado do Marcão"]?.id,
      platform: "Meta Ads",
      campaign: "Campanha a identificar",
      objective: "Conferir origem no extrato",
      referenceMonth: "2026-07",
      budgetType: "Conferir origem",
      approvedAmount: 0,
      receivedAmount: 0,
      spentAmount: 40,
      balance: -40,
      reimbursementDue: 0,
      reimbursedAmount: 0,
      status: "conferir",
      notes: "Exemplo baseado no controle de ads da planilha."
    }
  });

  await prisma.goal.createMany({
    data: [
      {
        name: "MRR - Meta R$ 5.000",
        currentValue: 3050,
        targetValue: 5000,
        gap: 1950,
        actionPlan: "Fechar 4 clientes de R$ 500 ou combinar reajustes.",
        deadline: "90 dias",
        status: "em andamento"
      },
      {
        name: "MRR - Meta R$ 7.500",
        currentValue: 3050,
        targetValue: 7500,
        gap: 4450,
        actionPlan: "Subir ticket médio e vender planos estratégicos acima de R$ 900.",
        deadline: "6 meses",
        status: "planejado"
      },
      {
        name: "MRR - Meta R$ 10.000",
        currentValue: 3050,
        targetValue: 10000,
        gap: 6950,
        actionPlan: "Criar carteira premium de consultoria 360.",
        deadline: "12 meses",
        status: "planejado"
      },
      {
        name: "4 novos clientes de R$ 500/mês",
        currentValue: 0,
        targetValue: 4,
        gap: 4,
        actionPlan: "Mapear 30 leads, chamar 20, fazer 8 diagnósticos e enviar 6 propostas.",
        deadline: "Julho/Agosto",
        status: "em andamento"
      }
    ]
  });

  await prisma.lead.create({
    data: {
      name: "Lead alimentação local",
      segment: "Alimentação",
      city: "Bauru/Cafelândia",
      status: "Novo lead",
      proposedValue: 700,
      closeChance: 0.2,
      notes: "Modelo inicial vindo da planilha: Instagram fraco / sem estratégia."
    }
  });

  await prisma.servicePlan.createMany({
    data: [
      {
        name: "Plano Base - Presença Digital",
        priceRange: "R$ 500 a R$ 700/mês",
        audience: "Negócio pequeno que precisa constância.",
        includes: "Gestão básica de conteúdo, posts, reels simples, calendário mensal e organização básica do Instagram.",
        excludes: "Análise profunda, tráfego e relatórios avançados.",
        meeting: "Opcional",
        report: "Simples",
        goal: "Entrada para fechar 4 clientes."
      },
      {
        name: "Plano Estratégico - Gestão Digital",
        priceRange: "R$ 900 a R$ 1.500/mês",
        audience: "Cliente que quer vender mais com estratégia.",
        includes: "Conteúdo, planejamento mensal, relatório, Google Business, estratégia comercial e acompanhamento de resultados.",
        excludes: "Gestão completa de delivery/iFood.",
        meeting: "Mensal",
        report: "Mensal",
        goal: "Subir ticket médio."
      },
      {
        name: "Plano Consultoria 360",
        priceRange: "R$ 1.800 a R$ 3.000/mês",
        audience: "Cliente com operação maior ou crescimento.",
        includes: "Diagnóstico profundo, análise de vendas, concorrência, campanhas, relatórios, reuniões, estratégia de crescimento e suporte em delivery/iFood.",
        excludes: "Custos de mídia e ferramentas.",
        meeting: "Quinzenal/Mensal",
        report: "Completo",
        goal: "Clientes premium."
      }
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
