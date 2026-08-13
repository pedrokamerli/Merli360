import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { executeAssistantOperation } from "@/lib/assistant-actions";
import { getAssistantPlanForConfirmation, markAssistantPlanExecuting, markAssistantPlanFinished } from "@/lib/ai-plan-store";

export const dynamic = "force-dynamic";

const onboardingBalanceStep = 2;
const onboardingAfterBalanceStep = 3;

function brl(value: number) {
  return `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function onboardingQuestion(step: number, tenantKind: string) {
  const isAgro = tenantKind === "agro";
  const questions = [
    isAgro
      ? "Para comecar, voce quer controlar a producao rural, dinheiro pessoal, vendas, estoque, contas do sitio/empresa ou tudo junto? Me responda do seu jeito."
      : "Para comecar, voce quer controlar vida pessoal, MEI/empresa, cartoes, clientes, contas do negocio ou tudo junto? Me responda do seu jeito.",
    "Quais contas/carteiras voce usa e quer acompanhar? Ex: conta PJ, conta pessoal, dinheiro, cartao, Santander, Nubank, Mercado Pago.",
    "Qual saldo inicial existe hoje em cada conta/carteira? Ex: PJ R$ 1.200, pessoal R$ 300, dinheiro R$ 50, cartao -R$ 800. Se preferir comecar zerado, diga: tudo zerado.",
    "Quais sao suas metas financeiras principais? Ex: guardar R$ 5.000, quitar divida, manter saldo positivo, faturar R$ 10.000 no mes ou reduzir gastos.",
    isAgro
      ? "Quais sao seus principais objetivos agora? Ex: controlar custo por cultura, organizar vendas, saber lucro da colheita, pagar contas em dia ou controlar estoque."
      : "Quais sao seus principais objetivos financeiros agora? Ex: separar pessoal da empresa, guardar dinheiro, pagar contas em dia, controlar cartao ou aumentar receita.",
    isAgro
      ? "Quais entradas e saidas mais aparecem na sua rotina? Ex: vendas para mercado/restaurante, sementes, adubo, defensivos, frete, energia, agua, diarias."
      : "Quais entradas e despesas mais aparecem na sua rotina? Ex: salario, clientes, aluguel, mercado, combustivel, fornecedores, anuncios, ferramentas, alimentacao."
  ];
  return questions[Math.min(step, questions.length - 1)];
}

function assistantCapabilities(tenantKind: string) {
  const items = tenantKind === "agro"
    ? [
        "registrar receitas e despesas por texto ou comprovante",
        "organizar contas a pagar e a receber",
        "acompanhar saldo por carteira",
        "importar extratos e levar itens para conciliacao",
        "classificar gastos rurais como sementes, adubo, defensivos, frete, energia e diarias",
        "ajudar a acompanhar vendas, plantio, colheita, estoque e custo por cultura"
      ]
    : [
        "registrar receitas e despesas por texto ou comprovante",
        "organizar contas a pagar e a receber",
        "acompanhar saldo por carteira",
        "importar extratos e levar itens para conciliacao",
        "classificar gastos pessoais, MEI, cartao, clientes, fornecedores e anuncios",
        "criar resumos, relatorios e alertas de vencimentos"
      ];
  return `O que eu consigo fazer aqui: ${items.join("; ")}.`;
}

function mergeMemory(current: string | null | undefined, addition: string) {
  const text = [current, addition].filter(Boolean).join("\n\n").trim();
  return text.length > 7000 ? text.slice(text.length - 7000) : text;
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const body = await request.json();
  const savedPlan = body.planId ? await getAssistantPlanForConfirmation({ tenantId: user.tenantId, userId: user.id, planId: String(body.planId) }) : null;
  const operation = savedPlan?.operation || body.operation;
  const originalMessage = String(body.message || "Acao confirmada pelo usuario").trim();
  if (!operation?.action) return NextResponse.json({ error: "Acao obrigatoria." }, { status: 400 });
  if (body.planId && !savedPlan) return NextResponse.json({ error: "Plano da IA nao encontrado ou expirado." }, { status: 404 });
  if (savedPlan) await markAssistantPlanExecuting(savedPlan.record.id);

  const actionResult = await executeAssistantOperation({
    tenantId: user.tenantId,
    tenantKind: user.tenant.kind,
    userId: user.id,
    message: originalMessage,
    operation,
    enrichment: body.enrichment,
    attachmentId: body.attachmentId || null,
    confirmed: true,
    request
  });
  if (savedPlan) {
    await markAssistantPlanFinished({
      planId: savedPlan.record.id,
      executed: actionResult.executed,
      result: actionResult,
      error: actionResult.executed ? null : actionResult.message
    });
  }

  let answer = actionResult.message;
  const profile = await prisma.assistantProfile.findFirst({ where: { tenantId: user.tenantId, userId: user.id } });
  if (profile && actionResult.executed && operation.action !== "reset_ai_learning") {
    const durable = [
      `Acao confirmada (${new Date().toISOString().slice(0, 10)}): ${operation.action}.`,
      operation.description ? `Descricao: ${operation.description}.` : "",
      operation.category ? `Categoria: ${operation.category}.` : "",
      operation.paymentMethod ? `Forma: ${operation.paymentMethod}.` : "",
      operation.account ? `Conta/carteira: ${operation.account}.` : "",
      operation.targetModel ? `Modulo: ${operation.targetModel}.` : ""
    ].filter(Boolean).join(" ");
    await prisma.assistantProfile.update({
      where: { id: profile.id },
      data: {
        memoryText: mergeMemory(profile.memoryText, durable)
      }
    });
  }
  if (operation.action === "update_initial_balance" && profile && !profile.onboardingCompleted && Number(profile.onboardingStep || 0) <= onboardingBalanceStep) {
    const balances = Array.isArray(operation.balances) ? operation.balances : [];
    const saved = balances.length
      ? balances.map((item: any) => `${String(item.account || "Conta").trim()}: ${brl(Number(item.amount || 0))}`).join("; ")
      : "saldo inicial informado";
    await prisma.assistantProfile.update({
      where: { id: profile.id },
      data: {
        onboardingStep: onboardingAfterBalanceStep,
        memoryText: mergeMemory(profile.memoryText, `Saldo inicial confirmado no onboarding: ${saved}.`)
      }
    });
    answer = [
      `Atualizei o saldo inicial: ${saved}.`,
      `Salvei na memoria: essas sao as carteiras/saldos iniciais que devo usar como base do seu Dashboard e fluxo de caixa.`,
      assistantCapabilities(user.tenant.kind),
      onboardingQuestion(onboardingAfterBalanceStep, user.tenant.kind)
    ].join("\n\n");
  }

  const assistantMessage = await prisma.assistantMessage.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      role: "assistant",
      content: answer,
      metadata: JSON.stringify({ actionResult, confirmed: true })
    }
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "ai_confirm_action",
    entity: String(operation.action),
    entityId: actionResult.item?.id,
    request,
    metadata: { actionResult }
  });

  const response = NextResponse.json({ answer, message: assistantMessage, actionResult, redirectTo: actionResult.redirectTo || null });
  if (operation.action === "reset_ai_learning" && actionResult.executed) {
    response.cookies.set("merli360_first_setup", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
  }
  return response;
}
