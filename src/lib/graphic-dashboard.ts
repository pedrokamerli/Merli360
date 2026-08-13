type MetricInput = {
  opportunities: any[];
  quotes: any[];
  orders: any[];
  productionOrders: any[];
  deliveries: any[];
  postSales: any[];
  receivables: any[];
  today: Date;
  tomorrow: Date;
  canViewFinancial: boolean;
};

type MetricNote = {
  key: string;
  label: string;
  formula: string;
  period: string;
  source: string;
  criteria: string;
  limitations: string;
  quality: "OK" | "INSUFFICIENT_DATA" | "RESTRICTED";
  message?: string;
};

const restrictedMessage = "Indicador financeiro restrito ao perfil autorizado.";
const insufficientMessage = "Dados insuficientes para calcular este indicador.";

function sumCents(rows: any[], key: string) {
  return rows.reduce((sum, item) => sum + Number(item[key] || 0), 0);
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function moneyMetric(canViewFinancial: boolean, rows: any[], value: number) {
  if (!canViewFinancial) return null;
  return rows.length ? value : 0;
}

function topGroups(rows: any[], key: string, valueKey?: string) {
  const map = new Map<string, { label: string; count: number; valueCents: number }>();
  for (const row of rows) {
    const label = String(row[key] || "Nao informado").trim() || "Nao informado";
    const current = map.get(label) || { label, count: 0, valueCents: 0 };
    current.count += 1;
    current.valueCents += valueKey ? Number(row[valueKey] || 0) : 0;
    map.set(label, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.valueCents - a.valueCents).slice(0, 8);
}

function note(note: Omit<MetricNote, "quality" | "message">, rows: any[], canView = true): MetricNote {
  if (!canView) return { ...note, quality: "RESTRICTED", message: restrictedMessage };
  if (!rows.length) return { ...note, quality: "INSUFFICIENT_DATA", message: insufficientMessage };
  return { ...note, quality: "OK" };
}

export function buildGraphicDashboard(input: MetricInput) {
  const openOpportunities = input.opportunities.filter((item) => item.status === "OPEN");
  const returnsToday = input.opportunities.filter((item) => item.nextFollowUp && new Date(item.nextFollowUp) >= input.today && new Date(item.nextFollowUp) < input.tomorrow).length;
  const overdueReturns = input.opportunities.filter((item) => item.status === "OPEN" && item.nextFollowUp && new Date(item.nextFollowUp) < input.today).length;
  const qualityAlerts = input.opportunities.filter((item) => item.status === "OPEN" && (!item.nextAction || !item.nextFollowUp)).length;
  const sentQuotes = input.quotes.filter((item) => ["SENT", "VIEWED"].includes(item.status));
  const approvedQuotes = input.quotes.filter((item) => item.status === "APPROVED");
  const openProduction = input.productionOrders.filter((item) => ["PENDING", "RELEASED", "IN_PROGRESS", "BLOCKED"].includes(item.status));
  const blockedProduction = openProduction.filter((item) => item.status === "BLOCKED");
  const delayedProduction = openProduction.filter((item) => item.promisedAt && new Date(item.promisedAt) < input.today);
  const openDeliveries = input.deliveries.filter((item) => ["PENDING", "SCHEDULED"].includes(item.status));
  const completedDeliveries = input.deliveries.filter((item) => item.deliveredAt);
  const onTimeDeliveries = completedDeliveries.filter((item) => !item.expectedAt || new Date(item.deliveredAt) <= new Date(item.expectedAt));
  const openPostSales = input.postSales.filter((item) => item.status === "OPEN");
  const openReceivables = input.receivables.filter((item) => item.status !== "PAID");
  const overdueReceivables = openReceivables.filter((item) => new Date(item.dueDate) < input.today);
  const reworks = input.productionOrders.flatMap((item) => item.reworks || []);
  const consumptions = input.productionOrders.flatMap((item) => item.consumptions || []);
  const soldCents = sumCents(input.orders, "soldValueCents");
  const billedCents = sumCents(input.orders, "billedValueCents");
  const receivedCents = sumCents(input.orders, "receivedValueCents");
  const approvedQuoteValues = approvedQuotes.map((item) => Number(item.totalPriceCents || 0)).filter((value) => value > 0);
  const quoteMargins = input.quotes.map((item) => Number(item.marginPercent)).filter((value) => Number.isFinite(value) && value !== 0);
  const discountsCents = sumCents(input.quotes, "discountCents");
  const clientOrderCounts = new Map<string, number>();
  for (const order of input.orders) {
    if (!order.clientId) continue;
    clientOrderCounts.set(order.clientId, (clientOrderCounts.get(order.clientId) || 0) + 1);
  }
  const opportunityClientIds = new Set(input.opportunities.map((item) => item.clientId).filter(Boolean));
  const newClients = [...clientOrderCounts.values()].filter((count) => count === 1).length;
  const recurringClients = [...clientOrderCounts.values()].filter((count) => count > 1).length;
  const inactiveClients = [...opportunityClientIds].filter((clientId) => !clientOrderCounts.has(clientId)).length;

  const metrics = {
    opportunitiesOpen: openOpportunities.length,
    returnsToday,
    overdueReturns,
    qualityAlerts,
    clientsNew: newClients,
    clientsRecurring: recurringClients,
    clientsInactive: inactiveClients,
    quotesSent: sentQuotes.length,
    quotesApproved: approvedQuotes.length,
    quoteConversionPercent: sentQuotes.length || approvedQuotes.length ? Math.round((approvedQuotes.length / Math.max(1, sentQuotes.length + approvedQuotes.length)) * 100) : null,
    averageTicketCents: moneyMetric(input.canViewFinancial, approvedQuotes, average(approvedQuoteValues) || 0),
    averageMarginPercent: input.canViewFinancial ? average(quoteMargins) : null,
    discountsCents: moneyMetric(input.canViewFinancial, input.quotes, discountsCents),
    approvalRequiredOpen: input.quotes.filter((item) => item.approvalRequired && !["APPROVED", "REFUSED", "CANCELLED"].includes(item.status)).length,
    productionOpen: openProduction.length,
    productionBlocked: blockedProduction.length,
    productionDelayed: delayedProduction.length,
    reworkOpen: reworks.filter((item) => item.status === "OPEN").length,
    wasteQuantity: consumptions.reduce((sum, item) => sum + Number(item.wasteQuantity || 0), 0),
    deliveriesOpen: openDeliveries.length,
    deliveryOnTimePercent: completedDeliveries.length ? Math.round((onTimeDeliveries.length / completedDeliveries.length) * 100) : null,
    postSalesOpen: openPostSales.length,
    soldCents: moneyMetric(input.canViewFinancial, input.orders, soldCents),
    billedCents: moneyMetric(input.canViewFinancial, input.orders, billedCents),
    receivedCents: moneyMetric(input.canViewFinancial, input.orders, receivedCents),
    openReceivablesCents: moneyMetric(input.canViewFinancial, input.receivables, openReceivables.reduce((sum, item) => sum + Number(item.amountCents || 0) - Number(item.receivedCents || 0), 0)),
    overdueReceivablesCents: moneyMetric(input.canViewFinancial, input.receivables, overdueReceivables.reduce((sum, item) => sum + Number(item.amountCents || 0) - Number(item.receivedCents || 0), 0)),
    dataQuality: input.orders.length ? "OK" : insufficientMessage
  };

  const groups = {
    salesBySource: topGroups(input.opportunities, "source"),
    salesByProduct: topGroups(input.opportunities, "productInterest"),
    salesByResponsible: topGroups(input.opportunities, "ownerName"),
    salesBySegment: topGroups(input.orders, "clientSegment", "soldValueCents"),
    revenueByProduct: input.canViewFinancial ? topGroups(input.quotes, "productName", "totalPriceCents") : [],
    revenueByClient: input.canViewFinancial ? topGroups(input.orders, "clientName", "soldValueCents") : []
  };

  const metricNotes: MetricNote[] = [
    note({ key: "opportunitiesOpen", label: "Oportunidades abertas", formula: "Quantidade de oportunidades com status OPEN.", period: "Base atual do tenant.", source: "GraphicOpportunity", criteria: "Filtra somente tenant do usuario autenticado.", limitations: "Depende do preenchimento correto do status." }, input.opportunities),
    note({ key: "returnsToday", label: "Retornos hoje", formula: "Oportunidades com nextFollowUp entre hoje 00:00 e amanha 00:00.", period: "Dia atual.", source: "GraphicOpportunity.nextFollowUp", criteria: "Considera todos os responsaveis do tenant.", limitations: "Retornos sem data nao entram neste indicador." }, input.opportunities),
    note({ key: "clientsNew", label: "Clientes novos", formula: "Clientes com exatamente um pedido grafico no conjunto carregado.", period: "Ultimos pedidos carregados no painel.", source: "GraphicOrder.clientId", criteria: "Conta clientes distintos por tenant.", limitations: "Historico limitado pela janela operacional do painel." }, input.orders),
    note({ key: "clientsRecurring", label: "Clientes recorrentes", formula: "Clientes com mais de um pedido grafico no conjunto carregado.", period: "Ultimos pedidos carregados no painel.", source: "GraphicOrder.clientId", criteria: "Conta clientes distintos por tenant.", limitations: "Historico limitado pela janela operacional do painel." }, input.orders),
    note({ key: "clientsInactive", label: "Clientes sem compra grafica", formula: "Clientes com oportunidade grafica carregada e nenhum pedido grafico carregado.", period: "Base operacional carregada no painel.", source: "GraphicOpportunity.clientId e GraphicOrder.clientId", criteria: "Somente clientes do tenant autenticado.", limitations: "Nao mede inatividade fora da janela carregada." }, input.opportunities),
    note({ key: "qualityAlerts", label: "Alertas de qualidade", formula: "Oportunidades OPEN sem proximo passo ou sem data de retorno.", period: "Base atual do tenant.", source: "GraphicOpportunity", criteria: "Somente oportunidades abertas.", limitations: "Nao mede qualidade do texto preenchido." }, input.opportunities),
    note({ key: "quotesApproved", label: "Orcamentos aprovados", formula: "Quantidade de orcamentos com status APPROVED.", period: "Ultimos registros carregados no painel.", source: "GraphicQuote", criteria: "Inclui apenas orcamentos do tenant.", limitations: "Painel operacional limita a consulta aos registros recentes." }, input.quotes),
    note({ key: "averageTicketCents", label: "Ticket medio aprovado", formula: "Media de totalPriceCents dos orcamentos APPROVED.", period: "Ultimos orcamentos carregados no painel.", source: "GraphicQuote.totalPriceCents", criteria: "Apenas orcamentos aprovados com valor positivo.", limitations: "Nao inclui pedidos criados fora do fluxo de orcamento." }, approvedQuotes, input.canViewFinancial),
    note({ key: "averageMarginPercent", label: "Margem media estimada", formula: "Media de marginPercent dos orcamentos com margem preenchida.", period: "Ultimos orcamentos carregados no painel.", source: "GraphicQuote.marginPercent", criteria: "Considera composicao de custo salva no orcamento.", limitations: "Custos importados podem estar pendentes de validacao." }, quoteMargins, input.canViewFinancial),
    note({ key: "discountsCents", label: "Descontos concedidos", formula: "Soma de discountCents dos orcamentos carregados.", period: "Ultimos orcamentos carregados no painel.", source: "GraphicQuote.discountCents", criteria: "Somente registros do tenant autenticado.", limitations: "Nao representa desconto historico fora do modulo grafico." }, input.quotes, input.canViewFinancial),
    note({ key: "productionOpen", label: "Producao aberta", formula: "Ordens com status PENDING, RELEASED, IN_PROGRESS ou BLOCKED.", period: "Ultimos registros carregados no painel.", source: "GraphicProductionOrder", criteria: "Exclui ordens concluidas e canceladas.", limitations: "Nao substitui relatorio historico completo." }, input.productionOrders),
    note({ key: "productionDelayed", label: "Producao atrasada", formula: "Ordens abertas com promisedAt anterior ao dia atual.", period: "Dia atual.", source: "GraphicProductionOrder.promisedAt", criteria: "Apenas producoes abertas.", limitations: "Ordens sem prazo prometido nao entram como atraso." }, input.productionOrders),
    note({ key: "deliveryOnTimePercent", label: "Entregas no prazo", formula: "Percentual de entregas realizadas ate expectedAt.", period: "Entregas carregadas no painel.", source: "GraphicDelivery.expectedAt/deliveredAt", criteria: "Apenas entregas com data realizada.", limitations: "Sem data realizada nao entra no percentual." }, completedDeliveries),
    note({ key: "openReceivablesCents", label: "Recebimento pendente", formula: "Soma de amountCents menos receivedCents em recebimentos nao quitados.", period: "Base atual de recebimentos da grafica.", source: "GraphicReceivable", criteria: "Somente parcelas do tenant.", limitations: "Depende da baixa correta dos pagamentos." }, input.receivables, input.canViewFinancial)
  ];

  return { metrics, metricNotes, groups };
}
