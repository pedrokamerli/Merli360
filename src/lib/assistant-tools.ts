import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { currentMonth, formatDate, money, monthBounds } from "@/lib/format";
import { getUnifiedAssistantContext, assistantToolMap } from "@/lib/assistant-unified";
import { financialReportFallbackText, getFinancialReportData } from "@/lib/reports";

type AssistantUser = {
  id: string;
  tenantId: string;
  name: string;
  role?: string | null;
  tenant: { kind: string; brandName: string; name?: string | null };
};

type ToolResult = {
  handled: boolean;
  tool?: string;
  answer?: string;
  data?: unknown;
};

type ToolContext = {
  user: AssistantUser;
  message: string;
  request?: NextRequest;
};

function normalize(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function brl(value: number) {
  return money.format(Number(value || 0));
}

function monthFromMessage(message: string) {
  const text = normalize(message);
  const now = new Date();
  if (/mes passado|ultimo mes/.test(text)) {
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const explicit = text.match(/\b(20\d{2})-(\d{1,2})\b/);
  if (explicit) return `${explicit[1]}-${explicit[2].padStart(2, "0")}`;
  return currentMonth();
}

function detectTool(message: string, tenantKind: string) {
  const text = normalize(message);
  const hasMoney = /(?:r\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|(?:r\$\s*)?\d+[,.]\d{2}|(?:r\$\s*)?\d+/i.test(message);
  const looksLikeFinancialEntry = hasMoney && /\b(acabei de receber|receber um pix|receber pix|recebido|recebi|entrou|caiu|pix recebido|venda|vendi|salario|salario caiu|salario recebido|gastei|paguei|comprei|saiu|pix enviado|despesa|pagamento)\b/.test(text);
  if (looksLikeFinancialEntry) return "";
  if (/\b(cria|criar|crie|cadastra|cadastrar|cadastre|adiciona|adicionar|adicione|registra|registrar|registre|lança|lancar|lance|paguei|recebi|gastei|comprei|vendi|plantei|colhi|altera|alterar|altere|edita|editar|edite|exclui|excluir|exclua|apaga|apagar|apague|remove|remover|remova|marcar|marque|baixar|baixe)\b/.test(text)) return "";
  if (/^(desfazer|desfaca|desfaz|undo)\b/.test(text)) return "desfazer_ultima_acao_ia";
  if (/(saldo|carteira|quanto tenho|conta financeira|contas financeiras)/.test(text)) return "consultar_saldo";
  if (/(como estao minhas financas|como esta minhas financas|resumo financeiro|visao geral|dashboard|situacao financeira|caixa)/.test(text)) return "obter_resumo_financeiro";
  if (/(gasto|gastos|despesa|despesas|saida|saidas).*(mes|periodo|relatorio|analise|categoria)|(?:relatorio|analise|resumo).*(gasto|gastos|despesa|despesas|saida|saidas)/.test(text)) return "analisar_gastos";
  if (/(receber|a receber|clientes.*pagaram|quem.*deve|inadimpl)/.test(text)) return "consultar_contas_receber";
  if (/(pagar|a pagar|contas vencem|vencimento|boletos|fornecedores)/.test(text)) return "consultar_contas_pagar";
  if (/(atrasad|vencid)/.test(text)) return "identificar_atrasos";
  if (/(movimentacoes|movimentacao|lancamentos|fluxo de caixa|entradas e saidas|extrato do sistema)/.test(text)) return "consultar_fluxo_caixa";
  if (/(conciliacao|conciliar|a conferir|revisar extrato|importacao|importados)/.test(text)) return "consultar_conciliacao";
  if (/(categorias|categoria|centro de custo|centros de custo)/.test(text)) return "consultar_categorias";
  if (/(contatos|clientes|fornecedores|compradores)/.test(text)) return "consultar_contatos";
  if (/(metas|objetivos|orcamento|orçamento)/.test(text)) return "consultar_metas_orcamentos";
  if (/(notificacoes|notificações|alertas|lembretes)/.test(text)) return "consultar_notificacoes";
  if (tenantKind === "agro" && /(estoque|produto|cultura|plantio|colheita|safra|venda rural|comprador|rentabilidade rural|custo por cultura)/.test(text)) return "consultar_agro";
  return "";
}

function summarizeMovements(rows: any[], direction?: "IN" | "OUT") {
  const filtered = direction ? rows.filter((item) => item.direction === direction) : rows;
  const total = filtered.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const grouped = new Map<string, number>();
  for (const row of filtered) grouped.set(row.category || "A conferir", (grouped.get(row.category || "A conferir") || 0) + Number(row.amount || 0));
  const byCategory = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  return { filtered, total, byCategory };
}

async function financialSummary(ctx: ToolContext) {
  const month = monthFromMessage(ctx.message);
  const data = await getUnifiedAssistantContext(ctx.user, month);
  const d = data.dashboard;
  const alerts = [
    d.overdueReceivables > 0 ? `${brl(d.overdueReceivables)} a receber em atraso` : "",
    d.overduePayables > 0 ? `${brl(d.overduePayables)} a pagar em atraso` : "",
    data.imports.toReview > 0 ? `${data.imports.toReview} item(ns) de extrato para revisar` : "",
    d.projectedBalance < 0 ? `projecao negativa de ${brl(d.projectedBalance)}` : ""
  ].filter(Boolean);

  const answer = [
    `Resumo financeiro de ${month}:`,
    `Saldo nas carteiras: ${brl(d.walletTotal)}`,
    `Entradas realizadas: ${brl(d.inputs)}`,
    `Saidas realizadas: ${brl(d.outputs)}`,
    `Resultado realizado: ${brl(d.result)}`,
    `A receber em aberto: ${brl(d.receivableOpen)} (${brl(d.overdueReceivables)} vencido)`,
    `A pagar em aberto: ${brl(d.payableOpen)} (${brl(d.overduePayables)} vencido)`,
    `Saldo projetado considerando abertos: ${brl(d.projectedBalance)}`,
    data.goals.length ? `Metas cadastradas: ${data.goals.map((goal: any) => goal.name).join(", ")}` : "Metas cadastradas: nenhuma meta ativa encontrada.",
    ctx.user.tenant.kind === "agro" ? `Agro: ${data.rural.products.length} produto(s)/cultura(s), ${data.rural.plantings.length} plantio(s), ${data.rural.harvests.length} colheita(s), ${data.rural.sales.length} venda(s) recentes.` : "",
    alerts.length ? `Alertas: ${alerts.join("; ")}.` : "Alertas: nenhum ponto critico encontrado agora.",
    "Proxima acao sugerida: revisar vencidos e itens de conciliacao antes de tomar decisoes com o saldo."
  ].filter(Boolean).join("\n");

  return { answer, data };
}

async function saldo(ctx: ToolContext) {
  const data = await getUnifiedAssistantContext(ctx.user, monthFromMessage(ctx.message));
  const answer = [
    `Saldo consolidado atual: ${brl(data.dashboard.walletTotal)}`,
    data.wallets.length ? data.wallets.map((wallet: any) => `${wallet.account}: ${brl(wallet.balance)} (entradas ${brl(wallet.inputs)}, saidas ${brl(wallet.outputs)})`).join("\n") : "Nenhuma carteira cadastrada ainda.",
    "Esse saldo vem das contas financeiras e movimentos ativos do fluxo de caixa."
  ].join("\n\n");
  return { answer, data: { total: data.dashboard.walletTotal, wallets: data.wallets } };
}

async function gastos(ctx: ToolContext) {
  const month = monthFromMessage(ctx.message);
  const report = await getFinancialReportData({ tenantId: ctx.user.tenantId, month });
  const outputs = report.byCategory.filter((item) => item.outputs > 0);
  const answer = [
    `Analise de gastos de ${month}:`,
    `Saidas realizadas: ${brl(report.totals.outputs)} em ${report.topMovements.filter((item) => item.direction === "OUT").length} lancamento(s).`,
    outputs.length
      ? `Gastos por categoria:\n${outputs.slice(0, 12).map((item) => `- ${item.category}: ${brl(item.outputs)} (${item.share.toFixed(1)}% das saidas, ${item.entries} lanc.)`).join("\n")}`
      : "Nao encontrei saidas realizadas no periodo.",
    report.topMovements.filter((item) => item.direction === "OUT").length
      ? `Maiores saidas:\n${report.topMovements.filter((item) => item.direction === "OUT").slice(0, 8).map((item) => `- ${formatDate(item.date)} - ${item.description}: ${brl(item.amount)} (${item.category}, ${item.account})`).join("\n")}`
      : "",
    report.alerts.length ? `Pontos de atencao:\n${report.alerts.map((item) => `- ${item}`).join("\n")}` : "Pontos de atencao: nao encontrei alertas criticos.",
    "Proxima acao: se alguma categoria estiver errada, corrija na conciliacao ou no fluxo. Eu uso essa organizacao para os proximos relatorios."
  ].filter(Boolean).join("\n\n");
  return { answer, data: { month, report, fallback: financialReportFallbackText(report, "gastos") } };
}

async function contas(ctx: ToolContext, type: "RECEIVABLE" | "PAYABLE") {
  const data = await getUnifiedAssistantContext(ctx.user, monthFromMessage(ctx.message));
  const rows = type === "RECEIVABLE" ? data.receivables : data.payables;
  const total = rows.reduce((sum, item) => sum + item.amount, 0);
  const overdue = rows.filter((item) => item.overdue);
  const label = type === "RECEIVABLE" ? "contas a receber" : "contas a pagar";
  const answer = [
    `Voce tem ${brl(total)} em ${label} abertas.`,
    `Vencidas: ${overdue.length} item(ns), total ${brl(overdue.reduce((sum, item) => sum + item.amount, 0))}.`,
    rows.length ? `Proximos itens:\n${rows.slice(0, 15).map((item) => `- ${formatDate(item.dueDate)} - ${item.description}: ${brl(item.amount)}${item.overdue ? " (vencido)" : ""} | origem: ${item.source}`).join("\n")}` : "Nenhum titulo ou conta aberta encontrado.",
    type === "RECEIVABLE" ? "Lembrete: a receber nao e dinheiro disponivel ate cair na carteira." : "Proxima acao: separe saldo para os vencimentos mais proximos."
  ].join("\n\n");
  return { answer, data: { type, total, overdueCount: overdue.length, rows } };
}

async function fluxo(ctx: ToolContext) {
  const month = monthFromMessage(ctx.message);
  const data = await getUnifiedAssistantContext(ctx.user, month);
  const answer = [
    `Fluxo de caixa de ${month}: entradas ${brl(data.dashboard.inputs)}, saidas ${brl(data.dashboard.outputs)}, resultado ${brl(data.dashboard.result)}.`,
    data.ledger.length ? `Ultimas movimentacoes:\n${data.ledger.slice(0, 15).map((item) => `- ${formatDate(item.date)} - ${item.direction === "IN" ? "Entrada" : "Saida"} - ${item.description}: ${brl(item.amount)} (${item.category || "A conferir"})`).join("\n")}` : "Nao encontrei movimentacoes no periodo."
  ].join("\n\n");
  return { answer, data: { month, rows: data.ledger, dashboard: data.dashboard } };
}

async function conciliacao(ctx: ToolContext) {
  const data = await getUnifiedAssistantContext(ctx.user, monthFromMessage(ctx.message));
  const rows = data.imports.recent.filter((item: any) => item.status === "POSTED");
  const answer = [
    `Conciliacao: ${data.imports.toReview} item(ns) aguardando revisao.`,
    rows.length ? rows.slice(0, 15).map((item: any) => `- ${formatDate(item.date)} - ${item.direction === "IN" ? "Entrada" : "Saida"} - ${item.description}: ${brl(item.amountCents / 100)} | sugestao: ${item.categorySuggestion || "A conferir"}`).join("\n") : "Nao ha itens pendentes de conciliacao agora.",
    rows.length ? "Proxima acao: abra Conciliacao, corrija categoria/conta se precisar e marque como revisado. A IA aprende com essas correcoes." : ""
  ].filter(Boolean).join("\n\n");
  return { answer, data: { rows } };
}

async function listarBasico(ctx: ToolContext, tool: string) {
  const data = await getUnifiedAssistantContext(ctx.user, monthFromMessage(ctx.message));
  if (tool === "consultar_categorias") {
    return {
      answer: [
        `Categorias cadastradas: ${data.categories.length}.`,
        data.categories.slice(0, 60).map((item: any) => `- ${item.name} (${item.type})`).join("\n"),
        data.costCenters.length ? `Centros de custo:\n${data.costCenters.map((item: any) => `- ${item.name}`).join("\n")}` : "Nenhum centro de custo cadastrado."
      ].join("\n\n"),
      data: { categories: data.categories, costCenters: data.costCenters }
    };
  }
  if (tool === "consultar_contatos") {
    return {
      answer: [
        `Clientes/contatos: ${data.contacts.clients.length}. Compradores: ${data.contacts.buyers.length}.`,
        data.contacts.clients.slice(0, 25).map((item: any) => `- ${item.name}${item.status ? ` (${item.status})` : ""}`).join("\n") || "Nenhum cliente cadastrado.",
        data.contacts.buyers.length ? `Compradores:\n${data.contacts.buyers.slice(0, 25).map((item: any) => `- ${item.name}`).join("\n")}` : ""
      ].filter(Boolean).join("\n\n"),
      data: data.contacts
    };
  }
  return {
    answer: [
      `Metas: ${data.goals.length}. Orcamentos: ${data.budgets.length}.`,
      data.goals.length ? data.goals.map((item: any) => `- ${item.name}: ${brl(item.currentValue)} de ${brl(item.targetValue)}`).join("\n") : "Nenhuma meta cadastrada.",
      data.budgets.length ? `Orcamentos recentes:\n${data.budgets.map((item: any) => `- ${item.month}: ${item.lines.length} linha(s)`).join("\n")}` : ""
    ].filter(Boolean).join("\n\n"),
    data: { goals: data.goals, budgets: data.budgets }
  };
}

async function notificacoes(ctx: ToolContext) {
  const data = await getUnifiedAssistantContext(ctx.user, monthFromMessage(ctx.message));
  const due = data.dueNotifications;
  return {
    answer: [
      `Alertas dos proximos dias: ${due.items.length}.`,
      due.items.length ? due.items.slice(0, 12).map((item: any) => `- ${item.kind || item.type} - ${item.description}: ${brl(item.amount || item.amountCents / 100 || 0)} vence ${formatDate(item.dueDate)}`).join("\n") : "Nenhum vencimento critico encontrado.",
      `Resumo: ${JSON.stringify(due.summary)}`
    ].join("\n\n"),
    data: due
  };
}

async function agro(ctx: ToolContext) {
  const data = await getUnifiedAssistantContext(ctx.user, monthFromMessage(ctx.message));
  if (ctx.user.tenant.kind !== "agro") {
    return { answer: "Este usuario nao esta no modo Agro. Posso ajudar com financeiro, clientes, contas, categorias, fluxo e relatorios do Merli360.", data: { kind: ctx.user.tenant.kind } };
  }
  const products = data.rural.products;
  const answer = [
    "Resumo operacional do Agro:",
    `Produtos/culturas: ${products.length}. Valor estimado de estoque: ${brl(data.rural.stockValue)}.`,
    `Plantios: ${data.rural.plantings.length}. Colheitas: ${data.rural.harvests.length}. Vendas: ${data.rural.sales.length}, total ${brl(data.rural.salesTotal)}. Vendas pendentes: ${data.rural.pendingSales.length}.`,
    products.length ? `Culturas/produtos:\n${products.slice(0, 15).map((item: any) => `- ${item.name}: estoque ${item.currentStock} ${item.unit || ""}, custo medio ${brl(item.averageCost || 0)}`).join("\n")}` : "Nenhum produto/cultura cadastrado ainda.",
    data.rural.plantings.length ? `Ultimos plantios:\n${data.rural.plantings.slice(0, 8).map((item: any) => `- ${formatDate(item.plantingDate)} - ${item.product?.name || "Produto"}: ${item.quantityPlanted || 0} ${item.unit || ""}, status ${item.status}`).join("\n")}` : "",
    "Proxima acao sugerida: registre plantios, colheitas e vendas com produto/cultura para a IA calcular estoque, pendencias e rentabilidade."
  ].filter(Boolean).join("\n\n");
  return { answer, data: data.rural };
}

async function desfazerUltimaAcao(ctx: ToolContext) {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: ctx.user.tenantId, userId: ctx.user.id, action: { in: ["ai_confirm_action", "ai_auto_execute_action"] }, status: "ok" },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  for (const log of logs) {
    let metadata: any = null;
    try {
      metadata = log.metadata ? JSON.parse(log.metadata) : null;
    } catch {
      metadata = null;
    }
    const result = metadata?.actionResult;
    const action = result?.action;
    const itemId = result?.item?.id;
    if (!itemId || !["create_transaction", "create_payable", "create_receivable"].includes(action)) continue;
    const undone = await prisma.$transaction(async (tx) => {
      if (action === "create_transaction") {
        await tx.cashMovement.updateMany({ where: { tenantId: ctx.user.tenantId, legacyId: itemId }, data: { status: "REVERSED" } });
        await tx.transaction.deleteMany({ where: { id: itemId, tenantId: ctx.user.tenantId, source: "IA Assistente" } });
        return "movimentacao criada pela IA";
      }
      if (action === "create_payable") {
        await tx.financialTitle.updateMany({ where: { tenantId: ctx.user.tenantId, legacyModel: "AccountPayable", legacyId: itemId }, data: { status: "CANCELED" } });
        await tx.accountPayable.deleteMany({ where: { id: itemId, tenantId: ctx.user.tenantId } });
        return "conta a pagar criada pela IA";
      }
      if (action === "create_receivable") {
        await tx.financialTitle.updateMany({ where: { tenantId: ctx.user.tenantId, legacyModel: "AccountReceivable", legacyId: itemId }, data: { status: "CANCELED" } });
        await tx.accountReceivable.deleteMany({ where: { id: itemId, tenantId: ctx.user.tenantId } });
        return "conta a receber criada pela IA";
      }
      return "";
    });
    if (undone) {
      await audit({ tenantId: ctx.user.tenantId, userId: ctx.user.id, action: "ai_undo_last_action", entity: action, entityId: itemId, request: ctx.request, metadata: { sourceAuditLogId: log.id } });
      return { answer: `Desfiz a ultima acao reversivel da IA: ${undone}.`, data: { sourceAuditLogId: log.id, action, itemId } };
    }
  }
  return { answer: "Nao encontrei uma acao recente da IA que eu consiga desfazer com seguranca.", data: null };
}

export async function runAssistantTool(ctx: ToolContext): Promise<ToolResult> {
  const tool = detectTool(ctx.message, ctx.user.tenant.kind);
  if (!tool) return { handled: false };
  try {
    let result: { answer: string; data?: unknown };
    if (tool === "consultar_saldo") result = await saldo(ctx);
    else if (tool === "obter_resumo_financeiro") result = await financialSummary(ctx);
    else if (tool === "analisar_gastos") result = await gastos(ctx);
    else if (tool === "consultar_contas_receber") result = await contas(ctx, "RECEIVABLE");
    else if (tool === "consultar_contas_pagar") result = await contas(ctx, "PAYABLE");
    else if (tool === "identificar_atrasos") {
      const [receber, pagar] = await Promise.all([contas(ctx, "RECEIVABLE"), contas(ctx, "PAYABLE")]);
      result = { answer: `Atrasos encontrados:\n\n${receber.answer}\n\n${pagar.answer}`, data: { receber: receber.data, pagar: pagar.data } };
    } else if (tool === "consultar_fluxo_caixa") result = await fluxo(ctx);
    else if (tool === "consultar_conciliacao") result = await conciliacao(ctx);
    else if (["consultar_categorias", "consultar_contatos", "consultar_metas_orcamentos"].includes(tool)) result = await listarBasico(ctx, tool);
    else if (tool === "consultar_notificacoes") result = await notificacoes(ctx);
    else if (tool === "consultar_agro") result = await agro(ctx);
    else if (tool === "desfazer_ultima_acao_ia") result = await desfazerUltimaAcao(ctx);
    else return { handled: false };

    await audit({ tenantId: ctx.user.tenantId, userId: ctx.user.id, action: "ai_tool_call", entity: tool, request: ctx.request, metadata: { message: ctx.message, result: result.data } });
    return { handled: true, tool, answer: result.answer, data: result.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao executar ferramenta da IA.";
    await audit({ tenantId: ctx.user.tenantId, userId: ctx.user.id, action: "ai_tool_call", entity: tool, status: "error", message, request: ctx.request });
    return { handled: true, tool, answer: `Tentei executar a ferramenta ${tool}, mas encontrei um erro: ${message}` };
  }
}

export function assistantToolCatalog(kind = "consultoria") {
  const map = assistantToolMap(kind);
  return [...map.consultas, ...map.criacoes, ...map.atualizacoes, ...map.analises, ...("agro" in map ? map.agro : [])];
}
