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

function moneyMetric(canViewFinancial: boolean, rows: any[], value: number) {
  if (!canViewFinancial) return null;
  return rows.length ? value : 0;
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
  const openDeliveries = input.deliveries.filter((item) => ["PENDING", "SCHEDULED"].includes(item.status));
  const openPostSales = input.postSales.filter((item) => item.status === "OPEN");
  const openReceivables = input.receivables.filter((item) => item.status !== "PAID");
  const overdueReceivables = openReceivables.filter((item) => new Date(item.dueDate) < input.today);
  const reworks = input.productionOrders.flatMap((item) => item.reworks || []);
  const consumptions = input.productionOrders.flatMap((item) => item.consumptions || []);
  const soldCents = sumCents(input.orders, "soldValueCents");
  const billedCents = sumCents(input.orders, "billedValueCents");
  const receivedCents = sumCents(input.orders, "receivedValueCents");

  const metrics = {
    opportunitiesOpen: openOpportunities.length,
    returnsToday,
    overdueReturns,
    qualityAlerts,
    quotesSent: sentQuotes.length,
    quotesApproved: approvedQuotes.length,
    quoteConversionPercent: sentQuotes.length || approvedQuotes.length ? Math.round((approvedQuotes.length / Math.max(1, sentQuotes.length + approvedQuotes.length)) * 100) : null,
    productionOpen: openProduction.length,
    reworkOpen: reworks.filter((item) => item.status === "OPEN").length,
    wasteQuantity: consumptions.reduce((sum, item) => sum + Number(item.wasteQuantity || 0), 0),
    deliveriesOpen: openDeliveries.length,
    postSalesOpen: openPostSales.length,
    soldCents: moneyMetric(input.canViewFinancial, input.orders, soldCents),
    billedCents: moneyMetric(input.canViewFinancial, input.orders, billedCents),
    receivedCents: moneyMetric(input.canViewFinancial, input.orders, receivedCents),
    openReceivablesCents: moneyMetric(input.canViewFinancial, input.receivables, openReceivables.reduce((sum, item) => sum + Number(item.amountCents || 0) - Number(item.receivedCents || 0), 0)),
    overdueReceivablesCents: moneyMetric(input.canViewFinancial, input.receivables, overdueReceivables.reduce((sum, item) => sum + Number(item.amountCents || 0) - Number(item.receivedCents || 0), 0)),
    dataQuality: input.orders.length ? "OK" : insufficientMessage
  };

  const metricNotes: MetricNote[] = [
    note({ key: "opportunitiesOpen", label: "Oportunidades abertas", formula: "Quantidade de oportunidades com status OPEN.", period: "Base atual do tenant.", source: "GraphicOpportunity", criteria: "Filtra somente tenant do usuario autenticado.", limitations: "Depende do preenchimento correto do status." }, input.opportunities),
    note({ key: "returnsToday", label: "Retornos hoje", formula: "Oportunidades com nextFollowUp entre hoje 00:00 e amanha 00:00.", period: "Dia atual.", source: "GraphicOpportunity.nextFollowUp", criteria: "Considera todos os responsaveis do tenant.", limitations: "Retornos sem data nao entram neste indicador." }, input.opportunities),
    note({ key: "qualityAlerts", label: "Alertas de qualidade", formula: "Oportunidades OPEN sem proximo passo ou sem data de retorno.", period: "Base atual do tenant.", source: "GraphicOpportunity", criteria: "Somente oportunidades abertas.", limitations: "Nao mede qualidade do texto preenchido." }, input.opportunities),
    note({ key: "quotesApproved", label: "Orcamentos aprovados", formula: "Quantidade de orcamentos com status APPROVED.", period: "Ultimos registros carregados no painel.", source: "GraphicQuote", criteria: "Inclui apenas orcamentos do tenant.", limitations: "Painel operacional limita a consulta aos registros recentes." }, input.quotes),
    note({ key: "productionOpen", label: "Producao aberta", formula: "Ordens com status PENDING, RELEASED, IN_PROGRESS ou BLOCKED.", period: "Ultimos registros carregados no painel.", source: "GraphicProductionOrder", criteria: "Exclui ordens concluidas e canceladas.", limitations: "Nao substitui relatorio historico completo." }, input.productionOrders),
    note({ key: "openReceivablesCents", label: "Recebimento pendente", formula: "Soma de amountCents menos receivedCents em recebimentos nao quitados.", period: "Base atual de recebimentos da grafica.", source: "GraphicReceivable", criteria: "Somente parcelas do tenant.", limitations: "Depende da baixa correta dos pagamentos." }, input.receivables, input.canViewFinancial)
  ];

  return { metrics, metricNotes };
}
