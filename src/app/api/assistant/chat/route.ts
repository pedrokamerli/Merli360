import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { askAi, getAiRuntimeConfig, parseJsonBlock } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { currentMonth, monthBounds } from "@/lib/format";
import { getWalletBalances } from "@/lib/wallets";
import { getDueNotifications } from "@/lib/notifications";
import { executeAssistantOperation, interpretFinancialOperation } from "@/lib/assistant-actions";
import { getOrCreateAssistantProfile } from "@/lib/assistant-profile";
import { assistantToolCatalog, runAssistantTool } from "@/lib/assistant-tools";
import { compactForPrompt, getUnifiedAssistantContext, updateStructuredMemory } from "@/lib/assistant-unified";
import { saveAssistantPlan } from "@/lib/ai-plan-store";

export const dynamic = "force-dynamic";

const onboardingTotalSteps = 6;

function brl(value: number) {
  return `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function onboardingQuestion(step: number, tenantKind: string) {
  const isAgro = tenantKind === "agro";
  const questions = isAgro
    ? [
        "Para comecar, me diga o que voce quer controlar no agro: plantio, colheita, estoque, vendas, contas do sitio/empresa, dinheiro pessoal ou tudo junto?",
        "Quais culturas voce planta hoje e em que escala? Ex: alface, couve, tomate, cheiro-verde, quantidade de canteiros, hectares ou estufas.",
        "Quais contas/carteiras voce usa e quer acompanhar? Ex: conta PJ, conta pessoal, dinheiro, cartao, Santander, Nubank, Mercado Pago.",
        "Qual saldo inicial existe hoje em cada conta/carteira? Ex: PJ R$ 1.200, pessoal R$ 300, dinheiro R$ 50, cartao -R$ 800. Se preferir comecar zerado, diga: tudo zerado.",
        "Quais sao suas metas financeiras principais? Ex: guardar dinheiro para insumos, manter caixa positivo, reduzir custo por cultura, faturar mais por mes ou quitar divida.",
        "Quais entradas, saidas e rotinas mais aparecem? Ex: venda para mercado/restaurante, sementes, adubo, defensivos, frete, energia, agua, diarias, embalagens, perdas e estoque."
      ]
    : [
        "Para comecar, voce quer controlar vida pessoal, MEI/empresa, cartoes, clientes, contas do negocio ou tudo junto? Me responda do seu jeito.",
        "Quais contas/carteiras voce usa e quer acompanhar? Ex: conta PJ, conta pessoal, dinheiro, cartao, Santander, Nubank, Mercado Pago.",
        "Qual saldo inicial existe hoje em cada conta/carteira? Ex: PJ R$ 1.200, pessoal R$ 300, dinheiro R$ 50, cartao -R$ 800. Se preferir comecar zerado, diga: tudo zerado.",
        "Quais sao suas metas financeiras principais? Ex: guardar R$ 5.000, quitar divida, manter saldo positivo, faturar R$ 10.000 no mes ou reduzir gastos.",
        "Quais sao seus principais objetivos financeiros agora? Ex: separar pessoal da empresa, guardar dinheiro, pagar contas em dia, controlar cartao ou aumentar receita.",
        "Quais entradas e despesas mais aparecem na sua rotina? Ex: salario, clientes, aluguel, mercado, combustivel, fornecedores, anuncios, ferramentas, alimentacao."
      ];
  return questions[Math.min(step, questions.length - 1)];
}

function assistantCapabilities(tenantKind: string) {
  const agro = tenantKind === "agro";
  const items = agro
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

function onboardingTutorial(tenantKind: string) {
  const extra = tenantKind === "agro"
    ? "Para producao rural, use Plantios, Colheitas, Estoque, Produtos e Vendas para acompanhar o operacional."
    : "Para negocio/MEI, use Contatos/Clientes, Receber, Pagar, Fluxo e Relatorios para acompanhar o financeiro.";
  return [
    "Tutorial rapido:",
    "1. Use Movimentacoes/Fluxo para entradas e saidas do dia.",
    "2. Use Contas para valores futuros: o que ainda vai pagar ou receber.",
    "3. Use Importar/Conciliacao para revisar extratos e evitar duplicidade.",
    "4. Use o Dashboard para ver saldo, entradas, saidas, vencidos e resultado do mes.",
    "5. Pode me chamar pelo botao IA em qualquer tela para registrar, analisar, importar ou tirar duvidas.",
    extra
  ].join("\n");
}

function localAnswer(context: any, message: string) {
  if (/saldo|quanto\s+(tenho|tem)|carteira|conta/i.test(message)) {
    const wallets = context.wallets || [];
    const total = wallets.reduce((sum: number, wallet: any) => sum + Number(wallet.balance || 0), 0);
    const brl = (value: number) => `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const details = wallets.length
      ? wallets.map((wallet: any) => `${wallet.name || wallet.accountName || wallet.account || "Conta"}: ${brl(wallet.balance)}`).join("\n")
      : "Nenhuma carteira cadastrada ainda.";
    return [
      `Seu saldo consolidado atual e ${brl(total)}.`,
      details,
      "Esse valor vem das carteiras e movimentacoes registradas no sistema. Se alguma conta estiver faltando, me diga o saldo inicial dela que eu preparo para salvar."
    ].join("\n\n");
  }
  const alerts = [];
  if (context.dashboard.overduePayables > 0) alerts.push(`Voce tem R$ ${context.dashboard.overduePayables.toFixed(2)} em contas a pagar vencidas.`);
  if (context.dashboard.overdueReceivables > 0) alerts.push(`Voce tem R$ ${context.dashboard.overdueReceivables.toFixed(2)} em contas a receber vencidas.`);
  if (context.imports.toReview > 0) alerts.push(`Existem ${context.imports.toReview} itens de extrato para revisar na conciliacao.`);
  if (context.dashboard.monthBalance < 0) alerts.push(`O resultado de caixa do mes esta negativo em R$ ${Math.abs(context.dashboard.monthBalance).toFixed(2)}.`);
  return [
    `Entendi. Vou olhar isso com calma pelo que ja existe no seu sistema.`,
    alerts.length ? `Pontos de atencao agora: ${alerts.join(" ")}` : "No momento nao encontrei alertas criticos nos dados resumidos.",
    `Sobre sua pergunta: "${message}", ainda nao tenho dados suficientes para uma conclusao profunda. O caminho mais util agora e revisar o que esta a conferir, manter contas futuras atualizadas e me dizer qual decisao voce quer tomar com esses numeros.`
  ].join("\n\n");
}

function informationalAnswerDuringOnboarding(context: any, message: string) {
  if (!/(qual|quanto|mostrar|ver|consultar|como\s+esta|como\s+est[aá]|meu|minha).*(saldo|dashboard|vencid|pagar|receber|carteira)|\?/.test(message.toLowerCase())) return "";
  return `${localAnswer(context, message)}\n\nDepois disso, continuamos a entrevista inicial para configurar sua memoria.`;
}

function isOnboardingContinueRequest(message: string) {
  return /^(pronto|ok|certo|beleza|sim|continue|continua|proximo|pr[oó]ximo|tem mais|mais perguntas)[\s?.!]*$/i.test(message.trim());
}

function preparedActionAnswer(operation: any) {
  const amount = operation?.amount ? `R$ ${Number(operation.amount).toFixed(2)}` : "";
  if (operation?.action === "create_transaction") {
    const label = operation.type === "entrada" ? "entrada" : "saida";
    const accountLine = operation.account ? `Vou movimentar a carteira ${operation.account}.` : "So falta escolher a carteira no card antes de confirmar.";
    const paymentLine = operation.paymentMethod ? `Forma de pagamento: ${operation.paymentMethod}.` : "Se quiser, selecione Pix, dinheiro, credito, debito ou outra forma no card.";
    return [
      `Entendi. Vou preparar essa ${label} para o fluxo de caixa.`,
      `${amount} - ${operation.description || "lancamento informado"}.`,
      `Classifiquei como ${operation.category || "A conferir"}. ${accountLine} ${paymentLine}`,
      `Data: ${operation.date || "hoje"}.`,
      "Confere esses dados no card e toque em Confirmar e salvar. Assim eu registro de verdade e atualizo o saldo."
    ].join("\n");
  }
  if (operation?.action === "create_payable") {
    return `Entendi. Preparei uma conta a pagar de ${amount} para ${operation.description || "esse compromisso"}. Confirme no card para eu salvar e acompanhar o vencimento.`;
  }
  if (operation?.action === "create_receivable") {
    return `Entendi. Preparei uma conta a receber de ${amount} para ${operation.description || "esse recebimento"}. Confirme no card para eu salvar e acompanhar ate cair na carteira.`;
  }
  if (operation?.action === "create_payable") {
    return `Preparei uma conta a pagar: ${operation.description || "sem descrição"} ${amount}. Toque em Confirmar e salvar para gravar.`;
  }
  if (operation?.action === "create_receivable") {
    return `Preparei uma conta a receber: ${operation.description || "sem descrição"} ${amount}. Toque em Confirmar e salvar para gravar.`;
  }
  if (operation?.action === "create_report") return "Preparei o relatório solicitado na conversa.";
  if (operation?.action === "update_profile") return "Preparei uma atualização da memória/configuração da IA. Confirme para salvar.";
  if (operation?.action === "update_initial_balance") return `Preparei a atualização de saldo inicial. ${(operation.balances || []).map((item: any) => `${item.account} R$ ${Number(item.amount || 0).toFixed(2)}`).join(", ")}. Toque em Confirmar e salvar para gravar.`;
  if (operation?.action === "reset_operational_data") return "Preparei o Reset boom. Isso apaga os registros operacionais deste tenant para teste e zera saldos iniciais das carteiras, mantendo usuarios, categorias e configuracoes. Toque em Confirmar e salvar para executar.";
  if (operation?.action === "reset_ai_learning") return "Preparei o Reset IA. Isso apaga somente a memoria, conversa e regras aprendidas da assistente para este usuario. Seus dados financeiros continuam salvos. Toque em Confirmar e salvar para recomecar pelo formulario.";
  if (operation?.action === "create_record") return `Preparei um cadastro em ${operation.targetModel || "tabela"}. Toque em Confirmar e salvar para gravar.`;
  if (operation?.action === "update_record") return `Preparei uma alteração em ${operation.targetModel || "tabela"}. Toque em Confirmar e salvar para gravar.`;
  return "Preparei uma ação para você revisar antes de salvar.";
}

function isConcreteActionDuringOnboarding(operation: any, onboardingStep: number) {
  if (!operation?.action || operation.action === "none" || !operation.shouldExecute || Number(operation.confidence || 0) < 0.55) return false;
  if (onboardingStep === 2 && operation.action === "update_initial_balance") return false;
  return ["create_transaction", "create_payable", "create_receivable", "create_record", "update_record", "delete_record", "create_report", "update_initial_balance", "reset_ai_learning"].includes(operation.action);
}

function onboardingIntro(profile: any, tenantKind = "consultoria", registeredName = "") {
  const firstName = String(registeredName || profile?.ownerName || "").trim().split(" ")[0];
  const name = firstName ? `, ${firstName}` : "";
  return [
    `Oi${name}. Eu sou ${profile?.assistantName || "sua Assistente 360"}.`,
    "Ja peguei seu nome pelo cadastro. Agora vou configurar minha memoria para este acesso com base nas suas respostas.",
    "Vou perguntar uma coisa por vez. Conforme voce responder, eu salvo o que for importante para categorizar melhor, lembrar metas, sugerir contas e facilitar seu controle financeiro.",
    onboardingQuestion(0, tenantKind)
  ].join("\n\n");
}

function nextOnboardingQuestion(step: number, tenantKind: string) {
  return onboardingQuestion(step, tenantKind);
}

function isLegacyOnboardingIntro(content: string) {
  return /me diga seu nome|entrevista rapida para entender sua rotina|Para eu configurar sua memoria/i.test(content || "");
}

function mergeMemory(current: string | null | undefined, addition: string) {
  const text = [current, addition].filter(Boolean).join("\n\n").trim();
  return text.length > 7000 ? text.slice(text.length - 7000) : text;
}

function compactJson(value: any, maxLength = 12000) {
  const text = JSON.stringify(value, (_key, item) => {
    if (item instanceof Date) return item.toISOString().slice(0, 10);
    return item;
  });
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeMessage(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isCorrectionMessage(message: string) {
  return /\b(nao pedi|nao foi isso|nao era isso|voce esta variando|vc ta variando|esta variando|ta variando|viajou|esta viajando|ta viajando|para|cancela|cancelar|esquece|errado)\b/.test(normalizeMessage(message));
}

function buildOperationalMessage(context: any, message: string) {
  if (isCorrectionMessage(message)) return message;
  const recent = Array.isArray(context.recentMessages) ? context.recentMessages.slice(-6) : [];
  if (!recent.length) return message;
  const lastAssistant = [...recent].reverse().find((item: any) => item.role === "assistant")?.content || "";
  const looksLikeContinuation = /falt|informe|me diga|qual|escolha|preencher|registrar|lan[cç]amento|entrada|sa[ií]da|despesa|receita|conta|carteira|pagamento|data|valor/i.test(lastAssistant);
  const hasShortFinancialDetails = /(?:r\$\s*)?\d+[,.]?\d*/i.test(message) && /(pix|dinheiro|credito|cr[eé]dito|debito|d[eé]bito|santander|nubank|pj|pessoal|cartao|cart[aã]o|hoje|ontem|amanha|amanh[aã]|\d{1,2}[/-]\d{1,2})/i.test(message);
  if (!looksLikeContinuation && !hasShortFinancialDetails) return message;
  return [
    "CONTEXTO PARA INTERPRETAR A ACAO:",
    "O usuario pode estar completando uma solicitacao anterior da assistente. Use as ultimas mensagens para entender se e entrada, saida, conta a pagar, conta a receber ou outro registro.",
    "Se a mensagem atual trouxer os dados faltantes, gere a operacao correspondente. Se ainda faltar campo essencial, retorne action none com answer perguntando somente o campo que falta.",
    "Ultimas mensagens:",
    recent.map((item: any) => `${item.role}: ${item.content}`).join("\n---\n"),
    "Mensagem atual do usuario:",
    message
  ].join("\n\n");
}

function missingFieldAnswer(operation: any) {
  if (!operation?.action || operation.action === "none") return "";
  if (["create_transaction", "create_payable", "create_receivable"].includes(operation.action) && !Number(operation.amount || 0)) {
    return "Eu entendi a ideia, mas faltou o valor. Me mande algo como: R$ 99,90. Se quiser, ja pode mandar junto a conta e a forma de pagamento.";
  }
  if (operation.action === "create_transaction" && !operation.type) {
    return "So preciso entender uma coisa: esse dinheiro entrou ou saiu? Me diga entrada ou saida.";
  }
  if (operation.action === "create_transaction" && !operation.account) {
    return "";
  }
  if (operation.action === "create_transaction" && !operation.account) {
    return "Beleza, ja entendi o lancamento. Em qual carteira isso entrou ou saiu? Ex: PJ, pessoal, Santander, dinheiro ou cartao.";
  }
  if (operation.action === "create_payable" && !operation.dueDate) {
    return "Consigo criar essa conta a pagar, so faltou o vencimento. Pode responder 'hoje', 'amanha' ou uma data tipo 20/07/2026.";
  }
  if (operation.action === "create_receivable" && !operation.dueDate) {
    return "Consigo criar essa conta a receber, so faltou quando voce espera receber. Pode ser 'hoje', 'amanha' ou uma data.";
  }
  if (["create_transaction", "create_payable", "create_receivable"].includes(operation.action) && !Number(operation.amount || 0)) {
    return "Faltou o valor para eu preparar esse registro. Digite só o valor, por exemplo: R$ 99,90.";
  }
  if (operation.action === "create_transaction" && !operation.type) {
    return "Faltou eu entender se isso é entrada ou saída. Me diga: entrou dinheiro ou saiu dinheiro?";
  }
  if (operation.action === "create_transaction" && !operation.account) {
    return "Faltou a conta/carteira. Em qual conta isso entrou ou saiu? Ex: PJ, pessoal, Santander, dinheiro ou cartão.";
  }
  if (operation.action === "create_payable" && !operation.dueDate) {
    return "Faltou a data de vencimento. Se for hoje, pode dizer 'hoje'; se for outra data, mande no formato 20/07/2026.";
  }
  if (operation.action === "create_receivable" && !operation.dueDate) {
    return "Faltou a data prevista para receber. Se for hoje, diga 'hoje'; se for outro dia, mande a data.";
  }
  return "";
}

function assistantToolsText(kind = "consultoria") {
  return [
    "Arquitetura operacional da IA:",
    "- Cerebro: le memoria do usuario, tenant, carteiras, fluxo, titulos, contas, categorias, contatos, importacoes, regras aprendidas, metas e modulos do tenant antes de responder.",
    `- Mapa de ferramentas seguras: ${assistantToolCatalog(kind).join(", ")}.`,
    "- create_transaction: registra entrada ou saida no fluxo de caixa e atualiza saldo da carteira.",
    "- create_payable: cria conta a pagar e integra com o financeiro.",
    "- create_receivable: cria conta a receber e integra com o financeiro.",
    "- update_initial_balance: cria/atualiza carteiras e saldos iniciais.",
    "- create_record: cria categorias, carteiras, clientes/contatos, metas, leads, compradores, produtos/culturas e eventos de agenda.",
    "- update_record: altera cadastros existentes quando houver alvo claro.",
    "- delete_record: remove registro somente com alvo claro e confirmacao.",
    "- create_report: gera resumo financeiro com dados reais do mes.",
    "- Para consultas, use os dados reais e entregue interpretacao, alertas, dicas e proxima acao; nao responda como relatorio seco.",
    "- Para acoes, converse naturalmente, diga o que entendeu e deixe a acao pronta para confirmacao quando necessario.",
    "A assistente nao executa pagamento bancario externo, transferencia real ou cobranca fora do SaaS.",
    "Quando uma ferramenta for preparada, o usuario revisa e confirma antes de gravar, exceto se autoExecute estiver ligado pelo superadmin."
  ].join("\n");
}

function agentBrainBrief(context: any) {
  const d = context.dashboard || {};
  const wallets = context.wallets || [];
  const memory = context.memory || {};
  const tools = context.toolMap || {};
  return {
    tenant: context.tenant,
    userMemory: {
      ownerName: memory.ownerName,
      goalsText: memory.goalsText,
      memoryText: String(memory.memoryText || "").slice(-1600),
      structured: memory.structured || {}
    },
    numbers: {
      month: context.month,
      walletTotal: d.walletTotal,
      inputs: d.inputs,
      outputs: d.outputs,
      result: d.result,
      receivableOpen: d.receivableOpen,
      payableOpen: d.payableOpen,
      overdueReceivables: d.overdueReceivables,
      overduePayables: d.overduePayables,
      projectedBalance: d.projectedBalance,
      wallets: wallets.slice(0, 8)
    },
    workload: {
      payablesCount: context.payables?.length || 0,
      receivablesCount: context.receivables?.length || 0,
      importsToReview: context.imports?.toReview || 0,
      goalsCount: context.goals?.length || 0
    },
    toolMap: tools
  };
}

async function makeConversationalToolAnswer(params: { context: any; message: string; tool: string; rawAnswer: string; data: any }) {
  const raw = params.rawAnswer.trim();
  const prompt = [
    "Voce e a assistente financeira do Merli360. Reescreva a resposta de uma ferramenta real em uma conversa humana, inteligente e util.",
    "Nao esconda os numeros. Nao invente dados. Use somente o resultado da ferramenta e o contexto abaixo.",
    "A resposta deve soar como uma assistente de verdade: direta, acolhedora, com raciocinio, dicas praticas e uma proxima acao.",
    "Evite frases genericas como 'o primeiro passo e revisar lancamentos'. Diga especificamente o que fazer com base nos dados.",
    "Se nao houver dados, explique o que esta vazio e sugira como alimentar o sistema.",
    "Se houver risco, atraso, saldo baixo, muita despesa, item a conferir ou meta sem progresso, aponte com clareza.",
    "Mantenha curto: 2 a 5 paragrafos, com bullets somente se melhorar a leitura.",
    `Mensagem do usuario: ${params.message}`,
    `Ferramenta usada: ${params.tool}`,
    `Resposta bruta da ferramenta: ${params.rawAnswer}`,
    `Dados da ferramenta: ${compactJson(params.data || {}, 7000)}`,
    `Cerebro/contexto resumido: ${compactJson(agentBrainBrief(params.context), 7000)}`
  ].join("\n\n");
  const answer = await askAi(prompt, { timeoutMs: 18000, useOpenAI: true });
  const text = answer?.trim() || "";
  const generic = !text || /primeiro passo.*revisar|nao encontrei alertas criticos|caminho mais util agora/i.test(text);
  const lostNumbers = /\d/.test(raw) && !/\d/.test(text);
  return generic || lostNumbers ? raw : text;
}

function assistantConversationPrompt(params: { context: any; interpreted: any; pendingConfirmation: boolean; message: string }) {
  return [
    "Voce e uma assistente financeira conversacional dentro do SaaS Merli360/Gestao Rural 360.",
    "Converse como ChatGPT/Gemini: natural, direta, util, em portugues do Brasil, com continuidade de contexto.",
    "Prioridade de estilo: fale como uma assistente humana e presente. Comece reconhecendo o que a pessoa quis dizer, depois diga a acao concreta ou a pergunta curta que falta.",
    "Nao responda com texto frio de sistema. Evite 'nao encontrei dados suficientes' quando voce puder perguntar algo simples ou preparar uma acao.",
    "Quando o usuario mandar uma frase informal, aceite o jeito dele falar. Ex: 'acabei de receber um pix de 1000' deve virar uma entrada preparada; 'paguei internet 90 no santander pix' deve virar uma saida preparada.",
    "Sua missao e ajudar o usuario a controlar dinheiro, rotina financeira, anexos, importacoes, vencimentos, metas, saldos, clientes/contatos e relatorios.",
    "Atue como assistente pessoal financeira: aprenda profissao/atividade, renda, fontes de receita, clientes/fornecedores, contas, cartoes, recorrencias, prioridades, metas, limites de gastos e preferencias de comunicacao.",
    "Nao transforme suspeitas em fatos. Quando inferir algo importante, confirme em uma pergunta curta.",
    "Se o usuario pedir resumo diario, semanal ou fechamento mensal, entregue um resumo pratico com entradas, saidas, pendencias, saldo, alertas e proxima acao.",
    "Se o usuario pedir se pode comprar/contratar/investir, considere saldo disponivel, contas futuras, metas, renda variavel e risco de caixa antes da conclusao.",
    "Use os dados reais abaixo. Nao invente saldo, vencimento, valor, cliente, categoria ou lancamento.",
    "Se o usuario pedir uma acao operacional, explique o que voce entendeu e deixe claro se vai precisar de confirmacao.",
    "Se faltar conta/carteira, valor, data ou tipo, faca no maximo duas perguntas objetivas.",
    "Se faltar apenas data de movimentacao realizada, assuma hoje e avise que pode corrigir antes de confirmar. Para contas futuras, pergunte vencimento.",
    "Se houver possivel acao pendente, nao diga que salvou ainda. Diga que preparou e que ele precisa confirmar no card.",
    "Quando responder analises, traga numeros, alertas e proxima acao pratica.",
    "Quando perceber um padrao da rotina do usuario, use a memoria existente e mencione como isso ajuda na categorizacao futura.",
    "Nao responda como template. Fale como uma pessoa competente: reconheca o pedido, explique o raciocinio, de uma dica concreta e convide para a proxima acao operacional quando fizer sentido.",
    "Se o usuario perguntar onde esta o cerebro/mapa de ferramentas, explique que o cerebro e o contexto unificado abaixo e que o mapa de ferramentas sao as capacidades listadas; depois use isso para responder ou agir.",
    assistantToolsText(params.context?.tenant?.kind || "consultoria"),
    `Contexto financeiro, operacional e memoria do usuario: ${compactJson(params.context)}`,
    `Analise estruturada da intencao: ${compactJson({ interpreted: params.interpreted, pendingConfirmation: params.pendingConfirmation }, 6000)}`,
    `Mensagem atual do usuario: ${params.message}`
  ].join("\n\n");
}

async function rememberFromConversation(params: { user: any; profile: any; userMessage: string; assistantAnswer: string; actionResult?: any; pendingAction?: any }) {
  const prompt = [
    "Extraia somente aprendizados duraveis para uma assistente financeira.",
    "Retorne apenas JSON valido.",
    "Atualize memoria quando descobrir: profissao/atividade, tipo de renda, fontes de renda, faturamento medio, datas habituais de recebimento, rotina financeira, categorias preferidas, contas usadas, cartoes, fornecedores/clientes recorrentes, objetivos, metas, prioridades, reserva, limites de gastos, nivel de acompanhamento, modo de trabalho, preferencias de classificacao e correcoes feitas pelo usuario.",
    "Organize o texto por uma destas secoes quando possivel: Perfil profissional, Renda, Clientes/fornecedores, Contas e cartoes, Recorrencias, Metas, Preferencias, Informacoes temporarias.",
    "Nao salve fatos temporarios simples como uma pergunta comum. Nao duplique memoria existente.",
    "Se nada duravel foi aprendido, retorne campos vazios.",
    `Memoria atual: ${params.profile.memoryText || ""}`,
    `Metas atuais: ${params.profile.goalsText || ""}`,
    `Preferencias atuais: ${params.profile.preferences || ""}`,
    `Usuario: ${params.user.name}`,
    `Tipo do tenant: ${params.user.tenant.kind}`,
    `Mensagem do usuario: ${params.userMessage}`,
    `Resposta da assistente: ${params.assistantAnswer}`,
    params.actionResult ? `Acao executada: ${JSON.stringify(params.actionResult).slice(0, 3000)}` : "",
    params.pendingAction ? `Acao preparada: ${JSON.stringify(params.pendingAction).slice(0, 3000)}` : "",
    'Formato: {"memoryAddition":"","goalsAddition":"","preferencesAddition":""}'
  ].filter(Boolean).join("\n");
  const answer = await askAi(prompt, { json: true, timeoutMs: 12000 });
  const parsed = parseJsonBlock<{ memoryAddition?: string; goalsAddition?: string; preferencesAddition?: string }>(answer || "");
  if (!parsed?.memoryAddition && !parsed?.goalsAddition && !parsed?.preferencesAddition) return;

  const updated = await prisma.assistantProfile.update({
    where: { id: params.profile.id },
    data: {
      memoryText: parsed.memoryAddition ? mergeMemory(params.profile.memoryText, `Aprendizado (${new Date().toISOString().slice(0, 10)}): ${parsed.memoryAddition}`) : params.profile.memoryText,
      goalsText: parsed.goalsAddition ? mergeMemory(params.profile.goalsText, parsed.goalsAddition) : params.profile.goalsText,
      preferences: parsed.preferencesAddition ? mergeMemory(params.profile.preferences, parsed.preferencesAddition) : params.profile.preferences
    }
  });
  await updateStructuredMemory({
    tenantId: params.user.tenantId,
    userId: params.user.id,
    patch: {
      lastLearningAt: new Date().toISOString(),
      durableFacts: [
        ...(Array.isArray((params.profile as any).structured?.durableFacts) ? (params.profile as any).structured.durableFacts : []),
        parsed.memoryAddition || parsed.goalsAddition || parsed.preferencesAddition
      ].filter(Boolean).slice(-80),
      goals: parsed.goalsAddition ? String(parsed.goalsAddition) : undefined,
      preferences: parsed.preferencesAddition ? String(parsed.preferencesAddition) : undefined
    },
    textAppend: ""
  });
  return updated;
}

function memorySavedSummary(params: { step: number; memoryAddition: string; initialBalanceAccounts?: any[] }) {
  const saved = String(params.memoryAddition || "").replace(/\s+/g, " ").trim();
  const lines = [];
  if (params.initialBalanceAccounts?.length) {
    lines.push(`Atualizei o saldo inicial: ${params.initialBalanceAccounts.map((account) => `${account.name}: ${brl(account.initialBalanceCents / 100)}`).join("; ")}.`);
  }
  if (saved) {
    lines.push(`Salvei na memoria: ${saved}`);
  }
  if (!lines.length) lines.push("Salvei essa resposta na memoria para personalizar sua experiencia.");
  return lines.join("\n\n");
}

function onboardingTeachingTip(step: number, tenantKind: string) {
  const isAgro = tenantKind === "agro";
  const tips = isAgro
    ? [
        "Dica de uso: quando voce me disser o que controla no agro, eu adapto o menu mental entre caixa, plantio, colheita, estoque e vendas.",
        "Dica de uso: cadastrando as culturas, depois voce pode dizer coisas como 'colhi 30 pes de alface' ou 'vendi 12 caixas para o mercado'.",
        "Dica de uso: carteiras sao de onde o dinheiro entra e sai. Isso ajuda o saldo do dashboard a ficar confiavel.",
        "Dica de uso: saldo inicial e o ponto de partida. Depois disso, cada entrada e saida atualiza o caixa.",
        "Dica de uso: metas viram minha referencia para avisar se um gasto, compra ou atraso esta atrapalhando seu objetivo.",
        "Dica de uso: sua rotina me ensina categorias. Se voce corrigir uma classificacao, eu aprendo para os proximos extratos."
      ]
    : [
        "Dica de uso: quando voce me diz o que quer controlar, eu adapto minhas sugestoes entre vida pessoal, MEI, clientes, cartao e contas.",
        "Dica de uso: carteiras sao suas contas/bancos/cartoes. Com elas, o dashboard mostra saldo por origem.",
        "Dica de uso: saldo inicial e o ponto de partida. Depois disso, cada lancamento movimenta o caixa automaticamente.",
        "Dica de uso: metas me ajudam a orientar decisoes. Eu posso avisar se um gasto ou atraso atrapalha o plano.",
        "Dica de uso: objetivos dizem como voce quer usar o sistema no dia a dia, tipo separar pessoal da empresa ou controlar cartao.",
        "Dica de uso: sua rotina vira aprendizado. Eu uso isso para categorizar melhor importacoes, comprovantes e lancamentos por texto."
      ];
  return tips[Math.min(step, tips.length - 1)];
}

async function buildOnboardingAssistantAnswer(params: {
  user: any;
  profile: any;
  userMessage: string;
  savedSummary: string;
  currentStep: number;
  completed: boolean;
  nextQuestion: string;
  initialBalanceAccounts: any[];
}) {
  const fallback = params.completed
    ? [
        params.savedSummary,
        "Pronto, configurei minha memoria inicial para este usuario.",
        assistantCapabilities(params.user.tenant.kind),
        onboardingTutorial(params.user.tenant.kind),
        "Pode comecar agora me mandando algo simples, como: \"gastei R$ 15 no lanche\", \"recebi R$ 1.200 de um cliente\", \"tenho aluguel para pagar dia 10\" ou enviar um extrato/comprovante."
      ].join("\n\n")
    : [
        params.savedSummary,
        onboardingTeachingTip(params.currentStep, params.user.tenant.kind),
        params.currentStep === 2 ? assistantCapabilities(params.user.tenant.kind) : "",
        params.nextQuestion
      ].filter(Boolean).join("\n\n");

  const prompt = [
    "Voce esta conduzindo o primeiro acesso de uma pessoa no SaaS Merli360/Gestao Rural 360.",
    "Use obrigatoriamente o contexto global configurado pelo superadmin, que ja foi injetado na chamada da IA.",
    "Objetivo: conversar de forma humana, ensinar o usuario a usar o sistema e a IA, e ao mesmo tempo salvar memoria util.",
    "Nao faca palestra. Responda como uma assistente proxima e pratica.",
    "Sempre faca estes 4 blocos, de forma curta:",
    "1. Confirme o que entendeu e o que foi salvo na memoria.",
    "2. Explique por que isso ajuda o sistema/IA.",
    "3. De uma dica rapida de uso ligada ao passo atual.",
    "4. Faca uma unica proxima pergunta objetiva.",
    "Se o onboarding terminou, troque a pergunta por um mini tutorial e uma sugestao de primeiro comando.",
    "Nao invente dados. Use valores e contas somente se estiverem no resumo salvo.",
    `Usuario cadastrado: ${params.user.name}`,
    `Tenant: ${params.user.tenant.kind} - ${params.user.tenant.brandName}`,
    `Passo atual: ${params.currentStep + 1} de ${onboardingTotalSteps}`,
    `Resposta do usuario: ${params.userMessage}`,
    `Resumo do que foi salvo: ${params.savedSummary}`,
    `Dica do passo: ${onboardingTeachingTip(params.currentStep, params.user.tenant.kind)}`,
    `Capacidades do sistema: ${assistantCapabilities(params.user.tenant.kind)}`,
    `Tutorial se finalizado: ${params.completed ? onboardingTutorial(params.user.tenant.kind) : ""}`,
    `Proxima pergunta obrigatoria: ${params.completed ? "" : params.nextQuestion}`
  ].join("\n\n");

  const answer = await askAi(prompt, { timeoutMs: 18000, useOpenAI: true });
  return answer?.trim() || fallback;
}

function simpleNameFromText(text: string) {
  const match = text.match(/\b(?:meu nome e|meu nome é|me chamo|eu sou)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2})/i);
  return match?.[1]?.trim();
}

function parseBrazilianMoney(value: string) {
  const negative = /(^|[\s(])-|devo|devendo|negativo|fatura|cart[aã]o/i.test(value);
  const match = value.match(/(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?-?\d+[,.]\d{2}|(?:R\$\s*)?-?\d+/i);
  if (!match) return null;
  const raw = match[0].replace(/R\$/i, "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return negative || amount < 0 ? -Math.abs(amount) : amount;
}

function accountNameFromText(text: string) {
  const value = text.toLowerCase();
  if (/\bpj\b|empresa|mei|juridica|jurídica/.test(value)) return "PJ";
  if (/pessoal|pf|fisica|física/.test(value)) return "pessoal";
  if (/dinheiro|caixa|especie|espécie/.test(value)) return "dinheiro";
  if (/cart[aã]o|credito|crédito|fatura/.test(value)) return "cartao";
  if (/nubank/.test(value)) return "Nubank";
  if (/mercado\s*pago|mercadopago/.test(value)) return "Mercado Pago";
  if (/picpay/.test(value)) return "PicPay";
  if (/inter/.test(value)) return "Inter";
  if (/itau|ita[uú]/.test(value)) return "Itau";
  if (/santander/.test(value)) return "Santander";
  if (/bradesco/.test(value)) return "Bradesco";
  if (/caixa economica|caixa\b/.test(value)) return "Caixa";
  if (/outro/.test(value)) return "outro";
  const withoutMoney = text
    .replace(/(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?-?\d+[,.]\d{2}|(?:R\$\s*)?-?\d+/gi, "")
    .replace(/\b(saldo|inicial|tenho|na|no|em|conta|carteira|banco|reais|real|r\$|de)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutMoney.length >= 2 && withoutMoney.length <= 28 ? withoutMoney : "";
}

function parseInitialBalances(text: string) {
  if (/tudo\s+zerado|zerad[oa]|nao sei|não sei|sem saldo/i.test(text)) {
    return [
      { name: "PJ", amount: 0 },
      { name: "pessoal", amount: 0 },
      { name: "dinheiro", amount: 0 },
      { name: "cartao", amount: 0 }
    ];
  }
  const parts = text
    .split(/\n|;|,(?=\s*[A-Za-zÀ-ÿ])|\s+\be\b\s+(?=[A-Za-zÀ-ÿ])/i)
    .map((item) => item.trim())
    .filter(Boolean);
  const balances = new Map<string, number>();
  for (const part of parts.length ? parts : [text]) {
    const amount = parseBrazilianMoney(part);
    if (amount === null) continue;
    const account = accountNameFromText(part);
    if (!account) continue;
    balances.set(account, amount);
  }
  return [...balances.entries()].map(([name, amount]) => ({ name, amount }));
}

async function registerInitialBalances(tenantId: string, message: string) {
  const balances = parseInitialBalances(message);
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const results = [];
  for (const balance of balances) {
    const type = balance.name === "cartao" ? "cartao de credito" : balance.name === "dinheiro" ? "dinheiro/caixa" : "conta bancaria";
    const account = await prisma.financialAccount.upsert({
      where: { tenantId_name: { tenantId, name: balance.name } },
      update: {
        initialBalanceCents: Math.round(balance.amount * 100),
        initialBalanceDate: date,
        includeInTotal: balance.name !== "cartao",
        status: "ativa"
      },
      create: {
        tenantId,
        name: balance.name,
        type,
        currency: "BRL",
        initialBalanceCents: Math.round(balance.amount * 100),
        initialBalanceDate: date,
        includeInTotal: balance.name !== "cartao",
        status: "ativa"
      }
    });
    results.push(account);
  }
  return results;
}

async function summarizeOnboardingMemory(params: { profile: any; message: string; tenantKind: string; step: number; question: string; userName: string }) {
  const prompt = [
    "Extraia memoria util de onboarding para uma assistente financeira de SaaS.",
    "Retorne apenas JSON valido.",
    "Campos: ownerName opcional apenas se o usuario corrigir o nome, goalsText opcional, memoryAddition texto curto em portugues com fatos duraveis sobre rotina, contas, metas, modulos e preferencias.",
    "Nao invente. Se nao souber, deixe vazio.",
    "A resposta faz parte de uma entrevista de primeiro acesso. Salve o aprendizado de forma organizada para uso futuro da IA.",
    `Nome cadastrado no SaaS: ${params.userName}`,
    `Perfil atual: ${JSON.stringify(params.profile)}`,
    `Tipo: ${params.tenantKind}`,
    `Passo: ${params.step}`,
    `Pergunta feita: ${params.question}`,
    `Resposta do usuario: ${params.message}`,
    'Formato: {"ownerName":"","goalsText":"","memoryAddition":""}'
  ].join("\n");
  const answer = await askAi(prompt, { json: true, timeoutMs: 15000 });
  const parsed = parseJsonBlock<{ ownerName?: string; goalsText?: string; memoryAddition?: string }>(answer || "");
  const fallbackName = simpleNameFromText(params.message);
  return {
    ownerName: parsed?.ownerName?.trim() || fallbackName || "",
    goalsText: parsed?.goalsText?.trim() || "",
    memoryAddition: parsed?.memoryAddition?.trim() || `Resposta de onboarding: ${params.message}`
  };
}

async function handleOnboarding(params: { user: any; profile: any; message: string }) {
  const currentStep = Number(params.profile.onboardingStep || 0);
  const extracted = await summarizeOnboardingMemory({
    profile: params.profile,
    message: params.message,
    tenantKind: params.user.tenant.kind,
    step: currentStep,
    question: onboardingQuestion(currentStep, params.user.tenant.kind),
    userName: params.user.name
  });
  const completed = currentStep >= onboardingTotalSteps - 1;
  const memoryAddition = [
    `Passo ${currentStep + 1} da entrevista (${new Date().toISOString().slice(0, 10)}):`,
    `Pergunta: ${onboardingQuestion(currentStep, params.user.tenant.kind)}`,
    extracted.memoryAddition
  ].join(" ");
  const memoryText = mergeMemory(params.profile.memoryText, memoryAddition);
  const goalsText = extracted.goalsText
    ? mergeMemory(params.profile.goalsText, extracted.goalsText)
    : currentStep === 3 || currentStep === 4
      ? mergeMemory(params.profile.goalsText, params.message)
    : params.profile.goalsText || "";
  const initialBalanceAccounts = currentStep === 2 ? await registerInitialBalances(params.user.tenantId, params.message) : [];

  const profile = await prisma.assistantProfile.update({
    where: { id: params.profile.id },
    data: {
      ownerName: extracted.ownerName || params.profile.ownerName || params.user.name,
      goalsText,
      memoryText,
      onboardingStep: completed ? onboardingTotalSteps : currentStep + 1,
      onboardingCompleted: completed
    }
  });

  const savedSummary = memorySavedSummary({ step: currentStep, memoryAddition: extracted.memoryAddition, initialBalanceAccounts });
  const nextQuestion = nextOnboardingQuestion(currentStep + 1, params.user.tenant.kind);
  const answer = await buildOnboardingAssistantAnswer({
    user: params.user,
    profile,
    userMessage: params.message,
    savedSummary,
    currentStep,
    completed,
    nextQuestion,
    initialBalanceAccounts
  });

  const assistantMessage = await prisma.assistantMessage.create({
    data: {
      tenantId: params.user.tenantId,
      userId: params.user.id,
      role: "assistant",
      content: answer,
      metadata: JSON.stringify({ onboarding: true, onboardingStep: profile.onboardingStep, onboardingCompleted: profile.onboardingCompleted, initialBalanceAccounts: initialBalanceAccounts.map((account) => account.id) })
    }
  });

  return { answer, assistantMessage, profile };
}

async function buildContext(user: any) {
  const unified = await getUnifiedAssistantContext(user, currentMonth());
  const recentMessages = await prisma.assistantMessage.findMany({
    where: { tenantId: user.tenantId, userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 8
  });
  return {
    ...compactForPrompt(unified),
    profile: unified.profile,
    dueNotifications: unified.dueNotifications.summary,
    dueItems: unified.dueNotifications.items.slice(0, 12),
    recentMessages: recentMessages.reverse().map((item) => ({ role: item.role, content: item.content }))
  };
}

export async function GET() {
  const user = await requireApiUser();
  const profile = await getOrCreateAssistantProfile(user);
  const messages = await prisma.assistantMessage.findMany({
    where: { tenantId: user.tenantId, userId: user.id },
    orderBy: { createdAt: "asc" },
    take: 50
  });
  if (!messages.length && !profile.onboardingCompleted) {
    return NextResponse.json({
      messages: [{ role: "assistant", content: onboardingIntro(profile, user.tenant.kind, user.name), metadata: JSON.stringify({ onboarding: true }) }],
      profile,
      onboardingRequired: true
    });
  }
  if (!profile.onboardingCompleted && messages.length === 1 && messages[0].role === "assistant" && isLegacyOnboardingIntro(messages[0].content)) {
    return NextResponse.json({
      messages: [{ role: "assistant", content: onboardingIntro(profile, user.tenant.kind, user.name), metadata: JSON.stringify({ onboarding: true, refreshed: true }) }],
      profile,
      onboardingRequired: true
    });
  }
  return NextResponse.json({ messages, profile, onboardingRequired: !profile.onboardingCompleted });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  const body = await request.json();
  const message = String(body.message || "").trim();
  if (!message) return NextResponse.json({ error: "Mensagem obrigatoria" }, { status: 400 });

  const context = await buildContext(user);
  const runtime = await getAiRuntimeConfig();
  await prisma.assistantMessage.create({ data: { tenantId: user.tenantId, userId: user.id, role: "user", content: message } });

  const directTool = await runAssistantTool({ user, message, request });
  if (directTool.handled) {
    const conversationalAnswer = await makeConversationalToolAnswer({
      context,
      message,
      tool: directTool.tool || "consulta",
      rawAnswer: directTool.answer || "Ferramenta executada.",
      data: directTool.data
    });
    const assistantMessage = await prisma.assistantMessage.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        role: "assistant",
        content: conversationalAnswer,
        metadata: JSON.stringify({ tool: directTool.tool, data: directTool.data, rawAnswer: directTool.answer })
      }
    });
    await rememberFromConversation({ user, profile: context.profile, userMessage: message, assistantAnswer: conversationalAnswer, actionResult: { action: directTool.tool, data: directTool.data } });
    return NextResponse.json({ answer: conversationalAnswer, message: assistantMessage, tool: directTool.tool, data: directTool.data, onboardingRequired: !context.profile.onboardingCompleted });
  }

  const operationalMessage = buildOperationalMessage(context, message);
  const interpreted = await interpretFinancialOperation({
    tenantId: user.tenantId,
    userId: user.id,
    tenantKind: user.tenant.kind,
    message: operationalMessage
  });
  const missingAnswer = missingFieldAnswer(interpreted.operation);
  if (missingAnswer) {
    const assistantMessage = await prisma.assistantMessage.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        role: "assistant",
        content: missingAnswer,
        metadata: JSON.stringify({ interpreted, missingField: true })
      }
    });
    return NextResponse.json({ answer: missingAnswer, message: assistantMessage, onboardingRequired: !context.profile.onboardingCompleted });
  }
  const hasPendingAction = Boolean(
    interpreted.operation?.action &&
    interpreted.operation.action !== "none" &&
    interpreted.operation.shouldExecute &&
    Number(interpreted.operation.confidence || 0) >= 0.55
  );
  const pendingPlan = hasPendingAction
    ? await saveAssistantPlan({
        tenantId: user.tenantId,
        userId: user.id,
        userRole: user.role,
        message: operationalMessage,
        operation: interpreted.operation,
        autoExecute: runtime.autoExecute
      })
    : null;

  if (!hasPendingAction && interpreted.operation?.action === "none" && interpreted.operation?.answer && (/faltou|informe|digite|qual|preciso/i.test(interpreted.operation.answer) || isCorrectionMessage(message))) {
    const answer = interpreted.operation.answer;
    const assistantMessage = await prisma.assistantMessage.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        role: "assistant",
        content: answer,
        metadata: JSON.stringify({ interpreted, missingFromInterpreter: true })
      }
    });
    return NextResponse.json({ answer, message: assistantMessage, onboardingRequired: !context.profile.onboardingCompleted });
  }

  if (interpreted.operation?.action === "create_report" && interpreted.operation.shouldExecute) {
    const actionResult = await executeAssistantOperation({
      tenantId: user.tenantId,
      tenantKind: user.tenant.kind,
      userId: user.id,
      message: operationalMessage,
      operation: interpreted.operation,
      enrichment: interpreted.enrichment,
      request
    });
    const suffix = context.profile.onboardingCompleted ? "" : "\n\nDepois disso, continuamos o primeiro aprendizado pelo formulario ou pela entrevista da IA.";
    const answer = `${actionResult.message}${suffix}`;
    const assistantMessage = await prisma.assistantMessage.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        role: "assistant",
        content: answer,
        metadata: JSON.stringify({ month: context.month, actionResult, autoExecuted: true, report: true })
      }
    });
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "ai_generate_report",
      entity: String(interpreted.operation.action),
      request,
      metadata: { actionResult }
    });
    await rememberFromConversation({ user, profile: context.profile, userMessage: message, assistantAnswer: answer, actionResult });
    return NextResponse.json({ answer, message: assistantMessage, actionResult, enrichment: interpreted.enrichment, onboardingRequired: !context.profile.onboardingCompleted });
  }

  if (!context.profile.onboardingCompleted) {
    if (isConcreteActionDuringOnboarding(interpreted.operation, Number(context.profile.onboardingStep || 0))) {
    if (runtime.autoExecute && interpreted.operation.action !== "reset_operational_data" && interpreted.operation.action !== "reset_ai_learning") {
        const actionResult = await executeAssistantOperation({
          tenantId: user.tenantId,
          tenantKind: user.tenant.kind,
          userId: user.id,
          message: operationalMessage,
          operation: interpreted.operation,
          enrichment: interpreted.enrichment,
          request
        });
        const answer = `${actionResult.message}\n\nDepois continuamos a entrevista inicial para configurar sua memória.`;
        const assistantMessage = await prisma.assistantMessage.create({
          data: { tenantId: user.tenantId, userId: user.id, role: "assistant", content: answer, metadata: JSON.stringify({ actionResult, autoExecuted: true, onboardingPaused: true }) }
        });
        return NextResponse.json({ answer, message: assistantMessage, actionResult, enrichment: interpreted.enrichment, onboardingRequired: true, pendingPlanId: pendingPlan?.record.id || null });
      }
      const answer = `${preparedActionAnswer(interpreted.operation)}\n\nDepois disso, continuamos a entrevista inicial para configurar sua memória.`;
      const assistantMessage = await prisma.assistantMessage.create({
        data: { tenantId: user.tenantId, userId: user.id, role: "assistant", content: answer, metadata: JSON.stringify({ pendingAction: interpreted.operation, onboardingPaused: true }) }
      });
      return NextResponse.json({ answer, message: assistantMessage, pendingAction: interpreted.operation, pendingPlanId: pendingPlan?.record.id || null, enrichment: interpreted.enrichment, onboardingRequired: true });
    }
    if (isOnboardingContinueRequest(message)) {
      const answer = [
        "Sim, vamos continuar.",
        onboardingQuestion(Number(context.profile.onboardingStep || 0), user.tenant.kind)
      ].join("\n\n");
      const assistantMessage = await prisma.assistantMessage.create({
        data: { tenantId: user.tenantId, userId: user.id, role: "assistant", content: answer, metadata: JSON.stringify({ onboarding: true, repeatedQuestion: true }) }
      });
      return NextResponse.json({ answer, message: assistantMessage, onboardingRequired: true });
    }
    const infoAnswer = informationalAnswerDuringOnboarding(context, message);
    if (infoAnswer) {
      const assistantMessage = await prisma.assistantMessage.create({
        data: { tenantId: user.tenantId, userId: user.id, role: "assistant", content: infoAnswer, metadata: JSON.stringify({ onboardingPaused: true, informational: true }) }
      });
      return NextResponse.json({ answer: infoAnswer, message: assistantMessage, onboardingRequired: true });
    }
    const onboarding = await handleOnboarding({ user, profile: context.profile, message });
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "ai_onboarding_step",
      entity: "assistantProfile",
      entityId: onboarding.profile.id,
      request,
      metadata: { onboardingStep: onboarding.profile.onboardingStep, onboardingCompleted: onboarding.profile.onboardingCompleted }
    });
    return NextResponse.json({
      answer: onboarding.answer,
      message: onboarding.assistantMessage,
      profile: onboarding.profile,
      onboardingRequired: !onboarding.profile.onboardingCompleted
    });
  }

  if (["reset_operational_data", "reset_ai_learning"].includes(interpreted.operation?.action || "")) {
    const answer = preparedActionAnswer(interpreted.operation);
    const assistantMessage = await prisma.assistantMessage.create({
      data: { tenantId: user.tenantId, userId: user.id, role: "assistant", content: answer, metadata: JSON.stringify({ pendingAction: interpreted.operation, command: interpreted.operation.action }) }
    });
    return NextResponse.json({ answer, message: assistantMessage, pendingAction: interpreted.operation, pendingPlanId: pendingPlan?.record.id || null, enrichment: interpreted.enrichment });
  }

  const prompt = assistantConversationPrompt({
    context,
    interpreted,
    pendingConfirmation: hasPendingAction,
    message
  });

  let answer = await askAi(prompt, { timeoutMs: 25000, useWebSearch: runtime.webSearchEnabled });
  if (!answer) answer = localAnswer(context, message);

  if (hasPendingAction && runtime.autoExecute && interpreted.operation.action !== "reset_operational_data" && interpreted.operation.action !== "reset_ai_learning") {
    const actionResult = await executeAssistantOperation({
      tenantId: user.tenantId,
      tenantKind: user.tenant.kind,
      userId: user.id,
      message: operationalMessage,
      operation: interpreted.operation,
      enrichment: interpreted.enrichment,
      request
    });
    answer = `${actionResult.message}\n\n${answer}`;
    const assistantMessage = await prisma.assistantMessage.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        role: "assistant",
        content: answer,
        metadata: JSON.stringify({ month: context.month, actionResult, autoExecuted: true })
      }
    });
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "ai_auto_execute_action",
      entity: String(interpreted.operation.action),
      entityId: actionResult.item?.id,
      request,
      metadata: { actionResult }
    });
    await rememberFromConversation({ user, profile: context.profile, userMessage: message, assistantAnswer: answer, actionResult });
    return NextResponse.json({ answer, message: assistantMessage, actionResult, enrichment: interpreted.enrichment, pendingPlanId: pendingPlan?.record.id || null });
  }

  if (hasPendingAction) {
    answer = [
      answer,
      "",
      preparedActionAnswer(interpreted.operation)
    ].join("\n").trim();
  }

  const assistantMessage = await prisma.assistantMessage.create({
    data: { tenantId: user.tenantId, userId: user.id, role: "assistant", content: answer, metadata: JSON.stringify({ month: context.month, pendingAction: hasPendingAction ? interpreted.operation : null }) }
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "ai_assistant_chat",
    entity: "assistantMessages",
    entityId: assistantMessage.id,
    request,
    metadata: { messageLength: message.length, pendingAction: hasPendingAction ? interpreted.operation : null }
  });

  await rememberFromConversation({ user, profile: context.profile, userMessage: message, assistantAnswer: answer, pendingAction: hasPendingAction ? interpreted.operation : null });

  return NextResponse.json({ answer, message: assistantMessage, pendingAction: hasPendingAction ? interpreted.operation : null, pendingPlanId: pendingPlan?.record.id || null, enrichment: interpreted.enrichment });
}
