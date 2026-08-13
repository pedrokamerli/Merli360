import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { askAi, askAiParts, parseJsonBlock } from "@/lib/ai";
import { syncPayableToLedger, syncReceivableToLedger } from "@/lib/financial-ledger";
import { syncPayablePayment, syncReceivablePayment } from "@/lib/transaction-sync";
import { getOrCreateAssistantProfile, initialStructuredMemory } from "@/lib/assistant-profile";
import { syncHarvestStock, syncSaleAutomation } from "@/lib/rural-sync";
import { financialReportFallbackText, getFinancialReportData } from "@/lib/reports";
import { buildAiPlan } from "@/lib/ai-plan";
import { evaluateAiPolicy } from "@/lib/ai-policy";
import { auditAiPlan } from "@/lib/ai-audit-service";

export type AssistantActionResult = {
  executed: boolean;
  message: string;
  action?: string;
  item?: any;
  analysis?: any;
  enrichment?: any;
  redirectTo?: string;
};

type Operation = {
  action: "none" | "create_transaction" | "create_payable" | "create_receivable" | "delete_record" | "create_report" | "update_profile" | "update_initial_balance" | "create_record" | "update_record" | "reset_operational_data" | "reset_ai_learning";
  confidence?: number;
  type?: "entrada" | "saida";
  amount?: number;
  description?: string;
  category?: string;
  subcategory?: string;
  costCenter?: string;
  account?: string;
  paymentMethod?: string;
  date?: string;
  notes?: string;
  establishmentName?: string;
  document?: string;
  shouldExecute?: boolean;
  dueDate?: string;
  reportType?: string;
  targetModel?: string;
  targetId?: string;
  searchText?: string;
  ownerName?: string;
  goalsText?: string;
  memoryText?: string;
  setupNotes?: string;
  balances?: Array<{ account: string; amount: number }>;
  data?: Record<string, any>;
  answer?: string;
};

function cents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

function normalize(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function currentUserMessage(text: string) {
  const marker = "Mensagem atual do usuario:";
  return text.includes(marker) ? text.split(marker).pop()!.trim() : text;
}

function correctionOnlyAnswer(text: string) {
  const value = normalize(currentUserMessage(text));
  if (!value) return "";
  const isCorrection = /\b(nao pedi|nao foi isso|nao era isso|voce esta variando|vc ta variando|esta variando|ta variando|viajou|esta viajando|ta viajando|para|cancela|cancelar|esquece|errado)\b/.test(value);
  if (!isCorrection) return "";
  return [
    "Tem razao, eu puxei coisa que voce nao pediu.",
    "Vou parar essa acao e nao vou registrar nem gerar nada agora.",
    "Me manda do jeito simples o que voce quer fazer: registrar entrada, registrar despesa, criar conta a pagar, criar conta a receber, consultar saldo ou fazer um relatorio."
  ].join("\n\n");
}

function todayDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
}

function parseDate(value?: string | null) {
  if (!value) return todayDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00.000Z`);
  const br = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return new Date(Date.UTC(Number(year), Number(br[2]) - 1, Number(br[1]), 12));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? todayDate() : parsed;
}

function fallbackPaymentMethod(text: string) {
  const value = normalize(text);
  if (value.includes("pix")) return "Pix";
  if (value.includes("dinheiro") || value.includes("cash")) return "Dinheiro";
  if (value.includes("credito") || value.includes("crÃ©dito")) return "Credito";
  if (value.includes("debito") || value.includes("dÃ©bito")) return "Debito";
  if (value.includes("boleto")) return "Boleto";
  if (value.includes("transfer")) return "Transferencia";
  if (value.includes("cartao") || value.includes("cartÃ£o")) return "Cartao";
  return "";
}

function fallbackCategory(text: string, type: "entrada" | "saida", tenantKind: string) {
  const value = normalize(text);
  if (type === "entrada") {
    if (tenantKind === "agro" && /(hortalica|hortali|alface|couve|legume|tomate|mercado|restaurante|distribuid)/.test(value)) return "Vendas de hortalicas";
    if (/salario|salÃ¡rio/.test(value)) return "Outras receitas";
    if (/venda|recebi|recebimento|cliente/.test(value)) return "Venda de servicos";
    return "Entrada a conferir";
  }
  if (/pastel|lanche|almoco|almoÃ§o|jantar|feira|restaurante|padaria|mercado|ifood/.test(value)) return "Alimentacao";
  if (/uber|99|transporte|frete/.test(value)) return "Transporte e frete";
  if (/gasolina|etanol|posto|combustivel|combustÃ­vel/.test(value)) return "Combustivel";
  if (/canva|openai|chatgpt|capcut|sistema|software/.test(value)) return "Ferramentas e sistemas";
  if (tenantKind === "agro" && /semente|muda/.test(value)) return "Sementes/mudas";
  if (tenantKind === "agro" && /adubo|fertilizante/.test(value)) return "Adubo/fertilizante";
  if (tenantKind === "agro" && /defensivo|veneno/.test(value)) return "Defensivos";
  return "A conferir";
}

function parseMoneyFromText(text: string) {
  const candidates = [...text.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2}|\d+)/gi)]
    .map((match) => {
      const raw = match[0];
      const index = match.index || 0;
      const before = text.slice(Math.max(0, index - 28), index).toLowerCase();
      const after = text.slice(index + raw.length, index + raw.length + 20).toLowerCase();
      const numberText = match[1];
      const value = Number(numberText.replace(/\./g, "").replace(",", "."));
      const hasDecimals = /[,.]\d{2}$/.test(numberText);
      const hasCurrency = /r\$/i.test(raw) || /r\$\s*$/.test(before);
      const looksDate = /\d{1,2}[\/.-]\d{1,2}/.test(`${before}${raw}${after}`) || /\b20\d{2}\b/.test(raw);
      const looksDocument = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}/.test(`${before}${raw}${after}`) || /\b(doc|cpf|cnpj|cod|aut|nsu)\b/.test(before);
      let score = value > 0 ? 1 : -10;
      if (hasDecimals) score += 3;
      if (hasCurrency) score += 5;
      if (/\b(valor|total|pago|pagamento|debito|credito|compra)\b/.test(before)) score += 4;
      if (looksDate) score -= 8;
      if (looksDocument) score -= 6;
      if (value > 100000) score -= 4;
      return { value, score, index };
    })
    .filter((item) => Number.isFinite(item.value) && item.value > 0);
  const best = candidates.sort((a, b) => b.score - a.score || b.index - a.index)[0];
  return best?.value || 0;
}

function accountNameFromText(text: string) {
  const value = normalize(text);
  if (/\bpj\b|empresa|mei|juridica|juridico/.test(value)) return "PJ";
  if (/pessoal|pf|fisica/.test(value)) return "pessoal";
  if (/dinheiro|caixa|especie/.test(value)) return "dinheiro";
  if (/cartao|credito|fatura/.test(value)) return "cartao";
  if (/santander/.test(value)) return "Santander";
  if (/nubank/.test(value)) return "Nubank";
  if (/mercado\s*pago|mercadopago/.test(value)) return "Mercado Pago";
  if (/infinity\s*pay|infinity/.test(value)) return "Infinity Pay";
  if (/inter/.test(value)) return "Inter";
  if (/itau/.test(value)) return "Itau";
  if (/bradesco/.test(value)) return "Bradesco";
  return "";
}

function assistantPaymentMethod(text: string) {
  const value = normalize(text);
  if (value.includes("pix")) return "Pix";
  if (value.includes("dinheiro") || value.includes("cash")) return "Dinheiro";
  if (value.includes("credito")) return "Credito";
  if (value.includes("debito")) return "Debito";
  if (value.includes("boleto")) return "Boleto";
  if (value.includes("ted") || value.includes("doc") || value.includes("transfer")) return "Transferencia";
  if (value.includes("cartao")) return "Cartao";
  return fallbackPaymentMethod(text);
}

function assistantCategory(text: string, type: "entrada" | "saida", tenantKind: string) {
  const value = normalize(text);
  if (type === "entrada") {
    if (tenantKind === "agro" && /(hortalica|hortali|alface|couve|legume|tomate|mercado|restaurante|distribuid)/.test(value)) return "Vendas de hortalicas";
    if (/salario/.test(value)) return "Outras receitas";
    if (/venda|vendi|recebi|recebimento|cliente|servico|mensalidade|pix recebido/.test(value)) return "Venda de servicos";
    return "Entrada a conferir";
  }
  if (/pastel|lanche|almoco|jantar|feira|restaurante|padaria|mercado|ifood/.test(value)) return "Alimentacao";
  if (/uber|99|transporte|frete/.test(value)) return "Transporte e frete";
  if (/gasolina|etanol|posto|combustivel/.test(value)) return "Combustivel";
  if (/canva|openai|chatgpt|capcut|sistema|software|assinatura|internet/.test(value)) return "Ferramentas e sistemas";
  if (/aluguel|condominio|moradia|casa/.test(value)) return "Moradia";
  if (/luz|energia|agua|telefone|celular/.test(value)) return "Despesas fixas";
  if (tenantKind === "agro" && /semente|muda/.test(value)) return "Sementes/mudas";
  if (tenantKind === "agro" && /adubo|fertilizante/.test(value)) return "Adubo/fertilizante";
  if (tenantKind === "agro" && /defensivo|veneno/.test(value)) return "Defensivos";
  return fallbackCategory(text, type, tenantKind);
}

function assistantDateFromText(text: string) {
  const normalized = normalize(text);
  const date = todayDate();
  if (/\bontem\b/.test(normalized)) date.setUTCDate(date.getUTCDate() - 1);
  if (/\bamanha\b/.test(normalized)) date.setUTCDate(date.getUTCDate() + 1);
  const br = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (br) {
    const year = br[3] ? (br[3].length === 2 ? `20${br[3]}` : br[3]) : String(date.getUTCFullYear());
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10);
}

function assistantHasExplicitDate(text: string) {
  const normalized = normalize(text);
  return /\b(hoje|ontem|amanha)\b/.test(normalized) || /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(text);
}

function assistantDescriptionFromText(text: string) {
  const currentMessage = text.split("Mensagem atual do usuario:").pop() || text;
  const cleaned = currentMessage
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|(?:r\$\s*)?\d+[,.]\d{2}|(?:r\$\s*)?\d+/gi, "")
    .replace(/\b(reais|real|conto|conta de|tenho uma|tenho um|para pagar|a pagar|a receber|recebi|recebido|receber|gastei|paguei|pagamento|comprovante|compra|comprei|vendi|venda|valor|total|hoje|ontem|amanha|pix|no|na|em|pela|pelo|via)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.;:-]+|[,.;:-]+$/g, "")
    .trim();
  return cleaned.slice(0, 120);
}

function assistantMissingIntentAnswer(normalized: string) {
  if (/(registr|lancar|adicionar|criar|incluir).*(despesa|saida|gasto)/.test(normalized)) {
    return "Consigo registrar a despesa. Me mande o valor e, se souber, a conta e a forma de pagamento. Ex: paguei R$ 35 de combustivel no Pix pela PJ.";
  }
  if (/(registr|lancar|adicionar|criar|incluir).*(entrada|receita|recebimento|pix|venda)/.test(normalized)) {
    return "Consigo registrar a entrada. Me mande o valor e em qual conta caiu. Ex: recebi R$ 1.000 via Pix na PJ.";
  }
  if (/(conta|boleto).*(pagar)|tenho que pagar|preciso pagar/.test(normalized)) {
    return "Consigo criar a conta a pagar. Faltou o valor ou vencimento. Ex: tenho que pagar R$ 160 da internet dia 10.";
  }
  if (/(conta|valor).*(receber)|tenho a receber|cliente.*pagar|vai me pagar/.test(normalized)) {
    return "Consigo criar a conta a receber. Faltou o valor ou a data prevista. Ex: cliente Joao vai pagar R$ 800 dia 15.";
  }
  return "";
}

function matchFinancialAccount(name: string | undefined | null, accounts: Array<{ name: string }>) {
  const normalized = normalize(name || "");
  if (!normalized) return "";
  const exact = accounts.find((account) => normalize(account.name) === normalized);
  if (exact) return exact.name;
  const contained = accounts.find((account) => normalized.includes(normalize(account.name)) || normalize(account.name).includes(normalized));
  return contained?.name || name || "";
}

function parseBalancePairsFromText(text: string) {
  const matches = [...text.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2}|\d+)/gi)];
  const balances = new Map<string, number>();
  for (const match of matches) {
    const raw = match[0];
    const index = match.index || 0;
    const before = text.slice(Math.max(0, index - 56), index);
    const after = text.slice(index + raw.length, index + raw.length + 18);
    const accountTokens = [
      { regex: /\bpj\b|empresa|mei|juridica|juridico/gi, account: "PJ" },
      { regex: /pessoal|pf|fisica/gi, account: "pessoal" },
      { regex: /dinheiro|caixa|especie/gi, account: "dinheiro" },
      { regex: /cartao|credito|fatura/gi, account: "cartao" }
    ];
    let nearest = { account: "", index: -1 };
    for (const token of accountTokens) {
      for (const item of before.matchAll(token.regex)) {
        if ((item.index || 0) >= nearest.index) nearest = { account: token.account, index: item.index || 0 };
      }
    }
    const account = nearest.account || accountNameFromText(`${before} ${after}`);
    if (!account) continue;
    const value = Number(match[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(value)) balances.set(account, value);
  }
  return [...balances.entries()].map(([account, amount]) => ({ account, amount }));
}

function localOperationFromText(text: string, tenantKind: string): Operation | null {
  const userText = currentUserMessage(text);
  const correctionAnswer = correctionOnlyAnswer(userText);
  if (correctionAnswer) {
    return { action: "none", confidence: 0.98, shouldExecute: false, answer: correctionAnswer };
  }
  const normalized = normalize(userText);
  if (normalized === "reset boom" || normalized === "resetboom") {
    return {
      action: "reset_operational_data",
      confidence: 0.99,
      shouldExecute: true,
      answer: "Reset boom vai apagar os registros operacionais do seu tenant para teste, mantendo usuarios, categorias, carteiras e configuracoes."
    };
  }
  if (normalized === "reset ia" || normalized === "resetia") {
    return {
      action: "reset_ai_learning",
      confidence: 0.99,
      shouldExecute: true,
      answer: "Reset IA vai apagar somente a memoria, conversa e regras aprendidas da assistente deste usuario. Seus lancamentos, contas, categorias e carteiras serao mantidos."
    };
  }
  if (/resumo diario|resumo do dia|fechamento do dia|como foi hoje/.test(normalized)) {
    return { action: "create_report", confidence: 0.9, shouldExecute: true, reportType: "diario" };
  }
  if (/resumo semanal|semana|fechamento semanal/.test(normalized) && /resumo|relatorio|fechamento|analise/.test(normalized)) {
    return { action: "create_report", confidence: 0.9, shouldExecute: true, reportType: "semanal" };
  }
  if (/fechamento mensal|resumo mensal|relatorio mensal|mes atual|m[eÃª]s atual/.test(normalized) && /resumo|relatorio|fechamento|analise/.test(normalized)) {
    return { action: "create_report", confidence: 0.9, shouldExecute: true, reportType: "mensal" };
  }
  if (/(relatorio|resumo|analise).*(gasto|gastos|despesa|despesas|saida|saidas)|(gasto|gastos|despesa|despesas|saida|saidas).*(relatorio|resumo|analise)/.test(normalized)) {
    return { action: "create_report", confidence: 0.92, shouldExecute: true, reportType: "gastos" };
  }

  const categoryMatch = userText.match(/(?:cria|criar|adicione|adicionar|cadastra|cadastrar)\s+(?:uma\s+)?categoria\s+(.+)/i);
  if (categoryMatch) {
    const name = categoryMatch[1].replace(/\b(de\s+)?(entrada|receita|saida|saÃ­da|despesa|chamada|chamado|nomeada|nomeado)\b/gi, "").trim();
    const type = /entrada|receita/i.test(categoryMatch[1]) ? "entrada" : /saida|saÃ­da|despesa/i.test(categoryMatch[1]) ? "saida" : "neutro";
    return { action: "create_record", confidence: 0.86, shouldExecute: true, targetModel: "categories", data: { name, type } };
  }

  const accountMatch = userText.match(/(?:cria|criar|adicione|adicionar|cadastra|cadastrar)\s+(?:uma\s+)?(?:conta|carteira)\s+(.+)/i);
  if (accountMatch) {
    const name = accountMatch[1].replace(/\b(financeira|bancaria|bancÃ¡ria|carteira|conta)\b/gi, "").trim();
    return { action: "create_record", confidence: 0.82, shouldExecute: true, targetModel: "financialAccounts", data: { name, type: /cartao|cartÃ£o|credito|crÃ©dito/i.test(name) ? "cartao de credito" : /dinheiro|caixa/i.test(name) ? "dinheiro/caixa" : "conta bancaria", currency: "BRL", includeInTotal: !/cartao|cartÃ£o/i.test(name), status: "ativa" } };
  }

  const amount = parseMoneyFromText(userText);
  if (!amount) {
    const answer = assistantMissingIntentAnswer(normalized);
    return answer ? { action: "none", confidence: 0.86, shouldExecute: false, answer } : null;
  }
  if (/saldo\s+inicial|saldo\s+atual|tenho\s+(?:r\$|\d)|carteira/.test(normalized)) {
    const balances = parseBalancePairsFromText(userText);
    const fallbackAccount = accountNameFromText(userText) || "PJ";
    const finalBalances = balances.length ? balances : [{ account: fallbackAccount, amount }];
    return {
      action: "update_initial_balance",
      confidence: 0.84,
      shouldExecute: true,
      balances: finalBalances,
      answer: `Atualizar saldo inicial: ${finalBalances.map((item) => `${item.account} R$ ${item.amount.toFixed(2)}`).join(", ")}.`
    };
  }
  const smartDate = assistantDateFromText(userText);
  const smartDueDate = assistantHasExplicitDate(userText) ? assistantDateFromText(userText) : undefined;
  const smartDescription = assistantDescriptionFromText(userText);
  const smartPaymentMethod = assistantPaymentMethod(userText);
  const smartAccount = accountNameFromText(userText);
  const isPayable = /(conta|boleto|venc|pagar|a pagar|preciso pagar|tenho que pagar|vou pagar)/.test(normalized) && !/(paguei|pago|pagamento feito|acabei de pagar)/.test(normalized);
  const isReceivable = /(a receber|conta a receber|tenho a receber|vai me pagar|vai pagar|cliente.*pagar|cobrar)/.test(normalized) && !/(recebi|recebido|caiu|entrou)/.test(normalized);
  const isIncome = /(recebi|recebido|receber um pix|pix recebido|entrou|caiu|salario|venda|vendi|entrada|deposito recebido|transferencia recebida)/.test(normalized);
  const isExpense = /(gastei|paguei|pagamento|comprovante|comprei|compra|despesa|saida|pix enviado|saiu|debito)/.test(normalized);
  if (isPayable) {
    return {
      action: "create_payable",
      confidence: 0.82,
      shouldExecute: true,
      amount,
      description: smartDescription || "Conta a pagar",
      category: assistantCategory(userText, "saida", tenantKind),
      account: smartAccount,
      paymentMethod: smartPaymentMethod,
      dueDate: smartDueDate,
      notes: "Detectado por regra local da IA."
    };
  }
  if (isReceivable) {
    return {
      action: "create_receivable",
      confidence: 0.82,
      shouldExecute: true,
      amount,
      description: smartDescription || "Conta a receber",
      category: assistantCategory(userText, "entrada", tenantKind),
      account: smartAccount,
      paymentMethod: smartPaymentMethod,
      dueDate: smartDueDate,
      notes: "Detectado por regra local da IA."
    };
  }
  if (isIncome || smartPaymentMethod === "Pix" && /(receb|entrou|caiu|deposit)/.test(normalized)) {
    return {
      action: "create_transaction",
      confidence: 0.86,
      shouldExecute: true,
      type: "entrada",
      amount,
      description: smartDescription || "Receita informada",
      category: assistantCategory(userText, "entrada", tenantKind),
      paymentMethod: smartPaymentMethod,
      account: smartAccount,
      date: smartDate,
      notes: "Detectado por regra local da IA."
    };
  }
  if (isExpense) {
    return {
      action: "create_transaction",
      confidence: 0.86,
      shouldExecute: true,
      type: "saida",
      amount,
      description: smartDescription || "Despesa informada",
      category: assistantCategory(userText, "saida", tenantKind),
      paymentMethod: smartPaymentMethod,
      account: smartAccount,
      date: smartDate,
      notes: "Detectado por regra local da IA."
    };
  }
  const date = todayDate().toISOString().slice(0, 10);
  const tomorrow = new Date(todayDate());
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dueDate = normalized.includes("amanha") || normalized.includes("amanhÃ£") ? tomorrow.toISOString().slice(0, 10) : date;
  const description = text
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|(?:r\$\s*)?\d+[,.]\d{2}|(?:r\$\s*)?\d+/i, "")
    .replace(/\b(reais|real|conto|conta de|tenho uma|tenho um|para pagar|a pagar|recebi|gastei|paguei|pagamento|comprovante|compra|valor|total|hoje|amanha|amanhÃ£)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+\b(de|do|da|para)$/i, "")
    .trim();
  if (/(conta|boleto|venc|pagar|a pagar)/.test(normalized)) {
    return {
      action: "create_payable",
      confidence: 0.78,
      shouldExecute: true,
      amount,
      description: description || "Conta a pagar",
      category: fallbackCategory(text, "saida", tenantKind),
      account: accountNameFromText(text),
      paymentMethod: fallbackPaymentMethod(text),
      dueDate,
      notes: "Detectado por regra local da IA."
    };
  }
  if (/(recebi|receber|salario|salÃ¡rio|venda|pix recebido|entrada)/.test(normalized)) {
    return {
      action: "create_transaction",
      confidence: 0.82,
      shouldExecute: true,
      type: "entrada",
      amount,
      description: description || "Receita informada",
      category: fallbackCategory(text, "entrada", tenantKind),
      paymentMethod: fallbackPaymentMethod(text),
      account: accountNameFromText(text),
      date,
      notes: "Detectado por regra local da IA."
    };
  }
  if (/(gastei|paguei|pagamento|comprovante|comprei|compra|despesa|saida|saÃ­da)/.test(normalized)) {
    return {
      action: "create_transaction",
      confidence: 0.82,
      shouldExecute: true,
      type: "saida",
      amount,
      description: description || "Despesa informada",
      category: fallbackCategory(text, "saida", tenantKind),
      paymentMethod: fallbackPaymentMethod(text),
      account: accountNameFromText(text),
      date,
      notes: "Detectado por regra local da IA."
    };
  }
  return null;
}

async function allowedCategory(tenantId: string, name?: string | null, type?: string | null) {
  const categories = await prisma.category.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
  const normalized = normalize(name || "");
  const found = categories.find((item) => normalize(item.name) === normalized && (!type || item.type === type || item.type === "neutro"));
  return found?.name || "";
}

async function lookupBusinessContext(query?: string | null, document?: string | null) {
  const cnpj = String(document || query || "").replace(/\D/g, "");
  try {
    if (cnpj.length === 14) {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        return {
          source: "brasilapi",
          name: data.razao_social || data.nome_fantasia,
          fantasyName: data.nome_fantasia,
          cnae: data.cnae_fiscal_descricao,
          city: data.municipio,
          state: data.uf
        };
      }
    }
    if (query && query.trim().length >= 4) {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        const text = [data.AbstractText, data.Heading, data.RelatedTopics?.[0]?.Text].filter(Boolean).join(" ");
        return text ? { source: "duckduckgo", text: text.slice(0, 500) } : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function operationPrompt(params: {
  message: string;
  tenantKind: string;
  profile: any;
  categories: Array<{ name: string; type: string }>;
  accounts: Array<{ name: string; type?: string | null; status?: string | null; includeInTotal?: boolean | null }>;
  attachmentText?: string;
  enrichment?: any;
}) {
  return [
    "Voce interpreta pedidos financeiros em portugues do Brasil para um SaaS de gestao.",
    "Voce e uma assistente financeira operacional: deve transformar texto e anexos em acoes estruturadas que o sistema consiga confirmar e gravar.",
    "Interprete linguagem informal do jeito que a pessoa escrever. Nao espere frases perfeitas.",
    "Exemplos: 'acabei de receber um pix de 1000' = create_transaction entrada; 'paguei internet 90 no santander pix' = create_transaction saida; 'tenho que pagar aluguel 600 dia 10' = create_payable; 'cliente joao vai pagar 800 sexta' = create_receivable.",
    "Se a frase tiver tipo e valor, prepare a acao mesmo que falte descricao perfeita. Para movimentacao realizada sem data, use hoje. Para conta futura sem vencimento, pergunte a data.",
    "Alem de registrar, voce atua como assistente pessoal financeira: entende perfil profissional, renda, clientes, recorrencias, prioridades, metas, carteira principal e preferencias.",
    "Retorne apenas JSON. Nao inclua markdown.",
    "Se o usuario estiver apenas perguntando, use action none.",
    "Se o usuario quer registrar algo, mas falta um campo essencial, retorne action none com answer perguntando exatamente o campo faltante. Exemplos: 'Faltou o valor. Digite o valor em R$.'; 'Faltou a data. Se foi hoje, pode dizer hoje.'; 'Faltou a conta/carteira. Foi PJ, pessoal, dinheiro ou cartao?'.",
    "Se for claramente uma receita ou despesa paga/recebida com valor, use create_transaction.",
    "Se for uma conta futura a pagar, use create_payable. Se for uma conta futura a receber, use create_receivable.",
    "Se o usuario pedir resumo diario, resumo semanal, fechamento mensal, analise financeira ou relatorio, use create_report e preencha reportType.",
    "Se o usuario pedir apagar/remover/excluir algo, use delete_record e descreva o alvo com targetModel e searchText. Se faltar certeza, use none e peca mais detalhes.",
    "Se o usuario estiver configurando o sistema, metas, objetivos ou perfil de uso, use update_profile.",
    "Se o usuario informar saldo inicial ou saldo atual de conta/carteira, use update_initial_balance com balances [{account, amount}].",
    "Se o usuario pedir para criar/cadastrar categoria, conta financeira, cliente/contato, meta, lead, comprador, produto/cultura, plantio, colheita, venda rural, movimento de estoque ou evento de agenda, use create_record com targetModel e data.",
    "Se o usuario pedir para alterar um registro existente, use update_record com targetModel, searchText/targetId e data. Se nao houver seguranca do alvo, use none e peca detalhe.",
    "Use apenas estes targetModel internos: clients, payables, receivables, categories, financialAccounts, goals, leads, buyers, products, plantings, harvests, sales, stockMovements, agendaEvents, transactions, bankTransactions. Nunca use contact no singular.",
    "Para plantings/harvests/sales/stockMovements, se souber o nome da cultura/produto mas nao o id, preencha productName. Para sales, se souber o comprador mas nao o id, preencha buyerName.",
    "Se o usuario disser que um nome/empresa/pessoa deve virar uma categoria nos lancamentos, use update_record com targetModel transactions ou bankTransactions, searchText com o nome e data {category:\"Categoria\"}.",
    "Para comprovantes/recibos/notas/boletos/anexos, tente sempre extrair type, amount, description, date, dueDate, category, paymentMethod, account, establishmentName, document e notes.",
    "Para create_transaction, preencha: type entrada/saida, amount positivo, description curta, category usando uma das categorias permitidas, paymentMethod se souber, account se souber, date YYYY-MM-DD, establishmentName/document se existirem, notes e confidence de 0 a 1.",
    "Para contas a pagar/receber, preencha amount, description, category, dueDate YYYY-MM-DD, paymentMethod/account se souber e notes.",
    "Se houver Pix, TED, transferencia, boleto, dinheiro, credito ou debito no texto/anexo, preencha paymentMethod.",
    "Se a mensagem atual for curta, como '99,90 Santander pix chatgpt dia 8', use o contexto anterior para entender se e despesa/receita/conta e complete a operacao.",
    "Se identificar conta/carteira/banco/cartao, preencha account usando exatamente uma das contas disponiveis abaixo. Se nao souber, deixe account vazio em vez de inventar.",
    "Para saidas, account e a conta/carteira de onde o dinheiro saiu. Para entradas, account e a conta/carteira onde o dinheiro entrou.",
    "Se houver varias movimentacoes no anexo, use action none e responda em answer com uma lista resumida pedindo importacao/revisao em lote.",
    "Se houver risco de duplicidade, use shouldExecute false e explique em answer o que precisa revisar.",
    "Use shouldExecute true quando houver dados suficientes, mas lembre que o sistema ainda vai pedir confirmacao humana antes de executar.",
    "Antes do primeiro uso, conduza um bate-papo perguntando se a pessoa quer controlar dinheiro pessoal, MEI, cartao, empresa, agro/rural, metas e principais contas.",
    `Perfil/metas: ${JSON.stringify(params.profile)}`,
    `Tipo do tenant: ${params.tenantKind}`,
    `Categorias permitidas: ${params.categories.map((item) => `${item.name} (${item.type})`).join(", ")}`,
    `Contas/carteiras disponiveis: ${params.accounts.map((item) => `${item.name}${item.type ? ` (${item.type})` : ""}${item.status ? ` - ${item.status}` : ""}`).join(", ") || "nenhuma conta cadastrada"}`,
    params.enrichment ? `Dados reais/enriquecimento: ${JSON.stringify(params.enrichment)}` : "",
    params.attachmentText ? `Texto extraido/lido do anexo: ${params.attachmentText}` : "",
    `Mensagem do usuario: ${params.message}`,
    'Formato: {"action":"none","answer":"..."} ou {"action":"create_transaction","confidence":0.9,"shouldExecute":true,"type":"saida","amount":15,"description":"Pastel na feira","category":"Alimentacao","paymentMethod":"Dinheiro","account":"dinheiro","date":"2026-07-20","notes":"..."} ou {"action":"update_initial_balance","confidence":0.9,"shouldExecute":true,"balances":[{"account":"PJ","amount":1200},{"account":"dinheiro","amount":50}]} ou {"action":"create_record","confidence":0.9,"shouldExecute":true,"targetModel":"categories","data":{"name":"Delivery","type":"saida"}}'
  ].filter(Boolean).join("\n");
}

function coerceRecordDates(data: Record<string, any>) {
  const dateFields = new Set(["date", "dueDate", "paidDate", "startDate", "endDate", "nextAdjustment", "nextFollowUp", "plantingDate", "expectedHarvest", "harvestDate", "saleDate", "deliveryDate", "initialBalanceDate"]);
  const numberFields = new Set(["amount", "monthlyValue", "growthPotential", "estimatedHoursMonth", "currentValue", "targetValue", "gap", "proposedValue", "closeChance", "currentStock", "averageCost", "minStock", "quantityPlanted", "directCost", "quantity", "lossQuantity", "unitCost", "unitPrice", "totalAmount", "recurrenceDay", "dueDay", "amountCents", "suggestionConfidence"]);
  const out: Record<string, any> = { ...data };
  for (const key of Object.keys(out)) {
    if (out[key] === "") out[key] = null;
    if (dateFields.has(key) && out[key]) out[key] = parseDate(String(out[key]));
    if (numberFields.has(key) && out[key] !== null && out[key] !== undefined) {
      const parsed = typeof out[key] === "string" ? parseMoneyFromText(out[key]) || Number(String(out[key]).replace(",", ".")) : Number(out[key]);
      out[key] = Number.isFinite(parsed) ? parsed : out[key];
    }
    if (key.endsWith("Cents") && out[key] !== null && out[key] !== undefined) out[key] = cents(Number(out[key]));
  }
  return out;
}

function sanitizeRecordData(model: string, data: Record<string, any>) {
  const allowed: Record<string, string[]> = {
    payables: ["description", "category", "amount", "dueDate", "paidDate", "status", "recurring", "notes"],
    receivables: ["clientId", "description", "amount", "dueDate", "paidDate", "status", "type", "recurring", "recurrence", "recurrenceDay", "notes"],
    transactions: ["date", "description", "amount", "type", "category", "subcategory", "costCenter", "account", "status", "paymentMethod", "notes", "attachmentUrl", "source", "clientId"],
    categories: ["name", "type", "description"],
    financialAccounts: ["name", "institution", "type", "currency", "initialBalanceCents", "initialBalanceDate", "includeInTotal", "status", "maskedBankData", "observedBalanceCents", "observedBalanceDate", "notes"],
    clients: ["name", "fantasyName", "document", "email", "phone", "whatsapp", "responsibleName", "segment", "website", "instagram", "address", "city", "state", "type", "monthlyValue", "dueDay", "status", "services", "mainChannel", "startDate", "nextAdjustment", "growthPotential", "estimatedHoursMonth", "perceivedProfit", "notes"],
    goals: ["name", "currentValue", "targetValue", "gap", "actionPlan", "deadline", "status", "notes"],
    leads: ["name", "segment", "city", "contact", "website", "status", "proposedValue", "closeChance", "nextFollowUp", "notes"],
    buyers: ["name", "type", "contact", "city", "notes"],
    products: ["name", "category", "unit", "currentStock", "averageCost", "minStock", "notes"],
    plantings: ["productId", "area", "plantingDate", "expectedHarvest", "quantityPlanted", "unit", "directCost", "status", "notes"],
    harvests: ["productId", "plantingId", "harvestDate", "quantity", "lossQuantity", "unit", "unitCost", "notes"],
    sales: ["buyerId", "productId", "saleDate", "deliveryDate", "dueDate", "paidDate", "quantity", "unit", "unitPrice", "totalAmount", "status", "account", "paymentMethod", "notes"],
    stockMovements: ["productId", "date", "type", "quantity", "unit", "reason", "referenceId", "notes"],
    agendaEvents: ["date", "title", "type", "status", "amount", "notes", "source", "referenceId"],
    bankTransactions: ["date", "description", "amountCents", "direction", "accountName", "categorySuggestion", "categorySuggestionSource", "suggestionConfidence", "counterpartyName", "counterpartyDocument", "paymentMethod", "status", "notes"]
  };
  const keys = allowed[model] || [];
  const out: Record<string, any> = {};
  for (const key of keys) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return coerceRecordDates(out);
}

function normalizeTargetModel(model?: string | null) {
  const value = normalize(model || "");
  const aliases: Record<string, string> = {
    contact: "clients",
    contacts: "clients",
    contato: "clients",
    contatos: "clients",
    cliente: "clients",
    clientes: "clients",
    client: "clients",
    titulo: "financialTitles",
    titulos: "financialTitles",
    payable: "payables",
    payables: "payables",
    accountpayable: "payables",
    accountpayables: "payables",
    pagar: "payables",
    contaapagar: "payables",
    contasapagar: "payables",
    receivable: "receivables",
    receivables: "receivables",
    accountreceivable: "receivables",
    accountreceivables: "receivables",
    receber: "receivables",
    contaareceber: "receivables",
    contareceber: "receivables",
    contasreceber: "receivables",
    categoria: "categories",
    categorias: "categories",
    category: "categories",
    account: "financialAccounts",
    accounts: "financialAccounts",
    carteira: "financialAccounts",
    carteiras: "financialAccounts",
    conta: "financialAccounts",
    contas: "financialAccounts",
    meta: "goals",
    metas: "goals",
    goal: "goals",
    lead: "leads",
    comprador: "buyers",
    compradores: "buyers",
    buyer: "buyers",
    produto: "products",
    produtos: "products",
    cultura: "products",
    culturas: "products",
    plantio: "plantings",
    plantios: "plantings",
    planting: "plantings",
    plantings: "plantings",
    colheita: "harvests",
    colheitas: "harvests",
    harvest: "harvests",
    harvests: "harvests",
    venda: "sales",
    vendas: "sales",
    sale: "sales",
    sales: "sales",
    estoque: "stockMovements",
    stock: "stockMovements",
    stockmovement: "stockMovements",
    stockmovements: "stockMovements",
    agenda: "agendaEvents",
    evento: "agendaEvents",
    eventos: "agendaEvents",
    movimentacao: "transactions",
    movimentacoes: "transactions",
    lancamento: "transactions",
    lancamentos: "transactions",
    fluxo: "transactions",
    conciliacao: "bankTransactions",
    importacao: "bankTransactions",
    extrato: "bankTransactions",
    banktransaction: "bankTransactions",
    banktransactions: "bankTransactions"
  };
  return aliases[value.replace(/[\s_-]/g, "")] || aliases[value] || model || "";
}

function categoryFromRecordData(data: Record<string, any>) {
  return String(data.newCategory || data.category || data.categoria || data["nova categoria"] || "").trim();
}

async function syncTransactionCashMovement(transaction: any) {
  if (!transaction?.tenantId) return null;
  return prisma.cashMovement.upsert({
    where: {
      tenantId_legacyModel_legacyId: {
        tenantId: transaction.tenantId,
        legacyModel: "Transaction",
        legacyId: transaction.id
      }
    },
    update: {
      date: transaction.date,
      direction: transaction.type === "entrada" ? "IN" : "OUT",
      amountCents: cents(transaction.amount),
      accountName: transaction.account || "PJ",
      category: transaction.category || "A conferir",
      costCenter: transaction.costCenter,
      contactLegacyId: transaction.clientId,
      description: transaction.description,
      status: transaction.status === "cancelado" ? "REVERSED" : "ACTIVE",
      source: "TRANSACTION"
    },
    create: {
      tenantId: transaction.tenantId,
      date: transaction.date,
      direction: transaction.type === "entrada" ? "IN" : "OUT",
      amountCents: cents(transaction.amount),
      accountName: transaction.account || "PJ",
      category: transaction.category || "A conferir",
      costCenter: transaction.costCenter,
      contactLegacyId: transaction.clientId,
      description: transaction.description,
      status: transaction.status === "cancelado" ? "REVERSED" : "ACTIVE",
      source: "TRANSACTION",
      legacyModel: "Transaction",
      legacyId: transaction.id
    }
  });
}

async function applyCategorizationLearning(input: {
  tenantId: string;
  userId: string;
  searchText: string;
  category: string;
  direction?: string;
}) {
  const search = input.searchText.trim();
  if (!search || !input.category) return null;
  const pattern = normalize(search);
  const direction = input.direction || undefined;
  const [transactions, bankTransactions] = await Promise.all([
    prisma.transaction.updateMany({
      where: {
        tenantId: input.tenantId,
        description: { contains: search }
      },
      data: { category: input.category }
    }),
    prisma.bankTransaction.updateMany({
      where: {
        tenantId: input.tenantId,
        description: { contains: search }
      },
      data: {
        categorySuggestion: input.category
      }
    })
  ]);
  const existing = await prisma.aiLearningRule.findFirst({
    where: { tenantId: input.tenantId, userId: input.userId, pattern, direction: direction || null }
  });
  const rule = existing
    ? await prisma.aiLearningRule.update({
        where: { id: existing.id },
        data: {
          category: input.category,
          correctionCount: { increment: 1 },
          confidence: 0.98,
          lastMatchedAt: new Date()
        }
      })
    : await prisma.aiLearningRule.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          pattern,
          counterpartyName: search,
          direction,
          category: input.category,
          source: "AI_USER_INSTRUCTION",
          correctionCount: 1,
          confidence: 0.98,
          lastMatchedAt: new Date()
        }
      });
  return { rule, transactionsUpdated: transactions.count, bankTransactionsUpdated: bankTransactions.count };
}

function recordDelegate(model: string) {
  const delegates: Record<string, any> = {
    payables: prisma.accountPayable,
    receivables: prisma.accountReceivable,
    categories: prisma.category,
    financialAccounts: prisma.financialAccount,
    clients: prisma.client,
    goals: prisma.goal,
    leads: prisma.lead,
    buyers: prisma.buyer,
    products: prisma.product,
    plantings: prisma.planting,
    harvests: prisma.harvest,
    sales: prisma.sale,
    stockMovements: prisma.stockMovement,
    agendaEvents: prisma.agendaEvent,
    transactions: prisma.transaction,
    bankTransactions: prisma.bankTransaction
  };
  return delegates[model];
}

function recordSearchWhere(model: string, tenantId: string, search: string) {
  const token = search.split(" ")[0] || "";
  if (!token) return { tenantId };
  if (["categories", "financialAccounts", "clients", "goals", "leads", "buyers", "products"].includes(model)) {
    return { tenantId, name: { contains: token } };
  }
  if (["transactions", "bankTransactions", "payables", "receivables"].includes(model)) return { tenantId, description: { contains: token } };
  if (model === "agendaEvents") return { tenantId, title: { contains: token } };
  if (["plantings", "harvests", "sales", "stockMovements"].includes(model)) return { tenantId, notes: { contains: token } };
  return { tenantId };
}

async function buildAssistantReport(input: { tenantId: string; tenantKind: string; message: string; reportType?: string }) {
  const explicitMonth = input.message.match(/\b(20\d{2})-(\d{1,2})\b/);
  const month = explicitMonth ? `${explicitMonth[1]}-${explicitMonth[2].padStart(2, "0")}` : undefined;
  const report = await getFinancialReportData({ tenantId: input.tenantId, month });
  const fallback = financialReportFallbackText(report, input.reportType || "financeiro");
  const compact = {
    month: report.month,
    totals: report.totals,
    filters: report.filters,
    wallets: report.wallets.slice(0, 20),
    categories: report.byCategory.slice(0, 15),
    accounts: report.byAccount.slice(0, 10),
    costCenters: report.byCostCenter.slice(0, 10),
    topMovements: report.topMovements.slice(0, 15).map((item) => ({
      date: item.date,
      direction: item.direction,
      amount: item.amount,
      description: item.description,
      category: item.category,
      account: item.account
    })),
    pending: {
      receivableOpen: report.pending.receivableOpen,
      payableOpen: report.pending.payableOpen,
      overdueReceivable: report.pending.overdueReceivable,
      overduePayable: report.pending.overduePayable,
      receivables: report.pending.receivables.slice(0, 10),
      payables: report.pending.payables.slice(0, 10)
    },
    alerts: report.alerts
  };

  const prompt = [
    "Voce e a IA operacional do Merli360. Gere um relatorio financeiro do zero usando somente os dados reais abaixo.",
    "Nao invente valores, nao diga que nao encontrou dados se o JSON tiver valores. Se nao houver movimento, explique isso claramente.",
    "Organize em: resumo executivo, entradas e saidas, categorias, contas/carteiras, pendencias, alertas, recomendacoes praticas e proxima acao.",
    "Use portugues do Brasil, valores em R$ e tom humano de assistente financeira.",
    `Tipo pedido: ${input.reportType || "financeiro"}`,
    `Mensagem do usuario: ${input.message}`,
    `Modo do tenant: ${input.tenantKind}`,
    `Dados reais:\n${JSON.stringify(compact, null, 2)}`,
    "",
    "Relatorio:"
  ].join("\n\n");

  const aiText = await askAi(prompt, { timeoutMs: 25000, useOpenAI: true });
  return (aiText && aiText.trim().length > 80 ? aiText.trim() : fallback) + "\n\nExportacoes: /relatorios e /api/export/categorySummary";
}

async function resetOperationalData(tenantId: string) {
  return prisma.$transaction(async (tx) => {
    const result: Record<string, number> = {};
    const clear = async (key: string, promise: Promise<{ count: number }>) => {
      const output = await promise;
      result[key] = output.count;
    };

    await clear("reconciliationAllocations", tx.reconciliationAllocation.deleteMany({ where: { tenantId } }));
    await clear("reconciliations", tx.reconciliationGroup.deleteMany({ where: { tenantId } }));
    await clear("bankTransactions", tx.bankTransaction.deleteMany({ where: { tenantId } }));
    await clear("bankImportBatches", tx.bankImportBatch.deleteMany({ where: { tenantId } }));
    await clear("cashMovements", tx.cashMovement.deleteMany({ where: { tenantId } }));
    await clear("settlements", tx.settlement.deleteMany({ where: { tenantId } }));
    await clear("financialTitles", tx.financialTitle.deleteMany({ where: { tenantId } }));
    await clear("transfers", tx.transfer.deleteMany({ where: { tenantId } }));
    await clear("transactions", tx.transaction.deleteMany({ where: { tenantId } }));
    await clear("payables", tx.accountPayable.deleteMany({ where: { tenantId } }));
    await clear("receivables", tx.accountReceivable.deleteMany({ where: { tenantId } }));
    await clear("invoices", tx.invoice.deleteMany({ where: { tenantId } }));
    await clear("adBudgets", tx.adBudget.deleteMany({ where: { tenantId } }));
    await clear("budgetLines", tx.budgetLine.deleteMany({ where: { tenantId } }));
    await clear("budgets", tx.budget.deleteMany({ where: { tenantId } }));
    await clear("sales", tx.sale.deleteMany({ where: { tenantId } }));
    await clear("stockMovements", tx.stockMovement.deleteMany({ where: { tenantId } }));
    await clear("harvests", tx.harvest.deleteMany({ where: { tenantId } }));
    await clear("plantings", tx.planting.deleteMany({ where: { tenantId } }));
    await clear("products", tx.product.deleteMany({ where: { tenantId } }));
    await clear("buyers", tx.buyer.deleteMany({ where: { tenantId } }));
    await clear("clients", tx.client.deleteMany({ where: { tenantId } }));
    await clear("leads", tx.lead.deleteMany({ where: { tenantId } }));
    await clear("goals", tx.goal.deleteMany({ where: { tenantId } }));
    await clear("attachments", tx.attachment.deleteMany({ where: { tenantId } }));
    await tx.financialAccount.updateMany({
      where: { tenantId },
      data: {
        initialBalanceCents: 0,
        observedBalanceCents: null,
        observedBalanceDate: null,
        notes: null
      }
    });

    return result;
  });
}

async function resetAiLearning(tenantId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, include: { tenant: true } });
    if (!user) throw new Error("Usuario nao encontrado para resetar a IA.");
    const assistantName = user.tenant.kind === "agro" ? "Assistente Rural 360" : "Assistente Merli360";
    const memoryText = initialStructuredMemory({
      name: user.name,
      tenant: { kind: user.tenant.kind, brandName: user.tenant.brandName }
    });
    const [messages, learnedRules, existingProfile] = await Promise.all([
      tx.assistantMessage.deleteMany({ where: { tenantId, userId } }),
      tx.aiLearningRule.deleteMany({ where: { tenantId, userId } }),
      tx.assistantProfile.findFirst({ where: { tenantId, userId } })
    ]);
    const profile = existingProfile
      ? await tx.assistantProfile.update({
          where: { id: existingProfile.id },
          data: {
            assistantName,
            ownerName: user.name,
            businessName: user.tenant.brandName,
            goalsText: "",
            preferences: "Nivel de acompanhamento: equilibrado. Perguntar somente o necessario no momento e evitar questionarios longos.",
            personality: "Natural, proxima, profissional, direta, organizada, proativa sem ser invasiva e sem julgamentos.",
            memoryText,
            onboardingStep: 0,
            onboardingCompleted: false
          }
        })
      : await tx.assistantProfile.create({
          data: {
            tenantId,
            userId,
            assistantName,
            ownerName: user.name,
            businessName: user.tenant.brandName,
            goalsText: "",
            preferences: "Nivel de acompanhamento: equilibrado. Perguntar somente o necessario no momento e evitar questionarios longos.",
            personality: "Natural, proxima, profissional, direta, organizada, proativa sem ser invasiva e sem julgamentos.",
            memoryText,
            onboardingStep: 0,
            onboardingCompleted: false
          }
        });
    return { messages: messages.count, learnedRules: learnedRules.count, profileId: profile.id };
  });
}

async function matchOpenLegacyTitle(input: {
  tenantId: string;
  type: "entrada" | "saida";
  amount: number;
  text: string;
}) {
  const normalized = normalize(input.text);
  const amountMin = input.amount - 0.01;
  const amountMax = input.amount + 0.01;
  if (input.type === "entrada") {
    const rows = await prisma.accountReceivable.findMany({
      where: { tenantId: input.tenantId, status: { not: "pago" }, amount: { gte: amountMin, lte: amountMax } },
      orderBy: { dueDate: "asc" },
      take: 20
    });
    return rows.find((row) => {
      const haystack = normalize(`${row.description} ${row.type || ""} ${row.notes || ""}`);
      return haystack.split(" ").some((word) => word.length >= 4 && normalized.includes(word)) || normalized.split(" ").some((word) => word.length >= 4 && haystack.includes(word));
    }) || null;
  }
  const rows = await prisma.accountPayable.findMany({
    where: { tenantId: input.tenantId, status: { not: "pago" }, amount: { gte: amountMin, lte: amountMax } },
    orderBy: { dueDate: "asc" },
    take: 20
  });
  return rows.find((row) => {
    const haystack = normalize(`${row.description} ${row.category || ""} ${row.notes || ""}`);
    return haystack.split(" ").some((word) => word.length >= 4 && normalized.includes(word)) || normalized.split(" ").some((word) => word.length >= 4 && haystack.includes(word));
  }) || null;
}

async function findOrCreateProduct(tenantId: string, data: Record<string, any>) {
  const rawName = String(data.productName || data.product || data.cultureName || data.cultura || data.name || "").trim();
  if (!rawName && data.productId) return data.productId;
  if (!rawName) return "";
  const existing = await prisma.product.findFirst({ where: { tenantId, name: { contains: rawName } }, orderBy: { updatedAt: "desc" } });
  if (existing) return existing.id;
  const created = await prisma.product.create({
    data: {
      tenantId,
      name: rawName,
      category: data.category || (/legume|tomate|cenoura|batata|abobrinha/i.test(rawName) ? "legume" : "hortalica"),
      unit: data.unit || "unidade",
      notes: "Criado automaticamente pela IA para vincular operacao rural."
    }
  });
  return created.id;
}

async function findOrCreateBuyer(tenantId: string, data: Record<string, any>) {
  const rawName = String(data.buyerName || data.buyer || data.clientName || data.cliente || data.comprador || "").trim();
  if (!rawName && data.buyerId) return data.buyerId;
  if (!rawName) return null;
  const existing = await prisma.buyer.findFirst({ where: { tenantId, name: { contains: rawName } }, orderBy: { updatedAt: "desc" } });
  if (existing) return existing.id;
  const created = await prisma.buyer.create({
    data: {
      tenantId,
      name: rawName,
      type: data.buyerType || data.type || "cliente",
      contact: data.contact || data.phone || data.whatsapp || null,
      city: data.city || null,
      notes: "Criado automaticamente pela IA para vincular venda rural."
    }
  });
  return created.id;
}

async function prepareOperationalRecordData(model: string, tenantId: string, rawData: Record<string, any>, existing?: any) {
  const raw = { ...rawData };
  if (model === "plantings" || model === "harvests" || model === "sales" || model === "stockMovements") {
    const productId = await findOrCreateProduct(tenantId, raw);
    if (productId) raw.productId = productId;
  }
  if (model === "sales") {
    const buyerId = await findOrCreateBuyer(tenantId, raw);
    if (buyerId) raw.buyerId = buyerId;
    if (!raw.saleDate) raw.saleDate = raw.date || new Date().toISOString().slice(0, 10);
    if (!raw.totalAmount && raw.quantity && raw.unitPrice) raw.totalAmount = Number(raw.quantity) * Number(raw.unitPrice);
    if (!raw.status) raw.status = raw.paidDate || /pix|dinheiro|credito|crÃ©dito|debito|dÃ©bito/i.test(String(raw.paymentMethod || "")) ? "recebido" : "pendente";
  }
  if (model === "plantings" && !raw.plantingDate) raw.plantingDate = raw.date || new Date().toISOString().slice(0, 10);
  if (model === "harvests" && !raw.harvestDate) raw.harvestDate = raw.date || new Date().toISOString().slice(0, 10);
  if (model === "stockMovements" && !raw.date) raw.date = new Date().toISOString().slice(0, 10);
  if (model === "transactions") {
    if (!raw.date) raw.date = new Date().toISOString().slice(0, 10);
    if (!raw.status) raw.status = "pago";
    if (!raw.account) raw.account = "PJ";
    if (!raw.source) raw.source = "IA Assistente";
  }
  if (model === "payables") {
    if (!raw.category) raw.category = "A conferir";
    if (!raw.status) raw.status = raw.paidDate ? "pago" : "pendente";
    if (!raw.dueDate) raw.dueDate = raw.date || new Date().toISOString().slice(0, 10);
  }
  if (model === "receivables") {
    if (!raw.type) raw.type = raw.category || "Entrada a receber";
    if (!raw.status) raw.status = raw.paidDate ? "pago" : "pendente";
    if (!raw.dueDate) raw.dueDate = raw.date || new Date().toISOString().slice(0, 10);
  }
  const data = sanitizeRecordData(model, raw);
  if (model === "sales" && existing && !data.totalAmount && (data.quantity || data.unitPrice)) {
    const quantity = Number(data.quantity ?? existing.quantity ?? 0);
    const unitPrice = Number(data.unitPrice ?? existing.unitPrice ?? 0);
    data.totalAmount = quantity * unitPrice;
  }
  return data;
}

async function syncOperationalRecord(model: string, item: any, op?: Operation) {
  if (!item) return;
  if (model === "payables") await syncPayableToLedger(item, { account: op?.account || item.account || "PJ", paymentMethod: op?.paymentMethod || item.paymentMethod || "" });
  if (model === "receivables") await syncReceivableToLedger(item, { account: op?.account || item.account || "PJ", paymentMethod: op?.paymentMethod || item.paymentMethod || "" });
  if (model === "transactions") await syncTransactionCashMovement(item);
  if (model === "harvests") await syncHarvestStock(item);
  if (model === "sales") await syncSaleAutomation(item);
  if (model === "stockMovements" && item.productId) {
    const movements = await prisma.stockMovement.findMany({ where: { productId: item.productId } });
    const currentStock = movements.reduce((sum, movement) => sum + (movement.type === "entrada" ? movement.quantity : -movement.quantity), 0);
    await prisma.product.update({ where: { id: item.productId }, data: { currentStock } });
  }
}

async function cleanupBeforeDelete(model: string, item: any, tenantId: string) {
  if (!item?.id) return;
  if (model === "transactions") {
    await prisma.cashMovement.deleteMany({ where: { tenantId, legacyModel: { in: ["Transaction", "AssistantTransaction"] }, legacyId: item.id } });
  }
  if (model === "payables") {
    await prisma.cashMovement.deleteMany({ where: { tenantId, legacyModel: { in: ["AccountPayableCashMovement", "ManualSettlementCashMovement"] }, legacyId: item.id } });
    await prisma.financialTitle.deleteMany({ where: { tenantId, legacyModel: "AccountPayable", legacyId: item.id } });
    await prisma.transaction.deleteMany({ where: { importHash: `payable-paid-${item.id}` } });
  }
  if (model === "receivables") {
    await prisma.cashMovement.deleteMany({ where: { tenantId, legacyModel: { in: ["AccountReceivableCashMovement", "ManualSettlementCashMovement"] }, legacyId: item.id } });
    await prisma.financialTitle.deleteMany({ where: { tenantId, legacyModel: "AccountReceivable", legacyId: item.id } });
    await prisma.transaction.deleteMany({ where: { importHash: `receivable-paid-${item.id}` } });
  }
  if (model === "sales") {
    await prisma.stockMovement.deleteMany({ where: { tenantId, referenceId: item.id, reason: "Venda" } });
    await prisma.transaction.deleteMany({ where: { importHash: `sale-paid-${item.id}` } });
    await prisma.accountReceivable.deleteMany({ where: { tenantId, notes: { contains: `venda rural ${item.id}` } } });
  }
  if (model === "harvests") await prisma.stockMovement.deleteMany({ where: { tenantId, referenceId: item.id, reason: "Colheita" } });
}

export async function interpretFinancialOperation(input: {
  tenantId: string;
  userId?: string;
  tenantKind: string;
  message: string;
  attachmentText?: string;
  attachmentBase64?: string;
  attachmentMimeType?: string;
}) {
  const profileUser = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId }, include: { tenant: true } })
    : null;
  const [profile, categories, financialAccounts] = await Promise.all([
    profileUser
      ? getOrCreateAssistantProfile(profileUser)
      : prisma.assistantProfile.findFirst({ where: { tenantId: input.tenantId }, orderBy: { updatedAt: "desc" } }),
    prisma.category.findMany({ where: { tenantId: input.tenantId }, orderBy: { name: "asc" } }),
    prisma.financialAccount.findMany({ where: { tenantId: input.tenantId }, orderBy: { name: "asc" } })
  ]);

  let initialText = input.attachmentText || "";
  const messageOnly = currentUserMessage(input.message);
  const immediateLocal = localOperationFromText([messageOnly, initialText].join(" "), input.tenantKind);
  const correctionAnswer = correctionOnlyAnswer(messageOnly);
  if (correctionAnswer) {
    return { operation: { action: "none", confidence: 0.98, shouldExecute: false, answer: correctionAnswer } as Operation, raw: "local", enrichment: null, attachmentText: initialText };
  }
  if (immediateLocal?.action === "reset_ai_learning" || immediateLocal?.action === "reset_operational_data") {
    return { operation: immediateLocal, raw: "local", enrichment: null, attachmentText: initialText };
  }
  if (input.attachmentBase64 && input.attachmentMimeType) {
    const visionPrompt = [
      "Leia este comprovante, nota, recibo, imagem ou extrato.",
      "Extraia o que for financeiro: valor, data, estabelecimento, CNPJ/CPF se existir, forma de pagamento, se foi entrada ou saida, e uma descricao curta.",
      "Retorne apenas JSON."
    ].join("\n");
    const vision = await askAiParts(
      [{ text: visionPrompt }, { inlineData: { mimeType: input.attachmentMimeType, data: input.attachmentBase64 } }],
      { json: true, timeoutMs: 30000 }
    );
    initialText = [initialText, vision].filter(Boolean).join("\n");
  }

  const roughDocument = [messageOnly, initialText].join(" ").match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0];
  const roughName = [messageOnly, initialText].join(" ").match(/(?:em|no|na|para)\s+([A-Za-zA-Z0-9& .'-]{4,50})/i)?.[1];
  const enrichment = await lookupBusinessContext(roughName, roughDocument);

  const prompt = operationPrompt({
    message: input.message,
    tenantKind: input.tenantKind,
    profile,
    categories: categories.map((item) => ({ name: item.name, type: item.type })),
    accounts: financialAccounts.map((item) => ({ name: item.name, type: item.type, status: item.status, includeInTotal: item.includeInTotal })),
    attachmentText: initialText.slice(0, 5000),
    enrichment
  });
  const answer = await askAi(prompt, { json: true, timeoutMs: 25000 });
  const parsed = parseJsonBlock<Operation & { answer?: string }>(answer) || ({ action: "none", confidence: 0 } as Operation);
  const localOperation = localOperationFromText([messageOnly, initialText].join(" "), input.tenantKind);
  const operation = parsed.action && parsed.action !== "none" && localOperation?.action !== "none" ? parsed : localOperation || parsed;
  if (["create_transaction", "create_payable", "create_receivable", "update_initial_balance"].includes(operation.action)) {
    operation.account = matchFinancialAccount(operation.account || accountNameFromText([messageOnly, initialText].join(" ")), financialAccounts);
    if (Array.isArray(operation.balances)) {
      operation.balances = operation.balances.map((item) => ({ ...item, account: matchFinancialAccount(item.account, financialAccounts) || item.account }));
    }
  }

  const plan = buildAiPlan({
    operation,
    tenantId: input.tenantId,
    userId: input.userId,
    userRole: profileUser?.role || "user",
    message: input.message
  });

  return { operation, raw: answer, enrichment, attachmentText: initialText, plan };
}

export async function executeAssistantOperation(input: {
  tenantId: string;
  tenantKind: string;
  userId: string;
  message: string;
  operation: Operation;
  enrichment?: any;
  attachmentId?: string | null;
  confirmed?: boolean;
  request?: Request;
}) : Promise<AssistantActionResult> {
  const op = input.operation;
  const user = await prisma.user.findFirst({ where: { id: input.userId, tenantId: input.tenantId }, select: { role: true } });
  const plan = buildAiPlan({
    operation: op,
    tenantId: input.tenantId,
    userId: input.userId,
    userRole: user?.role || "user",
    message: input.message,
    confirmed: input.confirmed,
    autoExecute: !input.confirmed
  });
  const policy = evaluateAiPolicy({
    operation: op,
    tenantId: input.tenantId,
    userRole: user?.role || "user",
    confirmed: input.confirmed,
    autoExecute: !input.confirmed
  });
  if (!policy.allowed) {
    const result = {
      executed: false,
      action: op.action,
      message: policy.requiresConfirmation
        ? `Essa acao precisa de confirmacao antes de alterar o sistema: ${policy.reasons.join(" ")}`
        : `Nao executei porque a politica da IA bloqueou: ${policy.reasons.join(" ")}`,
      analysis: { ...op, plan, policy },
      enrichment: input.enrichment
    };
    await auditAiPlan({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "ai_operation_blocked_by_policy",
      status: "error",
      message: result.message,
      plan,
      operation: op,
      result,
      request: input.request
    });
    return result;
  }

  await auditAiPlan({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "ai_operation_started",
    plan: { ...plan, status: "Executing" },
    operation: op,
    request: input.request
  });

  if (op.action === "none" || !op.shouldExecute || Number(op.confidence || 0) < 0.55) {
    return { executed: false, action: op.action, message: "A IA analisou, mas nao criou registro automatico porque faltou certeza ou valor claro.", analysis: op, enrichment: input.enrichment };
  }

  const amount = Math.abs(Number(op.amount || 0));
  if (!Number.isFinite(amount) || (amount <= 0 && !["delete_record", "create_report", "update_profile", "update_initial_balance", "create_record", "update_record", "reset_operational_data", "reset_ai_learning"].includes(op.action))) {
    return { executed: false, action: op.action, message: "Nao encontrei um valor valido para criar o lancamento.", analysis: op, enrichment: input.enrichment };
  }

  if (op.action === "reset_operational_data") {
    if (!/^reset\s*boom$/i.test(input.message.trim())) {
      return { executed: false, action: op.action, analysis: op, message: "Por seguranca, o reset so roda quando a mensagem for exatamente: Reset boom" };
    }
    const result = await resetOperationalData(input.tenantId);
    const total = Object.values(result).reduce((sum, count) => sum + count, 0);
    return {
      executed: true,
      action: op.action,
      item: result,
      analysis: op,
      message: `Reset boom executado. Apaguei ${total} registros operacionais deste tenant e zerei os saldos iniciais das carteiras. Usuarios, categorias e configuracoes foram mantidos.`
    };
  }

  if (op.action === "reset_ai_learning") {
    if (!/^reset\s*ia$/i.test(input.message.trim())) {
      return { executed: false, action: op.action, analysis: op, message: "Por seguranca, o reset da IA so roda quando a mensagem for exatamente: Reset IA" };
    }
    const result = await resetAiLearning(input.tenantId, input.userId);
    return {
      executed: true,
      action: op.action,
      item: result,
      analysis: op,
      redirectTo: "/primeiro-acesso",
      message: `Reset IA executado. Apaguei ${result.messages} mensagens antigas e ${result.learnedRules} regras aprendidas deste usuario. Seus dados financeiros foram mantidos. Agora vamos recomecar o aprendizado pelo formulario de primeiro acesso.`
    };
  }

  if (op.action === "create_payable") {
    const description = String(op.description || input.message).replace(/\s+/g, " ").trim().slice(0, 180);
    const category = (await allowedCategory(input.tenantId, op.category, "saida")) || (await allowedCategory(input.tenantId, fallbackCategory(description, "saida", input.tenantKind), "saida")) || "A conferir";
    const item = await prisma.accountPayable.create({
      data: {
        tenantId: input.tenantId,
        description,
        category,
        amount,
        dueDate: parseDate(op.dueDate || op.date),
        status: "pendente",
        recurring: false,
        notes: [op.notes, "Criado pela IA apos confirmacao do usuario."].filter(Boolean).join("\n")
      }
    });
    await syncPayableToLedger(item, { account: op.account || "PJ", paymentMethod: op.paymentMethod || "" });
    return { executed: true, action: op.action, item, analysis: op, enrichment: input.enrichment, message: `Conta a pagar criada: ${description} - R$ ${amount.toFixed(2)}.` };
  }

  if (op.action === "create_receivable") {
    const description = String(op.description || input.message).replace(/\s+/g, " ").trim().slice(0, 180);
    const item = await prisma.accountReceivable.create({
      data: {
        tenantId: input.tenantId,
        description,
        amount,
        dueDate: parseDate(op.dueDate || op.date),
        status: "pendente",
        type: op.category || "Entrada a receber",
        recurring: false,
        notes: [op.notes, "Criado pela IA apos confirmacao do usuario."].filter(Boolean).join("\n")
      }
    });
    await syncReceivableToLedger(item, { account: op.account || "PJ", paymentMethod: op.paymentMethod || "" });
    return { executed: true, action: op.action, item, analysis: op, enrichment: input.enrichment, message: `Conta a receber criada: ${description} - R$ ${amount.toFixed(2)}.` };
  }

  if (op.action === "delete_record") {
    const model = normalizeTargetModel(op.targetModel || "transactions");
    const search = normalize(op.searchText || op.description || input.message);
    const db = recordDelegate(model);
    if (!db) return { executed: false, action: op.action, message: "Nao encontrei o tipo de registro para excluir.", analysis: op };
    if (!op.targetId && (!search || search.length < 3)) {
      return { executed: false, action: op.action, message: "Para excluir com seguranca, informe o nome, descricao ou abra o registro exato.", analysis: op };
    }
    const item = op.targetId
      ? await db.findFirst({ where: { id: op.targetId, tenantId: input.tenantId } })
      : await db.findFirst({ where: recordSearchWhere(model, input.tenantId, search), orderBy: { createdAt: "desc" } }).catch(() => null);
    const label = normalize(item?.description || item?.name || item?.title || item?.notes || "");
    if (!item || (search && !label.includes(search.split(" ")[0] || ""))) {
      return { executed: false, action: op.action, message: "Nao achei um registro com seguranca para excluir. Abra a tabela ou descreva melhor o item.", analysis: op };
    }
    await cleanupBeforeDelete(model, item, input.tenantId);
    await db.delete({ where: { id: item.id } });
    return { executed: true, action: op.action, item, analysis: { ...op, targetModel: model }, message: `Registro removido de ${model}: ${item.description || item.name || item.title || item.id}.` };
  }

  if (op.action === "create_record" || op.action === "update_record") {
    const model = normalizeTargetModel(op.targetModel || "");
    const learnedCategory = categoryFromRecordData(op.data || {});
    const learnedSearch = String(op.searchText || op.description || op.data?.counterpartyName || op.data?.name || "").trim();
    if (op.action === "update_record" && learnedCategory && learnedSearch && ["clients", "transactions", "bankTransactions"].includes(model)) {
      const learned = await applyCategorizationLearning({
        tenantId: input.tenantId,
        userId: input.userId,
        searchText: learnedSearch,
        category: learnedCategory,
        direction: normalize(input.message).includes("entrada") || normalize(input.message).includes("receb") ? "IN" : normalize(input.message).includes("saida") || normalize(input.message).includes("pag") ? "OUT" : undefined
      });
      if (learned) {
        return {
          executed: true,
          action: op.action,
          item: learned.rule,
          analysis: { ...op, targetModel: model, learnedCategory },
          message: `Aprendi a classificar "${learnedSearch}" como ${learnedCategory}. Atualizei ${learned.transactionsUpdated} movimentacao(oes) e ${learned.bankTransactionsUpdated} item(ns) de extrato/importacao encontrados.`
        };
      }
    }
    const db = recordDelegate(model);
    if (!db) return { executed: false, action: op.action, analysis: op, message: "Esse tipo de cadastro ainda nao esta liberado para a IA." };
    let data = await prepareOperationalRecordData(model, input.tenantId, op.data || {});
    if (!Object.keys(data).length) return { executed: false, action: op.action, analysis: op, message: "Nao encontrei dados suficientes para salvar o cadastro." };
    if (model === "categories" && !data.type) data.type = "neutro";
    if (model === "financialAccounts") {
      if (!data.type) data.type = "conta bancaria";
      if (!data.currency) data.currency = "BRL";
      if (data.includeInTotal === undefined) data.includeInTotal = data.type !== "cartao de credito";
      if (!data.status) data.status = "ativa";
    }
    if (model === "clients") {
      if (!data.type) data.type = "avulso";
      if (!data.status) data.status = "ativo";
    }
    if (model === "transactions") {
      if (!data.description) data.description = op.description || input.message.slice(0, 180);
      if (!data.amount && amount) data.amount = amount;
      if (!data.type) data.type = op.type || (normalize(input.message).includes("receb") || normalize(input.message).includes("entrada") ? "entrada" : "saida");
      if (!data.category) data.category = op.category || fallbackCategory(`${data.description} ${input.message}`, data.type, input.tenantKind);
      if (!data.date) data.date = parseDate(op.date);
      if (!data.account) data.account = op.account || "PJ";
      if (!data.status) data.status = "pago";
    }
    if (model === "payables" && !data.description) data.description = op.description || input.message.slice(0, 180);
    if (model === "receivables" && !data.description) data.description = op.description || input.message.slice(0, 180);
    if (model === "plantings" && !data.productId) return { executed: false, action: op.action, analysis: op, message: "Para registrar plantio, preciso saber a cultura/produto." };
    if (model === "harvests" && !data.productId) return { executed: false, action: op.action, analysis: op, message: "Para registrar colheita, preciso saber a cultura/produto." };
    if (model === "sales" && !data.productId) return { executed: false, action: op.action, analysis: op, message: "Para registrar venda rural, preciso saber o produto vendido." };

    if (op.action === "update_record") {
      const search = normalize(op.searchText || String(data.name || data.description || data.title || ""));
      const item = op.targetId
        ? await db.findFirst({ where: { id: op.targetId, tenantId: input.tenantId } })
        : await db.findFirst({ where: recordSearchWhere(model, input.tenantId, search), orderBy: { createdAt: "desc" } }).catch(() => null);
      if (!item) return { executed: false, action: op.action, analysis: op, message: "Nao achei o registro com seguranca para alterar. Informe o nome exato." };
      data = await prepareOperationalRecordData(model, input.tenantId, op.data || {}, item);
      const updated = await db.update({ where: { id: item.id }, data });
      await syncOperationalRecord(model, updated, op);
      return { executed: true, action: op.action, item: updated, analysis: { ...op, targetModel: model }, message: `Registro atualizado em ${model}. As automacoes ligadas a esse modulo foram sincronizadas.` };
    }

    const item = await db.create({ data: { ...data, tenantId: input.tenantId } });
    await syncOperationalRecord(model, item, op);
    return { executed: true, action: op.action, item, analysis: { ...op, targetModel: model }, message: `Cadastro criado em ${model}: ${item.name || item.title || item.description || item.id}. As automacoes desse modulo foram sincronizadas.` };
  }

  if (op.action === "update_profile") {
    const existing = await prisma.assistantProfile.findFirst({ where: { tenantId: input.tenantId, userId: input.userId } });
    const data = {
        tenantId: input.tenantId,
        userId: input.userId,
        ownerName: op.ownerName || undefined,
        goalsText: op.goalsText || op.setupNotes || undefined,
        memoryText: op.memoryText || op.setupNotes || undefined,
        onboardingCompleted: true,
        preferences: op.setupNotes || undefined
    };
    const profile = existing
      ? await prisma.assistantProfile.update({ where: { id: existing.id }, data })
      : await prisma.assistantProfile.create({
          data: {
            ...data,
            assistantName: input.tenantKind === "agro" ? "Assistente Rural 360" : "Assistente Merli360"
          }
        });
    return { executed: true, action: op.action, item: profile, analysis: op, message: "ConfiguraÃ§Ã£o da IA atualizada para esse usuÃ¡rio." };
  }

  if (op.action === "update_initial_balance") {
    const balances = Array.isArray(op.balances) && op.balances.length
      ? op.balances
      : op.account && Number.isFinite(amount)
        ? [{ account: op.account, amount }]
        : [];
    if (!balances.length) return { executed: false, action: op.action, analysis: op, message: "Nao encontrei conta e saldo para atualizar." };
    const updated = [];
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    for (const balance of balances) {
      const name = String(balance.account || "PJ").trim() || "PJ";
      const value = Number(balance.amount || 0);
      if (!Number.isFinite(value)) continue;
      const type = name === "cartao" ? "cartao de credito" : name === "dinheiro" ? "dinheiro/caixa" : "conta bancaria";
      updated.push(await prisma.financialAccount.upsert({
        where: { tenantId_name: { tenantId: input.tenantId, name } },
        update: {
          initialBalanceCents: cents(value),
          initialBalanceDate: date,
          includeInTotal: name !== "cartao",
          status: "ativa"
        },
        create: {
          tenantId: input.tenantId,
          name,
          type,
          currency: "BRL",
          initialBalanceCents: cents(value),
          initialBalanceDate: date,
          includeInTotal: name !== "cartao",
          status: "ativa"
        }
      }));
    }
    return {
      executed: true,
      action: op.action,
      item: updated[0],
      analysis: op,
      message: `Saldo inicial atualizado: ${updated.map((account) => `${account.name} R$ ${(account.initialBalanceCents / 100).toFixed(2)}`).join(", ")}.`
    };
  }

  if (op.action === "create_report") {
    const report = await buildAssistantReport({
      tenantId: input.tenantId,
      tenantKind: input.tenantKind,
      message: input.message,
      reportType: op.reportType
    });
    return { executed: true, action: op.action, analysis: op, item: { report }, message: report };
  }

  const type = op.type === "entrada" ? "entrada" : "saida";
  const description = String(op.description || input.message).replace(/\s+/g, " ").trim().slice(0, 180);
  const fallback = fallbackCategory(`${description} ${input.message}`, type, input.tenantKind);
  const category = (await allowedCategory(input.tenantId, op.category, type)) || (await allowedCategory(input.tenantId, fallback, type)) || fallback;
  const paymentMethod = op.paymentMethod || fallbackPaymentMethod(`${description} ${input.message}`);
  const date = parseDate(op.date);
  const account = op.account || (paymentMethod === "Dinheiro" ? "dinheiro" : "PJ");
  const legacyMatch = await matchOpenLegacyTitle({
    tenantId: input.tenantId,
    type,
    amount,
    text: `${description} ${input.message}`
  });
  if (legacyMatch && type === "entrada") {
    const paid = await syncReceivablePayment(legacyMatch as any, {
      account,
      paymentMethod: paymentMethod || "Pix",
      paidDate: date.toISOString().slice(0, 10)
    });
    return {
      executed: true,
      action: "create_transaction",
      item: paid,
      analysis: { ...op, matchedReceivableId: legacyMatch.id },
      enrichment: input.enrichment,
      message: `Recebimento registrado e conta a receber baixada: ${legacyMatch.description} - R$ ${amount.toFixed(2)} na conta ${account}.`
    };
  }
  if (legacyMatch && type === "saida") {
    const paid = await syncPayablePayment(legacyMatch as any, {
      account,
      paymentMethod: paymentMethod || "Pix",
      paidDate: date.toISOString().slice(0, 10)
    });
    return {
      executed: true,
      action: "create_transaction",
      item: paid,
      analysis: { ...op, matchedPayableId: legacyMatch.id },
      enrichment: input.enrichment,
      message: `Pagamento registrado e conta a pagar baixada: ${legacyMatch.description} - R$ ${amount.toFixed(2)} na conta ${account}.`
    };
  }
  const importHash = `ai-${input.tenantId}-${crypto.createHash("sha1").update([date.toISOString().slice(0, 10), description, amount, input.message].join("|")).digest("hex")}`;

  const item = await prisma.transaction.upsert({
    where: { importHash },
    update: {
      tenantId: input.tenantId,
      date,
      description,
      amount,
      type,
      category,
      subcategory: op.subcategory || "IA",
      costCenter: op.costCenter || (input.tenantKind === "agro" ? "A classificar" : type === "entrada" ? "Cliente" : "A classificar"),
      account,
      status: "pago",
      paymentMethod,
      notes: [op.notes, input.enrichment ? `Dados consultados: ${JSON.stringify(input.enrichment).slice(0, 700)}` : "", input.attachmentId ? `Anexo: ${input.attachmentId}` : ""].filter(Boolean).join("\n"),
      source: "IA Assistente"
    },
    create: {
      tenantId: input.tenantId,
      date,
      description,
      amount,
      type,
      category,
      subcategory: op.subcategory || "IA",
      costCenter: op.costCenter || (input.tenantKind === "agro" ? "A classificar" : type === "entrada" ? "Cliente" : "A classificar"),
      account,
      status: "pago",
      paymentMethod,
      notes: [op.notes, input.enrichment ? `Dados consultados: ${JSON.stringify(input.enrichment).slice(0, 700)}` : "", input.attachmentId ? `Anexo: ${input.attachmentId}` : ""].filter(Boolean).join("\n"),
      attachmentUrl: input.attachmentId ? `/api/attachments/${input.attachmentId}` : null,
      source: "IA Assistente",
      importHash
    }
  });

  await prisma.cashMovement.upsert({
    where: {
      tenantId_legacyModel_legacyId: {
        tenantId: input.tenantId,
        legacyModel: "AssistantTransaction",
        legacyId: item.id
      }
    },
    update: {
      date,
      direction: type === "entrada" ? "IN" : "OUT",
      amountCents: cents(amount),
      accountName: account,
      category,
      costCenter: item.costCenter,
      description,
      status: "ACTIVE",
      source: "IA"
    },
    create: {
      tenantId: input.tenantId,
      date,
      direction: type === "entrada" ? "IN" : "OUT",
      amountCents: cents(amount),
      accountName: account,
      category,
      costCenter: item.costCenter,
      description,
      status: "ACTIVE",
      source: "IA",
      legacyModel: "AssistantTransaction",
      legacyId: item.id
    }
  });

  if (input.attachmentId) {
    await prisma.attachment.updateMany({
      where: { id: input.attachmentId, tenantId: input.tenantId },
      data: { linkedModel: "transactions", linkedId: item.id }
    });
  }

  return {
    executed: true,
    action: "create_transaction",
    item,
    analysis: op,
    enrichment: input.enrichment,
    message: `${type === "entrada" ? "Receita" : "Despesa"} registrada: ${description} - R$ ${amount.toFixed(2)} em ${category}.`
  };
}

