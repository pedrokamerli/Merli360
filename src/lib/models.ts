export type FieldType = "text" | "number" | "date" | "select" | "textarea" | "checkbox";

export type FieldConfig = {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  optionSource?: "clients" | "categories" | "buyers" | "products" | "plantings" | "budgets";
  required?: boolean;
};

export type ModelConfig = {
  api: string;
  title: string;
  description: string;
  fields: FieldConfig[];
  columns: string[];
};

export const modelConfigs: Record<string, ModelConfig> = {
  transactions: {
    api: "transactions",
    title: "Fluxo de Caixa",
    description: "Lancamentos financeiros da empresa, vida pessoal, anuncios e reembolsos.",
    columns: ["date", "description", "type", "category", "clientId", "amount", "status", "account"],
    fields: [
      { key: "date", label: "Data", type: "date", required: true },
      { key: "description", label: "Descricao", required: true },
      { key: "amount", label: "Valor", type: "number", required: true },
      { key: "type", label: "Tipo", type: "select", options: ["entrada", "saida"], required: true },
      { key: "category", label: "Categoria", type: "select", optionSource: "categories", required: true },
      { key: "subcategory", label: "Subcategoria" },
      { key: "clientId", label: "Cliente relacionado", type: "select", optionSource: "clients" },
      { key: "costCenter", label: "Centro de custo", type: "select", options: ["Empresa", "Pessoal", "Compartilhado", "Cliente", "A classificar"] },
      { key: "account", label: "Conta", type: "select", options: ["PJ", "pessoal", "dinheiro", "cartao", "outro"] },
      { key: "status", label: "Status", type: "select", options: ["pago", "pendente", "atrasado", "conferencia", "realizado"] },
      { key: "paymentMethod", label: "Forma de pagamento" },
      { key: "notes", label: "Observacoes", type: "textarea" },
      { key: "attachmentUrl", label: "Comprovante/link" }
    ]
  },
  clients: {
    api: "clients",
    title: "Clientes",
    description: "Dados cadastrais, contato, endereco e contrato comercial do cliente.",
    columns: ["name", "document", "whatsapp", "city", "type", "monthlyValue", "status"],
    fields: [
      { key: "name", label: "Nome / razao social", required: true },
      { key: "fantasyName", label: "Nome fantasia" },
      { key: "document", label: "CPF/CNPJ" },
      { key: "stateRegistration", label: "Inscricao estadual" },
      { key: "segment", label: "Segmento / ramo de atividade" },
      { key: "email", label: "E-mail" },
      { key: "phone", label: "Telefone" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "responsibleName", label: "Responsavel" },
      { key: "responsibleRole", label: "Cargo do responsavel" },
      { key: "website", label: "Site" },
      { key: "instagram", label: "Instagram" },
      { key: "address", label: "Endereco" },
      { key: "addressNumber", label: "Numero" },
      { key: "district", label: "Bairro" },
      { key: "city", label: "Cidade" },
      { key: "state", label: "Estado/UF" },
      { key: "zipCode", label: "CEP" },
      { key: "type", label: "Modelo comercial", type: "select", options: ["recorrente", "avulso"], required: true },
      { key: "monthlyValue", label: "Valor recorrente", type: "number" },
      { key: "dueDay", label: "Dia vencimento", type: "number" },
      { key: "status", label: "Status", type: "select", options: ["ativo", "pausado", "cancelado", "prospect"] },
      { key: "services", label: "Descricao / servicos", type: "textarea" },
      { key: "mainChannel", label: "Origem / canal" },
      { key: "startDate", label: "Data de inicio", type: "date" },
      { key: "nextAdjustment", label: "Proximo reajuste", type: "date" },
      { key: "growthPotential", label: "Potencial de aumento", type: "number" },
      { key: "estimatedHoursMonth", label: "Horas estimadas/mes", type: "number" },
      { key: "perceivedProfit", label: "Rentabilidade", type: "select", options: ["baixa", "media", "alta"] },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  categories: {
    api: "categories",
    title: "Categorias",
    description: "Lista padrao usada nos lancamentos, contas a pagar e classificacoes.",
    columns: ["name", "type", "description"],
    fields: [
      { key: "name", label: "Nome", required: true },
      { key: "type", label: "Tipo", type: "select", options: ["entrada", "saida", "neutro"], required: true },
      { key: "description", label: "Descricao", type: "textarea" }
    ]
  },
  costCenters: {
    api: "costCenters",
    title: "Centros de Custo",
    description: "Areas, projetos internos ou grupos de resultado usados para classificar receitas e despesas.",
    columns: ["name", "status", "notes"],
    fields: [
      { key: "name", label: "Nome", required: true },
      { key: "status", label: "Status", type: "select", options: ["ativo", "inativo"] },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  financialAccounts: {
    api: "financialAccounts",
    title: "Contas Financeiras",
    description: "Contas bancarias, carteiras e caixa usados para calcular saldo do sistema e conciliacao futura.",
    columns: ["name", "type", "institution", "initialBalanceCents", "observedBalanceCents", "status"],
    fields: [
      { key: "name", label: "Nome da conta", required: true },
      { key: "institution", label: "Instituicao" },
      { key: "type", label: "Tipo", type: "select", options: ["conta bancaria", "conta digital/carteira", "dinheiro/caixa", "cartao de credito", "outro"], required: true },
      { key: "currency", label: "Moeda", type: "select", options: ["BRL"] },
      { key: "initialBalanceCents", label: "Saldo inicial (R$)", type: "number" },
      { key: "initialBalanceDate", label: "Data do saldo inicial", type: "date" },
      { key: "includeInTotal", label: "Incluir no saldo consolidado", type: "checkbox" },
      { key: "status", label: "Status", type: "select", options: ["ativa", "inativa"] },
      { key: "maskedBankData", label: "Dados bancarios mascarados" },
      { key: "observedBalanceCents", label: "Saldo bancario observado (R$)", type: "number" },
      { key: "observedBalanceDate", label: "Data do saldo observado", type: "date" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  budgets: {
    api: "budgets",
    title: "Orcamentos",
    description: "Cenarios mensais usados para comparar orcado versus realizado.",
    columns: ["name", "month", "scenario", "status"],
    fields: [
      { key: "name", label: "Nome", required: true },
      { key: "month", label: "Mes", required: true },
      { key: "scenario", label: "Cenario", type: "select", options: ["base", "otimista", "conservador"], required: true },
      { key: "status", label: "Status", type: "select", options: ["ativo", "arquivado"] },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  budgetLines: {
    api: "budgetLines",
    title: "Linhas do Orcamento",
    description: "Valores mensais por categoria, centro de custo e tipo.",
    columns: ["budgetId", "category", "costCenter", "type", "budgetedCents"],
    fields: [
      { key: "budgetId", label: "Orcamento", type: "select", optionSource: "budgets", required: true },
      { key: "category", label: "Categoria", type: "select", optionSource: "categories", required: true },
      { key: "costCenter", label: "Centro de custo" },
      { key: "type", label: "Tipo", type: "select", options: ["entrada", "saida"], required: true },
      { key: "budgetedCents", label: "Valor orcado (R$)", type: "number", required: true },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  financialTitles: {
    api: "financialTitles",
    title: "Titulos Financeiros",
    description: "Compromissos financeiros unificados. Recebiveis e pagaveis ficam aqui antes das baixas.",
    columns: ["type", "description", "category", "dueDate", "originalAmountCents", "status"],
    fields: [
      { key: "type", label: "Tipo", type: "select", options: ["RECEIVABLE", "PAYABLE"], required: true },
      { key: "origin", label: "Origem", type: "select", options: ["MANUAL", "RECURRENCE", "CONTRACT", "IMPORT", "LEGACY"], required: true },
      { key: "contactLegacyId", label: "Contato", type: "select", optionSource: "clients" },
      { key: "description", label: "Descricao", required: true },
      { key: "documentNumber", label: "Documento" },
      { key: "category", label: "Categoria", type: "select", optionSource: "categories", required: true },
      { key: "costCenter", label: "Centro de custo" },
      { key: "issueDate", label: "Emissao", type: "date" },
      { key: "competenceDate", label: "Competencia", type: "date" },
      { key: "dueDate", label: "Vencimento", type: "date", required: true },
      { key: "originalAmountCents", label: "Valor original (R$)", type: "number", required: true },
      { key: "expectedAccount", label: "Conta prevista" },
      { key: "expectedPaymentMethod", label: "Forma prevista" },
      { key: "status", label: "Status", type: "select", options: ["DRAFT", "OPEN", "PARTIAL", "PAID", "CANCELED"] },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  settlements: {
    api: "settlements",
    title: "Baixas",
    description: "Recebimentos e pagamentos aplicados aos titulos financeiros.",
    columns: ["titleId", "effectiveDate", "accountName", "principalAmountCents", "effectiveAmountCents", "status"],
    fields: [
      { key: "titleId", label: "Titulo", required: true },
      { key: "effectiveDate", label: "Data efetiva", type: "date", required: true },
      { key: "accountName", label: "Conta", required: true },
      { key: "principalAmountCents", label: "Valor principal (R$)", type: "number", required: true },
      { key: "effectiveAmountCents", label: "Valor movimentado (R$)", type: "number", required: true },
      { key: "interestCents", label: "Juros (R$)", type: "number" },
      { key: "fineCents", label: "Multa (R$)", type: "number" },
      { key: "discountCents", label: "Desconto (R$)", type: "number" },
      { key: "feeCents", label: "Tarifa (R$)", type: "number" },
      { key: "writeOffCents", label: "Abatimento/perda (R$)", type: "number" },
      { key: "paymentMethod", label: "Forma de pagamento" },
      { key: "source", label: "Origem", type: "select", options: ["MANUAL", "RECONCILIATION", "LEGACY"] },
      { key: "status", label: "Status", type: "select", options: ["ACTIVE", "REVERSED"] },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  cashMovements: {
    api: "cashMovements",
    title: "Movimentos de Caixa",
    description: "Efeito financeiro realizado. Esta sera a fonte do fluxo de caixa realizado.",
    columns: ["date", "direction", "description", "accountName", "category", "amountCents", "status"],
    fields: [
      { key: "date", label: "Data", type: "date", required: true },
      { key: "direction", label: "Direcao", type: "select", options: ["IN", "OUT"], required: true },
      { key: "amountCents", label: "Valor (R$)", type: "number", required: true },
      { key: "accountName", label: "Conta", required: true },
      { key: "category", label: "Categoria", type: "select", optionSource: "categories", required: true },
      { key: "costCenter", label: "Centro de custo" },
      { key: "contactLegacyId", label: "Contato", type: "select", optionSource: "clients" },
      { key: "description", label: "Descricao", required: true },
      { key: "status", label: "Status", type: "select", options: ["ACTIVE", "REVERSED", "CANCELED"] },
      { key: "source", label: "Origem", type: "select", options: ["MANUAL", "SETTLEMENT", "LEGACY", "IMPORT"] },
      { key: "transferGroupId", label: "Grupo transferencia" }
    ]
  },
  invoices: {
    api: "invoices",
    title: "Notas Fiscais",
    description: "Controle de emissao, envio e recebimento das notas.",
    columns: ["referenceMonth", "clientId", "serviceDescription", "amount", "status", "invoiceNumber"],
    fields: [
      { key: "clientId", label: "Cliente", type: "select", optionSource: "clients" },
      { key: "referenceMonth", label: "Mes referencia", required: true },
      { key: "serviceDescription", label: "Servico prestado", required: true },
      { key: "amount", label: "Valor", type: "number", required: true },
      { key: "expectedIssueDate", label: "Data prevista", type: "date" },
      { key: "issueDate", label: "Data emissao", type: "date" },
      { key: "invoiceNumber", label: "Numero NF" },
      { key: "status", label: "Status", type: "select", options: ["emitir", "emitida", "enviada", "recebida", "cancelada"] },
      { key: "fileUrl", label: "Link/arquivo" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  adBudgets: {
    api: "adBudgets",
    title: "Controle de Ads",
    description: "Verba aprovada, recebida, gasta, saldo e reembolsos pendentes.",
    columns: ["referenceMonth", "clientId", "platform", "campaign", "budgetType", "approvedAmount", "spentAmount", "reimbursementDue", "status"],
    fields: [
      { key: "clientId", label: "Cliente", type: "select", optionSource: "clients" },
      { key: "platform", label: "Plataforma", type: "select", options: ["Meta Ads", "Google Ads", "TikTok Ads", "outro"], required: true },
      { key: "campaign", label: "Campanha" },
      { key: "objective", label: "Objetivo" },
      { key: "referenceMonth", label: "Mes referencia", required: true },
      { key: "startDate", label: "Data inicio da campanha", type: "date" },
      { key: "endDate", label: "Data fim da campanha", type: "date" },
      { key: "budgetType", label: "Tipo de verba", type: "select", options: ["Cliente enviou verba", "Pedro antecipou", "Cartao do cliente", "Conferir origem"] },
      { key: "approvedAmount", label: "Valor aprovado", type: "number" },
      { key: "spentAmount", label: "Valor gasto", type: "number" },
      { key: "reimbursedAmount", label: "Valor reembolsado", type: "number" },
      { key: "account", label: "Conta usada", type: "select", options: ["PJ", "pessoal", "dinheiro", "cartao", "outro"] },
      { key: "paymentMethod", label: "Forma de pagamento" },
      { key: "status", label: "Status", type: "select", options: ["ativo", "encerrado", "pendente", "conferir"] },
      { key: "proofUrl", label: "Comprovante/link" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  receivables: {
    api: "receivables",
    title: "Contas a Receber",
    description: "Mensalidades, vendas rurais, recorrencias, projetos avulsos, reembolsos e outros recebiveis.",
    columns: ["clientId", "description", "amount", "dueDate", "paidDate", "status", "type", "recurring"],
    fields: [
      { key: "clientId", label: "Cliente", type: "select", optionSource: "clients" },
      { key: "description", label: "Descricao", required: true },
      { key: "amount", label: "Valor", type: "number", required: true },
      { key: "dueDate", label: "Vencimento", type: "date", required: true },
      { key: "paidDate", label: "Pagamento", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["pendente", "pago", "atrasado"] },
      { key: "type", label: "Tipo", type: "select", options: ["mensalidade", "venda rural", "projeto avulso", "reembolso", "outro"] },
      { key: "recurring", label: "Recorrente", type: "checkbox" },
      { key: "recurrence", label: "Frequencia", type: "select", options: ["semanal", "quinzenal", "mensal"] },
      { key: "recurrenceDay", label: "Dia vencimento", type: "number" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  payables: {
    api: "payables",
    title: "Contas a Pagar",
    description: "Custos fixos, pessoais, compartilhados e impostos.",
    columns: ["description", "category", "amount", "dueDate", "paidDate", "status", "recurring"],
    fields: [
      { key: "description", label: "Descricao", required: true },
      { key: "category", label: "Categoria", type: "select", optionSource: "categories", required: true },
      { key: "amount", label: "Valor", type: "number", required: true },
      { key: "dueDate", label: "Vencimento", type: "date", required: true },
      { key: "paidDate", label: "Pagamento", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["pendente", "pago", "atrasado"] },
      { key: "recurring", label: "Recorrente", type: "checkbox" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  goals: {
    api: "goals",
    title: "Metas Comerciais",
    description: "Metas de MRR, novos clientes e caminhos para bater os objetivos.",
    columns: ["name", "currentValue", "targetValue", "gap", "status", "deadline"],
    fields: [
      { key: "name", label: "Meta", required: true },
      { key: "currentValue", label: "Atual", type: "number" },
      { key: "targetValue", label: "Objetivo", type: "number", required: true },
      { key: "gap", label: "Falta", type: "number" },
      { key: "actionPlan", label: "Acao", type: "textarea" },
      { key: "deadline", label: "Prazo" },
      { key: "status", label: "Status", type: "select", options: ["em andamento", "planejado", "pendente", "concluido"] },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  buyers: {
    api: "buyers",
    title: "Compradores",
    description: "Mercados, distribuidoras, restaurantes e outros compradores.",
    columns: ["name", "type", "contact", "city"],
    fields: [
      { key: "name", label: "Nome", required: true },
      { key: "type", label: "Tipo", type: "select", options: ["mercado", "distribuidora", "restaurante", "outro"], required: true },
      { key: "contact", label: "Contato" },
      { key: "city", label: "Cidade" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  products: {
    api: "products",
    title: "Culturas e Produtos",
    description: "Produtos vendidos, unidade, estoque atual e custo medio.",
    columns: ["name", "category", "unit", "currentStock", "averageCost", "minStock"],
    fields: [
      { key: "name", label: "Produto/cultura", required: true },
      { key: "category", label: "Categoria", type: "select", options: ["hortalica", "legume", "verdura", "outro"], required: true },
      { key: "unit", label: "Unidade", type: "select", options: ["kg", "caixa", "maco", "unidade", "bandeja"], required: true },
      { key: "currentStock", label: "Estoque atual", type: "number" },
      { key: "averageCost", label: "Custo medio", type: "number" },
      { key: "minStock", label: "Estoque minimo", type: "number" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  plantings: {
    api: "plantings",
    title: "Plantios",
    description: "Controle de plantio, area, previsao de colheita e custo direto.",
    columns: ["productId", "area", "plantingDate", "expectedHarvest", "quantityPlanted", "directCost", "status"],
    fields: [
      { key: "productId", label: "Produto/cultura", type: "select", optionSource: "products", required: true },
      { key: "area", label: "Area/canteiro" },
      { key: "plantingDate", label: "Data do plantio", type: "date", required: true },
      { key: "expectedHarvest", label: "Previsao de colheita", type: "date" },
      { key: "quantityPlanted", label: "Quantidade plantada", type: "number" },
      { key: "unit", label: "Unidade" },
      { key: "directCost", label: "Custo direto", type: "number" },
      { key: "status", label: "Status", type: "select", options: ["plantado", "em desenvolvimento", "pronto para colher", "colhido", "perdido"] },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  harvests: {
    api: "harvests",
    title: "Colheitas",
    description: "Registre colheitas para entrar automaticamente no estoque.",
    columns: ["productId", "plantingId", "harvestDate", "quantity", "lossQuantity", "unitCost"],
    fields: [
      { key: "productId", label: "Produto/cultura", type: "select", optionSource: "products", required: true },
      { key: "plantingId", label: "Plantio relacionado", type: "select", optionSource: "plantings" },
      { key: "harvestDate", label: "Data da colheita", type: "date", required: true },
      { key: "quantity", label: "Quantidade colhida", type: "number", required: true },
      { key: "lossQuantity", label: "Perda", type: "number" },
      { key: "unit", label: "Unidade" },
      { key: "unitCost", label: "Custo unitario estimado", type: "number" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  stockMovements: {
    api: "stockMovements",
    title: "Estoque",
    description: "Entradas, saidas e ajustes de estoque.",
    columns: ["date", "productId", "type", "quantity", "unit", "reason"],
    fields: [
      { key: "date", label: "Data", type: "date", required: true },
      { key: "productId", label: "Produto", type: "select", optionSource: "products", required: true },
      { key: "type", label: "Tipo", type: "select", options: ["entrada", "saida"], required: true },
      { key: "quantity", label: "Quantidade", type: "number", required: true },
      { key: "unit", label: "Unidade" },
      { key: "reason", label: "Motivo", type: "select", options: ["Colheita", "Venda", "Ajuste", "Perda", "Compra"] },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  sales: {
    api: "sales",
    title: "Vendas",
    description: "Vendas para mercados, distribuidoras e restaurantes com baixa de estoque.",
    columns: ["saleDate", "buyerId", "productId", "quantity", "unitPrice", "totalAmount", "status"],
    fields: [
      { key: "buyerId", label: "Comprador", type: "select", optionSource: "buyers" },
      { key: "productId", label: "Produto", type: "select", optionSource: "products", required: true },
      { key: "saleDate", label: "Data da venda", type: "date", required: true },
      { key: "deliveryDate", label: "Data de entrega", type: "date" },
      { key: "dueDate", label: "Data de recebimento", type: "date" },
      { key: "paidDate", label: "Recebido em", type: "date" },
      { key: "quantity", label: "Quantidade", type: "number", required: true },
      { key: "unit", label: "Unidade" },
      { key: "unitPrice", label: "Valor unitario", type: "number", required: true },
      { key: "totalAmount", label: "Valor total", type: "number" },
      { key: "status", label: "Status", type: "select", options: ["pendente", "recebido", "atrasado", "cancelado"] },
      { key: "account", label: "Conta", type: "select", options: ["PJ", "pessoal", "dinheiro", "cartao", "outro"] },
      { key: "paymentMethod", label: "Forma de pagamento", type: "select", options: ["Pix", "Dinheiro", "Credito", "Debito", "Marcar na conta"] },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  agendaEvents: {
    api: "agendaEvents",
    title: "Agenda",
    description: "Tarefas, entregas, plantios, colheitas e compromissos manuais.",
    columns: ["date", "title", "type", "status", "amount"],
    fields: [
      { key: "date", label: "Data", type: "date", required: true },
      { key: "title", label: "Titulo", required: true },
      { key: "type", label: "Tipo", type: "select", options: ["tarefa", "entrega", "plantio", "colheita", "receber", "pagar"] },
      { key: "status", label: "Status", type: "select", options: ["pendente", "feito", "atrasado", "cancelado"] },
      { key: "amount", label: "Valor", type: "number" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  },
  leads: {
    api: "leads",
    title: "Pipeline Comercial",
    description: "Prospeccao, propostas, negociacao e follow-ups.",
    columns: ["name", "segment", "city", "status", "proposedValue", "closeChance", "nextFollowUp"],
    fields: [
      { key: "name", label: "Lead", required: true },
      { key: "segment", label: "Segmento" },
      { key: "city", label: "Cidade" },
      { key: "contact", label: "Contato" },
      { key: "website", label: "Instagram/site" },
      { key: "status", label: "Status", type: "select", options: ["Novo lead", "Primeiro contato", "Conversando", "Diagnostico agendado", "Proposta enviada", "Negociacao", "Fechado", "Perdido"] },
      { key: "proposedValue", label: "Valor proposto", type: "number" },
      { key: "closeChance", label: "Chance de fechamento", type: "number" },
      { key: "nextFollowUp", label: "Proximo follow-up", type: "date" },
      { key: "notes", label: "Observacoes", type: "textarea" }
    ]
  }
};
