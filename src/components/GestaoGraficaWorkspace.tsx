"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, ClipboardList, Download, Factory, FileText, Loader2, PackageCheck, Plus, RefreshCw, Search, Settings, Star, Trash2, Upload } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";

type AnyRow = Record<string, any>;
type GraphicTab = "dashboard" | "base" | "commercial" | "production" | "delivery" | "finance" | "postSale";
type GraphicWorkspace = "commercial" | "administrative" | "operations" | "management" | "settings";
type GraphicTabMeta = {
  key: GraphicTab;
  label: string;
  count: string;
  title: string;
  description: string;
  action: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format((cents || 0) / 100);
const day = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Sem data";
const labelForStatus = (status?: string) => ({
  OPEN: "Em aberto", PARTIAL: "Parcial", PAID: "Recebido", OVERDUE: "Vencido", CANCELLED: "Cancelado",
  PENDING: "Aguardando", RELEASED: "Liberada", IN_PROGRESS: "Em producao", BLOCKED: "Com impedimento", COMPLETED: "Concluida",
  SENT: "Enviado", APPROVED: "Aprovado", REFUSED: "Recusado", DRAFT: "Rascunho", DELIVERED: "Entregue", ACCEPTED: "Aceita"
} as Record<string, string>)[status || ""] || status || "Nao informado";
const graphicRoleOptions = [
  ["GRAPHIC_OWNER", "Dono"],
  ["GRAPHIC_ADMIN", "Administrativo"],
  ["GRAPHIC_SALES", "Comercial"],
  ["GRAPHIC_OPERATIONS", "Operacao"],
  ["GRAPHIC_ADVISOR", "Consultor"]
];

const opportunityInitial = {
  clientId: "",
  clientName: "",
  phone: "",
  email: "",
  city: "",
  state: "",
  title: "",
  source: "Atendimento",
  productInterest: "Banner",
  estimatedValue: "",
  status: "OPEN",
  nextAction: "Enviar orcamento",
  nextFollowUp: ""
};

const quoteInitial = {
  opportunityId: "",
  clientId: "",
  productId: "",
  description: "",
  quantity: "1",
  width: "",
  height: "",
  unit: "unidade",
  materialCost: "",
  processCost: "",
  outsourcedCost: "",
  laborCost: "",
  freight: "",
  installation: "",
  extraCost: "",
  wastePercent: "8",
  negotiatedPrice: "",
  discount: "",
  urgency: "",
  deadlineDays: "7",
  validUntil: "",
  paymentTerms: "50% na aprovacao e 50% na entrega",
  notes: ""
};

function todayPlus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const inputClass = "min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const graphicReports = [
  ["opportunities", "Oportunidades"],
  ["quotes", "Orcamentos"],
  ["orders", "Pedidos"],
  ["production", "Producao"],
  ["receivables", "Recebimentos"],
  ["audit", "Auditoria"]
];

function operationLane(item: AnyRow, deliveries: AnyRow[]) {
  const delivery = deliveries.find((row) => row.orderId === item.orderId);
  if (delivery?.status === "ACCEPTED" || delivery?.status === "DELIVERED") return "Concluido";
  if (delivery?.status === "SCHEDULED") return "Expedicao";
  if (item.status === "COMPLETED") return "Finalizacao";
  if (item.status === "IN_PROGRESS") return "Producao";
  if (item.status === "RELEASED") return "Criacao";
  if ((item.steps || []).some((step: AnyRow) => step.name === "Arte" && step.status === "IN_PROGRESS")) return "Criacao";
  return "Entrada";
}

export function GestaoGraficaWorkspace({ workspace, scope = "all" }: { workspace?: GraphicWorkspace; scope?: "all" | "mine" } = {}) {
  const [data, setData] = useState<AnyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<AnyRow | null>(null);
  const [opportunityForm, setOpportunityForm] = useState(opportunityInitial);
  const [quoteForm, setQuoteForm] = useState({ ...quoteInitial, validUntil: todayPlus(7) });
  const [extraQuoteItems, setExtraQuoteItems] = useState<Array<typeof quoteInitial>>([]);
  const initialTab: GraphicTab = workspace === "operations" ? "production" : workspace === "administrative" ? "finance" : workspace === "management" ? "dashboard" : workspace === "settings" ? "base" : "commercial";
  const [activeTab, setActiveTab] = useState<GraphicTab>(initialTab);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/gestao-grafica/summary${scope === "mine" ? "?scope=mine" : ""}`, { cache: "no-store" });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel carregar a Gestao da Grafica.");
      return;
    }
    setData(payload);
  }

  useEffect(() => { void load(); }, []);

  const filteredOpportunities = useMemo(() => {
    const rows = data?.opportunities || [];
    if (!search.trim()) return rows;
    const term = search.toLowerCase();
    return rows.filter((item: AnyRow) => [item.title, item.productInterest, item.source, item.nextAction].join(" ").toLowerCase().includes(term));
  }, [data, search]);

  const globalSearchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [] as Array<{ key: string; label: string; title: string; detail: string; href?: string }>;
    const matches = (value: unknown) => String(value || "").toLowerCase().includes(term);
    const rows: Array<{ key: string; label: string; title: string; detail: string; href?: string }> = [];
    for (const client of data?.clients || []) {
      if (matches(client.name) || matches(client.phone) || matches(client.email)) rows.push({ key: `client-${client.id}`, label: "Cliente", title: client.name, detail: [client.phone, client.email, client.city].filter(Boolean).join(" | ") || "Cadastro CRM", href: `/gestao-grafica/clientes/${client.id}` });
    }
    for (const quote of data?.quotes || []) {
      if (matches(quote.number) || matches(quote.client?.name) || matches(quote.client?.phone)) rows.push({ key: `quote-${quote.id}`, label: "Orcamento", title: `#${quote.number} - ${quote.client?.name || "Cliente"}`, detail: `${brl(quote.totalPriceCents)} | ${day(quote.validUntil)}`, href: quote.clientId ? `/gestao-grafica/clientes/${quote.clientId}` : undefined });
    }
    for (const order of data?.orders || []) {
      if (matches(order.number) || matches(order.clientName)) rows.push({ key: `order-${order.id}`, label: "Pedido", title: `#${order.number} - ${order.clientName || "Cliente"}`, detail: order.productName || "Produto a definir", href: order.clientId ? `/gestao-grafica/clientes/${order.clientId}` : undefined });
    }
    return rows.slice(0, 12);
  }, [data, search]);

  const metrics = data?.metrics || {};
  const groups = data?.groups || {};
  const metricNotes = data?.metricNotes || [];
  const openOpportunities = (data?.opportunities || []).filter((item: AnyRow) => ["OPEN", "QUOTE_CREATED"].includes(item.status));
  const draftQuotes = (data?.quotes || []).filter((item: AnyRow) => item.status !== "APPROVED");
  const productionRows = data?.productionOrders || [];
  const deliveryRows = data?.deliveries || [];
  const receivableRows = data?.receivables || [];
  const postSaleRows = data?.postSales || [];
  const products = data?.products || [];
  const clients = data?.clients || [];
  const materials = data?.materials || [];
  const processes = data?.processes || [];
  const settings = data?.settings || [];
  const stages = data?.stages || [];
  const users = data?.users || [];
  const settingMap = Object.fromEntries(settings.map((item: AnyRow) => [item.key, item.value]));
  const operationalSettings = data?.operationalSettings || {};
  const activeStages = stages.length ? stages : [{ name: "OPEN" }, { name: "QUOTE_CREATED" }, { name: "WON" }, { name: "LOST" }];
  const pipelineStages = activeStages.map((stage: AnyRow) => ({ ...stage, items: (data?.opportunities || []).filter((item: AnyRow) => item.status === stage.name) }));
  const allTabs: GraphicTabMeta[] = [
    { key: "dashboard", label: "Painel", count: String(metrics.qualityAlerts || 0), title: "Painel operacional", description: "Indicadores, alertas e relatorios para decidir o que atacar primeiro.", action: "Ver indicadores" },
    { key: "commercial", label: "Comercial", count: String(openOpportunities.length), title: "Comercial", description: "Cadastre clientes de qualquer canal, crie oportunidades, gere orcamentos e mova o funil.", action: "Atender cliente" },
    { key: "production", label: "Producao", count: String(productionRows.length), title: "Producao", description: "Acompanhe ordens, checklist, materiais, tempos, bloqueios e evidencias.", action: "Executar ordem" },
    { key: "delivery", label: "Entregas", count: String(deliveryRows.length), title: "Entregas", description: "Agende, comprove, conclua e registre aceite ou reclamacao do cliente.", action: "Controlar entrega" },
    { key: "finance", label: "Recebimentos", count: String(receivableRows.filter((item: AnyRow) => item.status !== "PAID").length), title: "Recebimentos", description: "Veja vendido, faturado, recebido e registre baixas das parcelas abertas.", action: "Baixar parcela" },
    { key: "postSale", label: "Pos-venda", count: String(postSaleRows.filter((item: AnyRow) => item.status === "OPEN").length), title: "Pos-venda", description: "Feche o atendimento depois da entrega e gere nova venda ou tarefa quando fizer sentido.", action: "Registrar contato" },
    { key: "base", label: "Base", count: String(products.length + materials.length + processes.length), title: "Base de custos", description: "Importe planilhas e mantenha produtos, materiais, processos, parametros, funil e papeis.", action: "Configurar base" }
  ];
  const tabs = workspace === "commercial" ? allTabs.filter((tab) => ["commercial", "postSale"].includes(tab.key))
    : workspace === "operations" ? allTabs.filter((tab) => ["production", "delivery"].includes(tab.key))
      : workspace === "administrative" ? allTabs.filter((tab) => tab.key === "finance")
        : workspace === "settings" ? allTabs.filter((tab) => tab.key === "base")
          : workspace === "management" ? allTabs.filter((tab) => tab.key === "dashboard")
            : allTabs;
  const activeTabMeta = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  async function saveCatalog(type: string, payload: AnyRow) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload })
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel salvar o cadastro.");
      return false;
    }
    setMessage("Cadastro grafico salvo.");
    await load();
    return true;
  }

  async function importSpreadsheet(confirm = false) {
    if (!importFile) return;
    setSaving(true);
    setMessage("");
    const form = new FormData();
    form.append("file", importFile);
    if (confirm) form.append("confirm", "true");
    const response = await fetch("/api/gestao-grafica/import", { method: "POST", body: form });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel importar a planilha.");
      return;
    }
    if (!confirm) {
      setImportPreview(result);
      setMessage(`Previa carregada: ${result.total || 0} itens encontrados.`);
      return;
    }
    setImportPreview(null);
    setImportFile(null);
    setMessage(`Importacao concluida: ${result.total || 0} itens processados.`);
    await load();
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opportunityForm)
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel criar a oportunidade.");
      return;
    }
    setOpportunityForm(opportunityInitial);
    setQuoteForm((current) => ({ ...current, opportunityId: payload.item.id, clientId: payload.client.id, description: payload.item.productInterest || payload.item.title }));
    setMessage("Oportunidade criada. Agora voce pode gerar o orcamento sem redigitar o cliente.");
    await load();
  }

  function applyClientToOpportunity(clientId: string) {
    const selected = clients.find((item: AnyRow) => item.id === clientId);
    setOpportunityForm({
      ...opportunityForm,
      clientId,
      clientName: selected?.name || "",
      phone: selected?.phone || "",
      email: selected?.email || "",
      city: selected?.city || "",
      state: selected?.state || ""
    });
    setQuoteForm((current) => ({ ...current, clientId }));
  }

  function applyProductToQuote(productId: string) {
    const selected = products.find((item: AnyRow) => item.id === productId);
    const component = selected?.components?.[0];
    const productProcess = selected?.processes?.[0];
    setQuoteForm({
      ...quoteForm,
      productId,
      description: selected?.name || quoteForm.description,
      materialCost: component?.material?.currentCostCents ? String(component.material.currentCostCents / 100) : quoteForm.materialCost,
      processCost: productProcess?.process?.costCents ? String(productProcess.process.costCents / 100) : quoteForm.processCost,
      wastePercent: component?.wastePercent !== undefined ? String(component.wastePercent) : quoteForm.wastePercent,
      unit: selected?.unit || quoteForm.unit
    });
  }

  function applyProductToExtraQuote(index: number, productId: string) {
    const selected = products.find((item: AnyRow) => item.id === productId);
    const component = selected?.components?.[0];
    const productProcess = selected?.processes?.[0];
    setExtraQuoteItems((items) => items.map((item, current) => current !== index ? item : {
      ...item,
      productId,
      description: selected?.name || item.description,
      materialCost: component?.material?.currentCostCents ? String(component.material.currentCostCents / 100) : item.materialCost,
      processCost: productProcess?.process?.costCents ? String(productProcess.process.costCents / 100) : item.processCost,
      wastePercent: component?.wastePercent !== undefined ? String(component.wastePercent) : item.wastePercent,
      unit: selected?.unit || item.unit
    }));
  }

  async function updateOpportunity(id: string, payload: AnyRow, success = "Oportunidade atualizada.") {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/opportunities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payload })
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel atualizar a oportunidade.");
      return false;
    }
    setMessage(success);
    await load();
    return true;
  }

  async function moveOpportunityStage(item: AnyRow, status: string) {
    const payload: AnyRow = { status, nextAction: item.nextAction, nextFollowUp: item.nextFollowUp };
    if (status === "LOST") {
      const lossReason = prompt(`Motivo da perda (${operationalSettings.lossReasons || "Preco, Prazo, Concorrencia, Sem retorno, Outro"})`);
      if (!lossReason) return;
      payload.lossReason = lossReason;
    }
    await updateOpportunity(item.id, payload, "Etapa atualizada.");
  }

  async function recordOpportunityContact(item: AnyRow) {
    const note = prompt("O que aconteceu no contato?", item.nextAction || "");
    if (!note) return;
    await updateOpportunity(item.id, { note, channel: "Atendimento", result: "Contato registrado" }, "Contato registrado na oportunidade.");
  }

  async function rescheduleOpportunity(item: AnyRow) {
    const nextAction = prompt("Proximo passo", item.nextAction || "Retornar cliente");
    if (!nextAction) return;
    const nextFollowUp = prompt("Data do retorno (AAAA-MM-DD)", String(item.nextFollowUp || "").slice(0, 10) || todayPlus(1));
    if (!nextFollowUp) return;
    await updateOpportunity(item.id, { nextAction, nextFollowUp, note: `Retorno reagendado: ${nextAction}` }, "Retorno reagendado e tarefa criada.");
  }

  async function loseOpportunity(item: AnyRow) {
    const lossReason = prompt(`Motivo da perda (${operationalSettings.lossReasons || "Preco, Prazo, Concorrencia, Sem retorno, Outro"})`);
    if (!lossReason) return;
    await updateOpportunity(item.id, { status: "LOST", lossReason, note: lossReason, result: "Oportunidade perdida" }, "Oportunidade marcada como perdida.");
  }

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...quoteForm, items: [quoteForm, ...extraQuoteItems] })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel criar o orcamento.");
      return;
    }
    setQuoteForm({ ...quoteInitial, validUntil: todayPlus(7) });
    setExtraQuoteItems([]);
    setMessage(payload.item.approvalRequired ? "Orcamento criado com alerta de aprovacao." : "Orcamento criado e pronto para aprovacao.");
    await load();
  }

  async function approveQuote(id: string) {
    if (!confirm("Aprovar este orcamento e gerar pedido, producao e recebimento?")) return;
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/quotes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel aprovar o orcamento.");
      return;
    }
    setMessage(`Pedido ${payload.order.number} e ordem de producao criados automaticamente.`);
    await load();
  }

  async function quoteAction(id: string, action: string) {
    const reason = ["refuse", "cancel", "approve-commercial"].includes(action) ? prompt(action === "refuse" ? "Motivo da recusa" : action === "cancel" ? "Motivo do cancelamento" : "Observacao da aprovacao comercial") || "" : "";
    if (["refuse", "cancel"].includes(action) && !reason) return;
    const nextAction = action === "send" ? prompt("Proximo passo comercial", "Retornar orcamento enviado") || "" : "";
    const nextFollowUp = action === "send" ? prompt("Data do retorno (AAAA-MM-DD)", todayPlus(1)) || "" : "";
    if (action === "send" && (!nextAction || !nextFollowUp)) return;
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/quotes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, reason, nextAction, nextFollowUp })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel alterar o orcamento.");
      return;
    }
    setMessage(action === "duplicate" ? `Orcamento duplicado: #${payload.item?.number}.` : action === "approve-commercial" ? "Excecao comercial aprovada. Agora o orcamento pode virar pedido." : "Orcamento atualizado.");
    await load();
  }

  async function updateProduction(id: string, status: string, extra: AnyRow = {}) {
    const note = status === "BLOCKED" ? prompt("Informe o impedimento da producao") || "" : "";
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/production", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, note, ...extra })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel atualizar a producao.");
      return;
    }
    setMessage("Producao atualizada.");
    await load();
  }

  async function updateProductionAction(id: string, payload: AnyRow, success = "Producao atualizada.") {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/production", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payload })
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel atualizar a producao.");
      return false;
    }
    setMessage(success);
    await load();
    return true;
  }

  async function startCreation(item: AnyRow) {
    const artStep = (item.steps || []).find((step: AnyRow) => step.name === "Arte");
    if (!artStep) { setMessage("Esta ordem nao possui a etapa de criacao."); return; }
    await updateProductionAction(item.id, { action: "step", stepId: artStep.id, stepStatus: "IN_PROGRESS" }, "Criacao iniciada.");
  }

  async function uploadGraphicAttachment(file: File, linkedModel: string, linkedId: string, purpose = "PHOTO") {
    setSaving(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    form.append("linkedModel", linkedModel);
    form.append("linkedId", linkedId);
    form.append("purpose", purpose);
    const response = await fetch("/api/gestao-grafica/attachments", { method: "POST", body: form });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel anexar o arquivo.");
      return false;
    }
    setMessage("Arquivo anexado com seguranca.");
    await load();
    return true;
  }

  async function removeGraphicAttachment(id: string) {
    if (!confirm("Remover este arquivo da ficha da grafica? O historico sera mantido.")) return false;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/attachments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reason: "Removido pela tela de producao" })
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Nao foi possivel remover o arquivo.");
      return false;
    }
    setMessage("Arquivo removido da ficha. O historico foi preservado.");
    await load();
    return true;
  }

  async function updateDelivery(id: string, status: string) {
    const note = status === "COMPLAINT" ? prompt("Informe a reclamacao ou motivo") || "" : "";
    const current = deliveryRows.find((item: AnyRow) => item.id === id) || {};
    const method = status === "SCHEDULED" ? prompt("Metodo de entrega", current.method || "RETIRADA") || current.method : current.method;
    const expectedAt = status === "SCHEDULED" ? prompt("Data prevista (AAAA-MM-DD)", current.expectedAt ? new Date(current.expectedAt).toISOString().slice(0, 10) : todayPlus(1)) || "" : "";
    const responsibleName = ["SCHEDULED", "DELIVERED", "ACCEPTED"].includes(status) ? prompt("Responsavel pela entrega", current.responsibleName || "") || current.responsibleName || "" : current.responsibleName || "";
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/deliveries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, note, method, expectedAt, responsibleName, deliveredAt: new Date().toISOString().slice(0, 10) })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel atualizar a entrega.");
      return;
    }
    setMessage(status === "DELIVERED" || status === "ACCEPTED" ? "Entrega registrada e pos-venda criado." : "Entrega atualizada.");
    await load();
  }

  async function uploadDeliveryProof(file: File, deliveryId: string) {
    return uploadGraphicAttachment(file, "delivery", deliveryId, "DELIVERY_PROOF");
  }

  async function registerPayment(id: string) {
    const amount = prompt("Valor recebido");
    if (!amount) return;
    const accountName = prompt("Conta de recebimento", "Conta principal") || "Conta principal";
    const method = prompt("Forma de pagamento", "Pix") || "Manual";
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, amount, accountName, method, paidAt: new Date().toISOString().slice(0, 10) })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel registrar o recebimento.");
      return;
    }
    setMessage(payload.pendingCents > 0 ? `Recebimento parcial registrado. Pendente: ${brl(payload.pendingCents)}.` : "Recebimento quitado.");
    await load();
  }

  async function closePostSale(id: string) {
    const satisfaction = prompt("Satisfacao de 1 a 5", "5");
    if (!satisfaction) return;
    const note = prompt("Observacao do pos-venda", "Cliente contatado apos entrega.") || "";
    const complaint = Number(satisfaction) <= 3 ? prompt("Reclamacao ou ponto de atencao", note) || "" : "";
    const createOpportunity = confirm("Criar nova oportunidade/tarefa a partir deste pos-venda?");
    const nextAction = createOpportunity ? prompt("Proximo passo", complaint ? "Resolver reclamacao do cliente" : "Apresentar nova oferta") || "" : "";
    const nextFollowUp = createOpportunity && nextAction ? prompt("Data do retorno (AAAA-MM-DD)", todayPlus(3)) || "" : "";
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/post-sales", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, satisfaction, note, complaint, createOpportunity, nextAction, nextFollowUp, status: "DONE" })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "Nao foi possivel fechar o pos-venda.");
      return;
    }
    setMessage(payload.newOpportunity ? "Pos-venda registrado e nova oportunidade criada." : "Pos-venda registrado.");
    await load();
  }

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <header className="surface-panel flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Modulo nativo</p>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{scope === "mine" ? "Minhas vendas" : "Gestao da Grafica"}</h1>
          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Fluxo operacional da grafica: cliente, orcamento, producao, entrega, recebimento e pos-venda, cada etapa em sua propria aba.</p>
        </div>
        <button className="secondary-action inline-flex items-center gap-2 px-4 py-2" onClick={load} type="button">
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div> : null}
      {loading ? <div className="surface-panel flex items-center gap-2 p-5 text-sm font-bold text-slate-600"><Loader2 className="animate-spin" size={18} /> Carregando modulo...</div> : null}

      <nav className="surface-panel sticky top-2 z-10 grid grid-cols-2 gap-2 p-2 sm:flex sm:overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`flex min-h-[56px] shrink-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition sm:min-w-[158px] ${activeTab === tab.key ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-black">{tab.label}</span>
              <span className={`mt-0.5 block truncate text-[10px] font-bold ${activeTab === tab.key ? "text-white/70" : "text-slate-400"}`}>{tab.action}</span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${activeTab === tab.key ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"}`}>{tab.count}</span>
          </button>
        ))}
      </nav>

      <section className="surface-panel p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">Area ativa</p>
            <h2 className="text-xl font-black text-slate-950">{activeTabMeta.title}</h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">{activeTabMeta.description}</p>
          </div>
          {!workspace ? <div className="grid grid-cols-3 gap-2 text-center text-xs font-black sm:w-[360px]">
            <button className="rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600" type="button" onClick={() => setActiveTab("commercial")}>
              {openOpportunities.length}
              <span className="block text-[10px] font-bold text-slate-400">vendas</span>
            </button>
            <button className="rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600" type="button" onClick={() => setActiveTab("production")}>
              {productionRows.length}
              <span className="block text-[10px] font-bold text-slate-400">producao</span>
            </button>
            <button className="rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600" type="button" onClick={() => setActiveTab("finance")}>
              {receivableRows.filter((item: AnyRow) => item.status !== "PAID").length}
              <span className="block text-[10px] font-bold text-slate-400">a receber</span>
            </button>
          </div> : null}
        </div>
      </section>

      {activeTab === "dashboard" ? <section className="surface-panel p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Relatorios da grafica</h2>
            <p className="text-xs font-semibold text-slate-500">Exportacoes em CSV com tenant, perfil e auditoria aplicados no servidor.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {graphicReports.map(([model, label]) => (
              <a key={model} className="secondary-action inline-flex items-center gap-2 px-3 py-2 text-xs" href={`/api/gestao-grafica/reports/${model}`}>
                <Download size={14} /> {label}
              </a>
            ))}
          </div>
        </div>
      </section> : null}

      {activeTab === "dashboard" ? <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <MetricCard label="Oportunidades abertas" value={String(metrics.opportunitiesOpen || 0)} hint="funil grafico" />
        <MetricCard label="Retornos hoje" value={String(metrics.returnsToday || 0)} hint={`${metrics.overdueReturns || 0} atrasados`} tone={metrics.overdueReturns ? "warn" : "default"} />
        <MetricCard label="Alertas de qualidade" value={String(metrics.qualityAlerts || 0)} hint="sem proximo passo completo" tone={metrics.qualityAlerts ? "danger" : "good"} />
        <MetricCard label="Clientes novos" value={String(metrics.clientsNew || 0)} hint={`${metrics.clientsRecurring || 0} recorrentes`} />
        <MetricCard label="Clientes inativos" value={String(metrics.clientsInactive || 0)} hint="com oportunidade sem pedido" tone={metrics.clientsInactive ? "warn" : "good"} />
        <MetricCard label="Orcamentos aprovados" value={String(metrics.quotesApproved || 0)} hint={`${metrics.quotesSent || 0} enviados/visualizados`} tone="good" />
        <MetricCard label="Ticket medio" value={metrics.averageTicketCents === null ? "Restrito" : brl(metrics.averageTicketCents || 0)} hint={`${metrics.approvalRequiredOpen || 0} aprovacoes abertas`} />
        <MetricCard label="Producao aberta" value={String(metrics.productionOpen || 0)} hint={`${metrics.productionDelayed || 0} atrasadas, ${metrics.productionBlocked || 0} bloqueadas`} tone={metrics.productionDelayed || metrics.productionBlocked ? "danger" : "default"} />
        <MetricCard label="Tempo producao" value={metrics.averageProductionCycleHours === null ? "Sem base" : `${metrics.averageProductionCycleHours}h`} hint={`prev ${metrics.productionPlannedHours || 0}h | real ${metrics.productionActualHours || 0}h`} tone={metrics.productionTimeVariancePercent > 0 ? "warn" : "default"} />
        <MetricCard label="Aprov. ate producao" value={metrics.averageApprovalToProductionHours === null ? "Sem base" : `${metrics.averageApprovalToProductionHours}h`} hint={metrics.productionTimeVariancePercent === null ? "sem variacao" : `${metrics.productionTimeVariancePercent}% var.`} />
        <MetricCard label="Entregas abertas" value={String(metrics.deliveriesOpen || 0)} hint={metrics.deliveryOnTimePercent === null ? `${metrics.postSalesOpen || 0} pos-vendas` : `${metrics.deliveryOnTimePercent}% no prazo`} />
        <MetricCard label="Recebimento pendente" value={metrics.openReceivablesCents === null ? "Restrito" : brl(metrics.openReceivablesCents || 0)} hint={metrics.dataQuality || "valor aberto"} tone={metrics.overdueReceivablesCents ? "danger" : "warn"} />
      </section> : null}

      {activeTab === "dashboard" ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <GroupBox title="Vendas por origem" rows={groups.salesBySource || []} />
        <GroupBox title="Vendas por produto" rows={groups.salesByProduct || []} />
        <GroupBox title="Vendas por responsavel" rows={groups.salesByResponsible || []} />
        <GroupBox title="Vendas por segmento" rows={groups.salesBySegment || []} money />
        <GroupBox title="Resultado por produto" rows={groups.revenueByProduct || []} money />
        <GroupBox title="Resultado por cliente" rows={groups.revenueByClient || []} money />
      </section> : null}

      {activeTab === "dashboard" ? <section className="surface-panel p-4"><div className="mb-3 flex items-center justify-between gap-2"><div><p className="eyebrow">Qualidade de dados</p><h2 className="text-lg font-black text-slate-950">Pendencias que travam o processo</h2></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{(data?.qualityItems || []).filter((item: AnyRow) => Number(item.count || 0) > 0).length} alerta(s)</span></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{(data?.qualityItems || []).map((item: AnyRow) => <article key={item.key} className={Number(item.count || 0) ? "rounded-lg border border-amber-200 bg-amber-50 p-3" : "rounded-lg border border-emerald-200 bg-emerald-50 p-3"}><p className="text-xs font-black text-slate-700">{item.label}</p><p className="mt-1 text-2xl font-black text-slate-950">{item.count === null ? "Restrito" : item.count}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.action}</p></article>)}</div></section> : null}

      {workspace === "commercial" && activeTab === "commercial" ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Retornos atrasados" value={String(metrics.overdueReturns || 0)} hint="prioridade do dia" tone={metrics.overdueReturns ? "danger" : "good"} />
        <MetricCard label="Retornos hoje" value={String(metrics.returnsToday || 0)} hint="contatos agendados" tone={metrics.returnsToday ? "warn" : "good"} />
        <MetricCard label="Oportunidades abertas" value={String(metrics.opportunitiesOpen || 0)} hint="atendimentos em curso" />
        <MetricCard label="Propostas aguardando" value={String(metrics.quotesSent || 0)} hint="enviadas ao cliente" />
        <MetricCard label="Pos-vendas" value={String(metrics.postSalesOpen || 0)} hint="clientes para contatar" />
      </section> : null}

      {activeTab === "dashboard" ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metricNotes.map((item: AnyRow) => (
          <article key={item.key} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-black text-slate-950">{item.label}</h2>
              <span className={item.quality === "OK" ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700" : item.quality === "RESTRICTED" ? "rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600" : "rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700"}>
                {item.quality === "OK" ? "OK" : item.quality === "RESTRICTED" ? "Restrito" : "Insuficiente"}
              </span>
            </div>
            {item.message ? <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs font-bold text-slate-600">{item.message}</p> : null}
            <dl className="mt-3 space-y-2 text-xs text-slate-600">
              <div><dt className="font-black text-slate-800">Formula</dt><dd className="font-semibold">{item.formula}</dd></div>
              <div><dt className="font-black text-slate-800">Fonte</dt><dd className="font-semibold">{item.source}</dd></div>
              <div><dt className="font-black text-slate-800">Periodo</dt><dd className="font-semibold">{item.period}</dd></div>
              <div><dt className="font-black text-slate-800">Criterio</dt><dd className="font-semibold">{item.criteria}</dd></div>
            </dl>
          </article>
        ))}
      </section> : null}

      {activeTab === "base" ? <section className="surface-panel p-4">
        <div className="mb-4 flex items-center gap-2">
          <Settings size={18} className="text-emerald-600" />
          <h2 className="text-lg font-black text-slate-950">Produtos, custos e parametros</h2>
        </div>
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-black text-slate-950">Importar base da grafica</h3>
              <p className="text-xs font-semibold text-slate-500">Abas aceitas neste ciclo: PARAMETROS, MATERIAIS, PROCESSOS e PRODUTOS.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="secondary-action inline-flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
                <Upload size={15} /> Excel
                <input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); }} />
              </label>
              <button className="secondary-action px-3 py-2 text-xs" type="button" disabled={!importFile || saving} onClick={() => importSpreadsheet(false)}>Ler previa</button>
              <button className="primary-action px-3 py-2 text-xs" type="button" disabled={!importPreview || saving} onClick={() => importSpreadsheet(true)}>Confirmar</button>
            </div>
          </div>
          {importFile ? <p className="mt-2 text-xs font-bold text-slate-500">{importFile.name}</p> : null}
          {importPreview ? (
            <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr]">
              <div className="rounded-md bg-slate-50 p-3 text-xs font-bold text-slate-600">
                <p>Total: {importPreview.total || 0}</p>
                <p>Produtos: {importPreview.summary?.product || 0}</p>
                <p>Materiais: {importPreview.summary?.material || 0}</p>
                <p>Processos: {importPreview.summary?.process || 0}</p>
                <p>Parametros: {importPreview.summary?.setting || 0}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(importPreview.items || []).slice(0, 8).map((item: AnyRow, index: number) => (
                  <div key={`${item.type}-${item.key}-${index}`} className="rounded-md border border-slate-100 p-2">
                    <p className="text-xs font-black text-slate-700">{item.name || item.key}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-400">{item.type} | {item.sheet}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="grid gap-4 xl:grid-cols-4">
          <CatalogBox title="Produto" fields={[
            { key: "name", placeholder: "Produto" },
            { key: "category", placeholder: "Categoria", value: "Comunicacao visual" },
            { key: "unit", placeholder: "Unidade", value: "unidade" }
          ]} onSave={(payload) => saveCatalog("product", payload)} />
          <CatalogBox title="Material" fields={[
            { key: "name", placeholder: "Material" },
            { key: "code", placeholder: "Codigo" },
            { key: "unit", placeholder: "Unidade", value: "m2" },
            { key: "initialStock", placeholder: "Saldo inicial" },
            { key: "minStock", placeholder: "Estoque minimo" },
            { key: "location", placeholder: "Localizacao" },
            { key: "currentCost", placeholder: "Custo R$" },
            { key: "wastePercent", placeholder: "Perda %", value: "8" }
          ]} onSave={(payload) => saveCatalog("material", payload)} />
          <CatalogBox title="Processo" fields={[
            { key: "name", placeholder: "Processo" },
            { key: "processType", placeholder: "Tipo", value: "INTERNAL" },
            { key: "unit", placeholder: "Unidade", value: "hora" },
            { key: "cost", placeholder: "Custo R$" }
          ]} onSave={(payload) => saveCatalog("process", payload)} />
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="font-black text-slate-950">Parametros</h3>
            <div className="mt-3 grid gap-2">
              {[
                ["minMarginPercent", "Margem minima %"],
                ["maxDiscountPercent", "Desconto maximo %"],
                ["fixedCostRatePercent", "Custo fixo %"],
                ["taxRatePercent", "Impostos %"],
                ["commissionPercent", "Comissao %"],
                ["postSaleDays", "Pos-venda apos entrega (dias)"]
              ].map(([key, label]) => (
                <label key={key} className="grid grid-cols-[1fr_84px] items-center gap-2 text-xs font-black text-slate-500">
                  {label}
                  <input className={inputClass} defaultValue={settingMap[key] || ""} onBlur={(event) => event.target.value.trim() && saveCatalog("setting", { key, value: event.target.value })} />
                </label>
              ))}
            </div>
          </div>
          {data?.canManageSettings ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="font-black text-slate-950">Arquivos e LGPD</h3>
              <div className="mt-3 grid gap-2">
                <label className="grid grid-cols-[1fr_90px] items-center gap-2 text-xs font-black text-slate-500">
                  Retencao (dias)
                  <input className={inputClass} defaultValue={settingMap.fileRetentionDays || "1825"} onBlur={(event) => saveCatalog("setting", { key: "fileRetentionDays", value: event.target.value || "1825" })} />
                </label>
                <label className="grid gap-1 text-xs font-black text-slate-500">
                  Classificacao
                  <select className={inputClass} defaultValue={settingMap.fileLgpdClassification || "CONFIDENTIAL"} onChange={(event) => saveCatalog("setting", { key: "fileLgpdClassification", value: event.target.value })}>
                    <option value="INTERNAL">Interno</option>
                    <option value="CONFIDENTIAL">Confidencial</option>
                    <option value="SENSITIVE">Sensivel</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-black text-slate-500">
                  Remocao
                  <select className={inputClass} defaultValue={settingMap.fileRemovalPolicy || "SOFT_DELETE_ONLY"} onChange={(event) => saveCatalog("setting", { key: "fileRemovalPolicy", value: event.target.value })}>
                    <option value="SOFT_DELETE_ONLY">Remocao logica</option>
                    <option value="ADMIN_REVIEW">Revisao do admin</option>
                    <option value="LEGAL_HOLD">Retencao legal</option>
                  </select>
                </label>
              </div>
            </div>
          ) : null}
          {data?.canManageSettings ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="font-black text-slate-950">Motivos operacionais</h3>
              <div className="mt-3 grid gap-2">
                {[['lossReasons', 'Motivos de perda'], ['reworkReasons', 'Motivos de retrabalho'], ['productionIssueCategories', 'Categorias de problema']].map(([key, label]) => <label key={key} className="grid gap-1 text-xs font-black text-slate-500"><span>{label}</span><textarea className={inputClass} defaultValue={settingMap[key] || ''} onBlur={(event) => saveCatalog('setting', { key, value: event.target.value })} rows={3} /></label>)}
              </div>
            </div>
          ) : null}
          {data?.canManageSettings ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="font-black text-slate-950">Papeis da equipe</h3>
              <div className="mt-3 grid gap-2">
                {users.length ? users.map((item: AnyRow) => (
                  <label key={item.id} className="grid gap-1 text-xs font-black text-slate-500">
                    <span className="truncate text-slate-700">{item.name || item.username}</span>
                    <select
                      className={inputClass}
                      defaultValue={item.graphicRole || "GRAPHIC_SALES"}
                      onChange={(event) => saveCatalog("setting", { key: `userRole:${item.id}`, value: event.target.value })}
                    >
                      {graphicRoleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                )) : <p className="rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-500">Nenhum usuario do tenant encontrado.</p>}
              </div>
            </div>
          ) : null}
          {data?.canManageSettings ? (
            <CatalogBox title="Etapa do funil" fields={[
              { key: "name", placeholder: "Nome da etapa" },
              { key: "position", placeholder: "Posicao", value: String(stages.length) },
              { key: "kind", placeholder: "Tipo", value: "ACTIVE" }
            ]} onSave={(payload) => saveCatalog("stage", payload)} />
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <CatalogList title="Produtos" type="product" rows={products} value={(item) => `${item.category || item.unit}${item.components?.[0]?.material?.name ? ` | ${item.components[0].material.name}` : ""}`} onSave={saveCatalog} />
          <CatalogList title="Materiais" type="material" rows={materials} value={(item) => `${brl(item.currentCostCents)} | perda ${Number(item.wastePercent || 0).toFixed(1)}%`} onSave={saveCatalog} />
          <CatalogList title="Processos" type="process" rows={processes} value={(item) => `${brl(item.costCents)} | ${item.type}`} onSave={saveCatalog} />
        </div>
      </section> : null}

      {activeTab === "commercial" ? <section className="grid gap-4 xl:grid-cols-[.95fr_1.05fr]">
        <form className="surface-panel p-4" onSubmit={createOpportunity}>
          <div className="mb-4 flex items-center gap-2">
            <Plus size={18} className="text-emerald-600" />
            <h2 className="text-lg font-black text-slate-950">Cadastro rapido</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select className={`${inputClass} sm:col-span-2`} value={opportunityForm.clientId} onChange={(event) => applyClientToOpportunity(event.target.value)}>
              <option value="">Cliente novo ou selecione cliente do CRM</option>
              {clients.map((item: AnyRow) => <option key={item.id} value={item.id}>{item.name}{item.city ? ` - ${item.city}` : ""}</option>)}
            </select>
            <input className={inputClass} placeholder="Cliente" value={opportunityForm.clientName} onChange={(event) => setOpportunityForm({ ...opportunityForm, clientName: event.target.value })} />
            <input className={inputClass} placeholder="Telefone/WhatsApp" value={opportunityForm.phone} onChange={(event) => setOpportunityForm({ ...opportunityForm, phone: event.target.value })} />
            <input className={inputClass} placeholder="Email" value={opportunityForm.email} onChange={(event) => setOpportunityForm({ ...opportunityForm, email: event.target.value })} />
            <input className={inputClass} placeholder="Cidade" value={opportunityForm.city} onChange={(event) => setOpportunityForm({ ...opportunityForm, city: event.target.value })} />
            <input className={inputClass} placeholder="Oportunidade" value={opportunityForm.title} onChange={(event) => setOpportunityForm({ ...opportunityForm, title: event.target.value })} />
            <select className={inputClass} value={opportunityForm.status} onChange={(event) => setOpportunityForm({ ...opportunityForm, status: event.target.value })}>
              {activeStages.map((stage: AnyRow) => <option key={stage.name} value={stage.name}>{stage.name}</option>)}
            </select>
            <select className={inputClass} value={opportunityForm.productInterest} onChange={(event) => setOpportunityForm({ ...opportunityForm, productInterest: event.target.value })}>
              {["Banner", "Adesivo", "Placa ACM", "Chaveiro imobiliario", "Impresso comercial", "Comunicacao visual"].map((item) => <option key={item}>{item}</option>)}
            </select>
            <input className={inputClass} placeholder="Valor estimado" value={opportunityForm.estimatedValue} onChange={(event) => setOpportunityForm({ ...opportunityForm, estimatedValue: event.target.value })} />
            <input className={inputClass} type="date" value={opportunityForm.nextFollowUp} onChange={(event) => setOpportunityForm({ ...opportunityForm, nextFollowUp: event.target.value })} />
            <input className={`${inputClass} sm:col-span-2`} placeholder="Proximo passo" value={opportunityForm.nextAction} onChange={(event) => setOpportunityForm({ ...opportunityForm, nextAction: event.target.value })} />
          </div>
          <button className="primary-action mt-4 inline-flex w-full items-center justify-center gap-2 py-3" disabled={saving}>
            <Plus size={16} /> Criar oportunidade
          </button>
        </form>

        <form className="surface-panel p-4" onSubmit={createQuote}>
          <div className="mb-4 flex items-center gap-2">
            <FileText size={18} className="text-violet-600" />
            <h2 className="text-lg font-black text-slate-950">Orcamento com custo</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select className={`${inputClass} sm:col-span-3`} value={quoteForm.clientId} onChange={(event) => setQuoteForm({ ...quoteForm, clientId: event.target.value })}>
              <option value="">Cliente do CRM para orcamento direto</option>
              {clients.map((item: AnyRow) => <option key={item.id} value={item.id}>{item.name}{item.phone ? ` - ${item.phone}` : ""}</option>)}
            </select>
            <select className={`${inputClass} sm:col-span-2`} value={quoteForm.opportunityId} onChange={(event) => {
              const selected = openOpportunities.find((item: AnyRow) => item.id === event.target.value);
              setQuoteForm({ ...quoteForm, opportunityId: event.target.value, clientId: selected?.clientId || "", description: selected?.productInterest || selected?.title || quoteForm.description });
            }}>
              <option value="">Selecione oportunidade</option>
              {openOpportunities.map((item: AnyRow) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <input className={inputClass} type="date" value={quoteForm.validUntil} onChange={(event) => setQuoteForm({ ...quoteForm, validUntil: event.target.value })} />
            <input className={`${inputClass} sm:col-span-3`} placeholder="Descricao do item" value={quoteForm.description} onChange={(event) => setQuoteForm({ ...quoteForm, description: event.target.value })} />
            <select className={`${inputClass} sm:col-span-3`} value={quoteForm.productId} onChange={(event) => {
              applyProductToQuote(event.target.value);
            }}>
              <option value="">Produto cadastrado da planilha</option>
              {products.map((item: AnyRow) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <input className={inputClass} placeholder="Qtd" value={quoteForm.quantity} onChange={(event) => setQuoteForm({ ...quoteForm, quantity: event.target.value })} />
            <input className={inputClass} placeholder="Largura" value={quoteForm.width} onChange={(event) => setQuoteForm({ ...quoteForm, width: event.target.value })} />
            <input className={inputClass} placeholder="Altura" value={quoteForm.height} onChange={(event) => setQuoteForm({ ...quoteForm, height: event.target.value })} />
            <input className={inputClass} placeholder="Material R$" value={quoteForm.materialCost} onChange={(event) => setQuoteForm({ ...quoteForm, materialCost: event.target.value })} />
            <input className={inputClass} placeholder="Processo R$" value={quoteForm.processCost} onChange={(event) => setQuoteForm({ ...quoteForm, processCost: event.target.value })} />
            <input className={inputClass} placeholder="Terceiros R$" value={quoteForm.outsourcedCost} onChange={(event) => setQuoteForm({ ...quoteForm, outsourcedCost: event.target.value })} />
            <input className={inputClass} placeholder="Mao de obra R$" value={quoteForm.laborCost} onChange={(event) => setQuoteForm({ ...quoteForm, laborCost: event.target.value })} />
            <input className={inputClass} placeholder="Frete R$" value={quoteForm.freight} onChange={(event) => setQuoteForm({ ...quoteForm, freight: event.target.value })} />
            <input className={inputClass} placeholder="Instalacao R$" value={quoteForm.installation} onChange={(event) => setQuoteForm({ ...quoteForm, installation: event.target.value })} />
            <input className={inputClass} placeholder="Preco negociado R$" value={quoteForm.negotiatedPrice} onChange={(event) => setQuoteForm({ ...quoteForm, negotiatedPrice: event.target.value })} />
            <input className={inputClass} placeholder="Desconto R$" value={quoteForm.discount} onChange={(event) => setQuoteForm({ ...quoteForm, discount: event.target.value })} />
            <input className={inputClass} placeholder="Urgencia R$" value={quoteForm.urgency} onChange={(event) => setQuoteForm({ ...quoteForm, urgency: event.target.value })} />
            <input className={inputClass} placeholder="Prazo em dias" value={quoteForm.deadlineDays} onChange={(event) => setQuoteForm({ ...quoteForm, deadlineDays: event.target.value })} />
            <input className={`${inputClass} sm:col-span-2`} placeholder="Condicao de pagamento" value={quoteForm.paymentTerms} onChange={(event) => setQuoteForm({ ...quoteForm, paymentTerms: event.target.value })} />
            <input className={`${inputClass} sm:col-span-3`} placeholder="Observacoes para o cliente" value={quoteForm.notes} onChange={(event) => setQuoteForm({ ...quoteForm, notes: event.target.value })} />
          </div>
          {extraQuoteItems.map((item, index) => <div key={index} className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
            <div className="flex items-center justify-between sm:col-span-3"><p className="text-xs font-black text-slate-700">Item adicional {index + 2}</p><button className="icon-action" type="button" title="Remover item" onClick={() => setExtraQuoteItems((items) => items.filter((_, current) => current !== index))}><Trash2 size={15} /></button></div>
            <select className={`${inputClass} sm:col-span-3`} value={item.productId} onChange={(event) => applyProductToExtraQuote(index, event.target.value)}><option value="">Produto cadastrado</option>{products.map((product: AnyRow) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
            <input className={`${inputClass} sm:col-span-3`} required placeholder="Descricao do item" value={item.description} onChange={(event) => setExtraQuoteItems((items) => items.map((current, position) => position === index ? { ...current, description: event.target.value } : current))} />
            <input className={inputClass} required placeholder="Qtd" value={item.quantity} onChange={(event) => setExtraQuoteItems((items) => items.map((current, position) => position === index ? { ...current, quantity: event.target.value } : current))} />
            <input className={inputClass} placeholder="Preco negociado R$" value={item.negotiatedPrice} onChange={(event) => setExtraQuoteItems((items) => items.map((current, position) => position === index ? { ...current, negotiatedPrice: event.target.value } : current))} />
            <input className={inputClass} placeholder="Prazo em dias" value={item.deadlineDays} onChange={(event) => setExtraQuoteItems((items) => items.map((current, position) => position === index ? { ...current, deadlineDays: event.target.value } : current))} />
          </div>)}
          <button className="secondary-action mt-3 inline-flex w-full items-center justify-center gap-2 py-2 text-sm" type="button" onClick={() => setExtraQuoteItems((items) => [...items, { ...quoteInitial, validUntil: quoteForm.validUntil, paymentTerms: quoteForm.paymentTerms }])}><Plus size={15} />Adicionar item ao orcamento</button>
          <button className="primary-action mt-4 inline-flex w-full items-center justify-center gap-2 py-3" disabled={saving}>
            <FileText size={16} /> Gerar orcamento
          </button>
        </form>
      </section> : null}

      {activeTab === "commercial" ? <section className="surface-panel p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-black text-slate-950">Funil da grafica</h2>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{openOpportunities.length} abertas</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {pipelineStages.map((stage: AnyRow) => (
            <div key={stage.name} className="w-64 shrink-0 rounded-lg bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-black text-slate-800">{stage.name}</h3>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-600">{stage.items.length}</span>
              </div>
              <div className="space-y-2">
                {stage.items.slice(0, 6).map((item: AnyRow) => (
                  <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-sm font-black text-slate-900">{item.title}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.nextAction || "Sem proximo passo"} | {day(item.nextFollowUp)}</p>
                    <select className={`${inputClass} mt-2`} defaultValue={item.status} onChange={(event) => moveOpportunityStage(item, event.target.value)}>
                      {activeStages.map((option: AnyRow) => <option key={option.name} value={option.name}>{option.name}</option>)}
                    </select>
                  </article>
                ))}
                {!stage.items.length ? <p className="rounded-lg bg-white p-3 text-xs font-bold text-slate-500">Sem oportunidades.</p> : null}
              </div>
            </div>
          ))}
        </div>
      </section> : null}

      {activeTab === "commercial" ? <section className="grid gap-4 xl:grid-cols-2">
        <div className="surface-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Search size={17} />
            <input className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" placeholder="Buscar cliente, telefone, orcamento ou pedido" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          {search.trim() ? <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2"><p className="px-1 pb-2 text-[10px] font-black uppercase text-slate-500">Resultados da base</p>{globalSearchResults.length ? <div className="space-y-1">{globalSearchResults.map((item) => item.href ? <a key={item.key} href={item.href} className="block rounded-md bg-white px-3 py-2 hover:bg-emerald-50"><p className="text-[10px] font-black uppercase text-emerald-700">{item.label}</p><p className="text-sm font-black text-slate-800">{item.title}</p><p className="text-xs font-semibold text-slate-500">{item.detail}</p></a> : <div key={item.key} className="rounded-md bg-white px-3 py-2"><p className="text-[10px] font-black uppercase text-emerald-700">{item.label}</p><p className="text-sm font-black text-slate-800">{item.title}</p><p className="text-xs font-semibold text-slate-500">{item.detail}</p></div>)}</div> : <p className="rounded-md bg-white p-3 text-xs font-bold text-slate-500">Nenhum registro encontrado nesta base.</p>}</div> : null}
          <div className="space-y-2">
            {filteredOpportunities.length ? filteredOpportunities.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-slate-950">{item.title}</h3>
                    <p className="text-xs font-semibold text-slate-500">{item.productInterest || "Produto a definir"} | {item.source || "Origem nao informada"}</p>
                  </div>
                  {item.qualityAlert ? <AlertTriangle className="text-amber-500" size={18} /> : null}
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.nextAction || "Sem proximo passo"} em {day(item.nextFollowUp)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(item.tasks || []).slice(0, 2).map((task: AnyRow) => (
                    <span key={task.id} className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">{task.title} | {day(task.dueDate)}</span>
                  ))}
                </div>
                {(item.activities || []).length ? <p className="mt-2 text-xs font-semibold text-slate-500">Ultimo contato: {item.activities[0].result || item.activities[0].note || "registrado"}</p> : null}
                {item.status !== "LOST" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <button className="secondary-action px-3 py-2 text-xs" type="button" onClick={() => recordOpportunityContact(item)}>Contato</button>
                    <button className="secondary-action px-3 py-2 text-xs" type="button" onClick={() => rescheduleOpportunity(item)}>Reagendar</button>
                    <button className="secondary-action px-3 py-2 text-xs text-rose-700" type="button" onClick={() => loseOpportunity(item)}>Perder</button>
                  </div>
                ) : <p className="mt-2 rounded-md bg-rose-50 p-2 text-xs font-bold text-rose-700">Perdida: {item.lossReason || "motivo nao informado"}</p>}
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhuma oportunidade encontrada.</p>}
          </div>
        </div>

        <div className="surface-panel p-4">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList size={18} className="text-violet-600" />
            <h2 className="text-lg font-black text-slate-950">Orcamentos</h2>
          </div>
          <div className="space-y-2">
            {draftQuotes.length ? draftQuotes.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-slate-950">#{item.number} - {brl(item.totalPriceCents)}</h3>
                    <p className="text-xs font-semibold text-slate-500">Margem {Number(item.marginPercent || 0).toFixed(1)}% | validade {day(item.validUntil)}</p>
                  </div>
                  {item.approvalRequired ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">Aprovar</span> : null}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">{item.approvalReason || "Dentro dos parametros atuais."}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {item.shareToken ? (
                    <a className="secondary-action inline-flex items-center justify-center gap-2 py-2" href={`/api/gestao-grafica/public-quotes/${item.shareToken}/pdf`} target="_blank">
                      <FileText size={16} /> PDF cliente
                    </a>
                  ) : null}
                  {item.shareToken && item.client?.phone ? (
                    <a className="secondary-action inline-flex items-center justify-center gap-2 py-2" href={`https://wa.me/${String(item.client.phone).replace(/\D/g, "")}?text=${encodeURIComponent(`Ola, segue o orcamento #${item.number}: ${window.location.origin}/api/gestao-grafica/public-quotes/${item.shareToken}/pdf`)}`} target="_blank" rel="noreferrer">
                      Enviar WhatsApp
                    </a>
                  ) : null}
                  {item.approvalRequired ? (
                    <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => quoteAction(item.id, "approve-commercial")} type="button">
                      <CheckCircle2 size={16} /> Aprovar excecao
                    </button>
                  ) : null}
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => approveQuote(item.id)} type="button">
                    <CheckCircle2 size={16} /> Gerar pedido
                  </button>
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => quoteAction(item.id, "send")} type="button">Enviar</button>
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => quoteAction(item.id, "duplicate")} type="button">Duplicar</button>
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => quoteAction(item.id, "refuse")} type="button">Recusar</button>
                  <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" onClick={() => quoteAction(item.id, "cancel")} type="button">Cancelar</button>
                </div>
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Sem orcamentos pendentes.</p>}
          </div>
        </div>
      </section> : null}

      {workspace === "operations" && activeTab === "production" ? <section className="surface-panel p-4">
        <div className="mb-4"><p className="eyebrow">Jorge / Operacao</p><h2 className="text-lg font-black text-slate-950">O que preciso criar, produzir ou entregar hoje?</h2></div>
        <div className="grid gap-3 xl:grid-cols-6">
          {["Entrada", "Criacao", "Producao", "Finalizacao", "Expedicao", "Concluido"].map((lane) => {
            const items = productionRows.filter((item: AnyRow) => operationLane(item, deliveryRows) === lane);
            return <div key={lane} className="min-h-48 rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-black text-slate-700">{lane}</h3><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500">{items.length}</span></div><div className="space-y-2">{items.map((item: AnyRow) => { const delivery = deliveryRows.find((row: AnyRow) => row.orderId === item.orderId); return <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-2"><p className="text-xs font-black text-slate-900">Pedido #{item.order?.number || "-"}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{item.order?.quote?.productInterest || "Produto"} | prazo {day(item.promisedAt)}</p>{lane === "Entrada" ? <button className="secondary-action mt-2 w-full py-1.5 text-[10px]" type="button" onClick={() => startCreation(item)}>Iniciar criacao</button> : null}{lane === "Criacao" && item.status === "RELEASED" ? <button className="secondary-action mt-2 w-full py-1.5 text-[10px]" type="button" onClick={() => updateProduction(item.id, "IN_PROGRESS")}>Iniciar producao</button> : null}{lane === "Producao" ? <button className="secondary-action mt-2 w-full py-1.5 text-[10px]" type="button" onClick={() => updateProduction(item.id, "COMPLETED")}>Concluir producao</button> : null}{lane === "Finalizacao" && delivery ? <button className="secondary-action mt-2 w-full py-1.5 text-[10px]" type="button" onClick={() => updateDelivery(delivery.id, "SCHEDULED")}>Liberar expedicao</button> : null}{lane === "Expedicao" && delivery ? <button className="secondary-action mt-2 w-full py-1.5 text-[10px]" type="button" onClick={() => updateDelivery(delivery.id, "DELIVERED")}>Marcar entregue</button> : null}</article>; })}{!items.length ? <p className="text-[10px] font-bold text-slate-400">Sem pedidos.</p> : null}</div></div>;
          })}
        </div>
      </section> : null}

      {activeTab === "production" ? <section className="surface-panel p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Factory size={18} className="text-emerald-600" />
            <h2 className="text-lg font-black text-slate-950">Producao</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{productionRows.length} ordem(ns)</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {productionRows.length ? productionRows.map((item: AnyRow) => (
            <ProductionCard key={item.id} item={item} materials={materials} issueCategories={String(operationalSettings.productionIssueCategories || "Falta de material, Informacao incorreta, Arte, Equipamento, Defeito, Alteracao do cliente, Outro").split(",").map((category: string) => category.trim()).filter(Boolean)} onStatus={updateProduction} onAction={updateProductionAction} onUpload={uploadGraphicAttachment} onRemoveAttachment={removeGraphicAttachment} />
          )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhuma ordem de producao.</p>}
        </div>
      </section> : null}

      {activeTab === "finance" ? <section className="surface-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <Banknote size={18} className="text-emerald-600" />
          <h2 className="text-lg font-black text-slate-950">Venda, faturamento e recebimento</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Valor vendido" value={metrics.soldCents === null ? "Restrito" : brl(metrics.soldCents || 0)} />
          <MetricCard label="Valor faturado" value={metrics.billedCents === null ? "Restrito" : brl(metrics.billedCents || 0)} />
          <MetricCard label="Valor recebido" value={metrics.receivedCents === null ? "Restrito" : brl(metrics.receivedCents || 0)} tone="good" />
          <MetricCard label="Margem media" value={metrics.averageMarginPercent === null ? "Restrito" : `${metrics.averageMarginPercent || 0}%`} />
          <MetricCard label="Descontos" value={metrics.discountsCents === null ? "Restrito" : brl(metrics.discountsCents || 0)} tone={metrics.discountsCents ? "warn" : "default"} />
          <MetricCard label="Vencidos" value={metrics.overdueReceivablesCents === null ? "Restrito" : brl(metrics.overdueReceivablesCents || 0)} tone={metrics.overdueReceivablesCents ? "danger" : "good"} />
        </div>
      </section> : null}

      {activeTab === "delivery" ? <section className="surface-panel p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PackageCheck size={18} className="text-emerald-600" />
            <h2 className="text-lg font-black text-slate-950">Entregas</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{deliveryRows.length} entrega(s)</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {deliveryRows.length ? deliveryRows.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-slate-950">Pedido #{item.order?.number || "-"}</h3>
                    <p className="text-xs font-semibold text-slate-500">{item.method} | {item.status} | prevista {day(item.expectedAt)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Responsavel: {item.responsibleName || "A definir"} | aceite {item.acceptanceStatus || "pendente"}</p>
                  </div>
                  {item.proofAttachmentId ? <CheckCircle2 className="shrink-0 text-emerald-600" size={18} /> : <AlertTriangle className="shrink-0 text-amber-500" size={18} />}
                </div>
                {(item.attachments || []).length ? (
                  <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-2">
                    {(item.attachments || []).slice(0, 2).map((file: AnyRow) => (
                      <a key={file.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2 text-xs font-bold text-slate-600" href={file.url || `/api/attachments/${file.attachmentId}`} target="_blank" rel="noreferrer">
                        <span className="truncate">{file.attachment?.originalName || "Comprovante"}</span>
                        <Download className="h-4 w-4 shrink-0" />
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="secondary-action py-2 text-xs" type="button" onClick={() => updateDelivery(item.id, "SCHEDULED")}>Agendar</button>
                  <button className="primary-action py-2 text-xs" type="button" onClick={() => updateDelivery(item.id, "DELIVERED")}>Entregue</button>
                  <label className="secondary-action cursor-pointer py-2 text-center text-xs">
                    Comprovante
                    <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadDeliveryProof(file, item.id);
                      event.currentTarget.value = "";
                    }} />
                  </label>
                  <button className="secondary-action py-2 text-xs" type="button" onClick={() => updateDelivery(item.id, "ACCEPTED")}>Aceite</button>
                  <button className="secondary-action py-2 text-xs" type="button" onClick={() => updateDelivery(item.id, "COMPLAINT")}>Reclamacao</button>
                </div>
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhuma entrega pendente.</p>}
        </div>
      </section> : null}

      {activeTab === "finance" ? <section className="surface-panel p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Banknote size={18} className="text-emerald-600" />
            <h2 className="text-lg font-black text-slate-950">Recebimentos</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{receivableRows.length} parcela(s)</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {receivableRows.length ? receivableRows.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="font-black text-slate-950">{brl(item.amountCents - item.receivedCents)} pendente</h3>
                <p className="text-xs font-semibold text-slate-500">{labelForStatus(item.status)} | vence {day(item.dueDate)} | {item.notes || "Parcela"}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Recebido {brl(item.receivedCents)} de {brl(item.amountCents)}</p>
                {item.status !== "PAID" ? (
                  <button className="primary-action mt-3 inline-flex w-full items-center justify-center py-2 text-xs" type="button" onClick={() => registerPayment(item.id)}>Registrar recebimento</button>
                ) : null}
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum recebimento grafico.</p>}
        </div>
      </section> : null}

      {activeTab === "postSale" ? <section className="surface-panel p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Star size={18} className="text-amber-500" />
            <h2 className="text-lg font-black text-slate-950">Pos-venda</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{postSaleRows.length} contato(s)</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {postSaleRows.length ? postSaleRows.map((item: AnyRow) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="font-black text-slate-950">Pedido #{item.order?.number || "-"}</h3>
                <p className="text-xs font-semibold text-slate-500">{labelForStatus(item.status)} | satisfacao {item.satisfaction || "-"}</p>
                <p className="mt-1 text-sm text-slate-600">{item.note || "Sem observacao."}</p>
                {item.newOpportunityId ? <p className="mt-2 rounded-md bg-emerald-50 p-2 text-xs font-bold text-emerald-700">Nova oportunidade criada.</p> : null}
                {item.status === "OPEN" ? (
                  <button className="secondary-action mt-3 inline-flex w-full items-center justify-center py-2 text-xs" type="button" onClick={() => closePostSale(item.id)}>Registrar contato</button>
                ) : null}
              </article>
            )) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum pos-venda aberto.</p>}
        </div>
      </section> : null}
    </div>
  );
}

function CatalogBox({ title, fields, onSave }: { title: string; fields: { key: string; placeholder: string; value?: string }[]; onSave: (payload: AnyRow) => Promise<boolean> }) {
  const [form, setForm] = useState<AnyRow>(() => Object.fromEntries(fields.map((field) => [field.key, field.value || ""])));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSave(form);
    if (saved) setForm(Object.fromEntries(fields.map((field) => [field.key, field.value || ""])));
  }

  return (
    <form className="rounded-lg border border-slate-200 bg-white p-3" onSubmit={submit}>
      <h3 className="font-black text-slate-950">{title}</h3>
      <div className="mt-3 grid gap-2">
        {fields.map((field) => (
          <input
            key={field.key}
            className={inputClass}
            placeholder={field.placeholder}
            value={form[field.key] || ""}
            onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
          />
        ))}
      </div>
      <button className="primary-action mt-3 inline-flex w-full items-center justify-center gap-2 py-2 text-xs" type="submit">
        <Plus size={14} /> Salvar
      </button>
    </form>
  );
}

function CatalogList({ title, type, rows, value, onSave }: { title: string; type: string; rows: AnyRow[]; value: (item: AnyRow) => string; onSave: (type: string, payload: AnyRow) => Promise<boolean> }) {
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<AnyRow>({});

  function startEdit(item: AnyRow) {
    setEditingId(item.id);
    setDraft({
      id: item.id,
      name: item.name || "",
      category: item.category || "",
      unit: item.unit || "",
      currentCost: item.currentCostCents !== undefined ? String(item.currentCostCents / 100) : "",
      code: item.code || "",
      minStock: item.minStock !== undefined ? String(item.minStock) : "",
      location: item.location || "",
      cost: item.costCents !== undefined ? String(item.costCents / 100) : "",
      wastePercent: item.wastePercent !== undefined ? String(item.wastePercent) : "",
      processType: item.type || "INTERNAL",
      description: item.description || ""
    });
  }

  async function saveEdit() {
    const saved = await onSave(type, { ...draft, id: editingId });
    if (saved) {
      setEditingId("");
      setDraft({});
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-black text-slate-950">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{rows.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.slice(0, 18).map((item) => (
          <div key={item.id} className="rounded-md bg-slate-50 px-3 py-2">
            {editingId === item.id ? (
              <div className="grid gap-2">
                <input className={inputClass} value={draft.name || ""} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                {type === "product" ? <input className={inputClass} placeholder="Categoria" value={draft.category || ""} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /> : null}
                <input className={inputClass} placeholder="Unidade" value={draft.unit || ""} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
                {type === "material" ? <input className={inputClass} placeholder="Custo R$" value={draft.currentCost || ""} onChange={(event) => setDraft({ ...draft, currentCost: event.target.value })} /> : null}
                {type === "material" ? <input className={inputClass} placeholder="Codigo" value={draft.code || ""} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /> : null}
                {type === "material" ? <input className={inputClass} placeholder="Estoque minimo" value={draft.minStock || ""} onChange={(event) => setDraft({ ...draft, minStock: event.target.value })} /> : null}
                {type === "material" ? <input className={inputClass} placeholder="Localizacao" value={draft.location || ""} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /> : null}
                {type === "material" ? <input className={inputClass} placeholder="Perda %" value={draft.wastePercent || ""} onChange={(event) => setDraft({ ...draft, wastePercent: event.target.value })} /> : null}
                {type === "process" ? <input className={inputClass} placeholder="Custo R$" value={draft.cost || ""} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} /> : null}
                <div className="grid grid-cols-2 gap-2">
                  <button className="primary-action py-2 text-xs" type="button" onClick={saveEdit}>Salvar</button>
                  <button className="secondary-action py-2 text-xs" type="button" onClick={() => setEditingId("")}>Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-black text-slate-800">{item.name || item.key}</p>
                  <button className="rounded-md bg-white px-2 py-1 text-[10px] font-black text-slate-600" type="button" onClick={() => startEdit(item)}>Editar</button>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">{value(item)}</p>
              </>
            )}
          </div>
        ))}
        {!rows.length ? <p className="rounded-md bg-slate-50 p-3 text-xs font-bold text-slate-500">Nenhum cadastro ainda.</p> : null}
      </div>
    </div>
  );
}

function GroupBox({ title, rows, money = false }: { title: string; rows: AnyRow[]; money?: boolean }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-black text-slate-950">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.slice(0, 5).map((row: AnyRow) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs font-bold">
            <span className="truncate text-slate-600">{row.label}</span>
            <span className="shrink-0 text-slate-950">{money ? `${row.count} | ${brl(row.valueCents || 0)}` : row.count}</span>
          </div>
        )) : <p className="rounded-md bg-slate-50 p-2 text-xs font-bold text-slate-500">Dados insuficientes.</p>}
      </div>
    </article>
  );
}

function parseChecklist(value: unknown) {
  if (!value) return {} as Record<string, boolean>;
  if (typeof value === "object") return value as Record<string, boolean>;
  try {
    return JSON.parse(String(value)) as Record<string, boolean>;
  } catch {
    return {} as Record<string, boolean>;
  }
}

function ProductionCard({ item, materials, issueCategories, onStatus, onAction, onUpload, onRemoveAttachment }: { item: AnyRow; materials: AnyRow[]; issueCategories: string[]; onStatus: (id: string, status: string, extra?: AnyRow) => Promise<void>; onAction: (id: string, payload: AnyRow, success?: string) => Promise<boolean>; onUpload: (file: File, linkedModel: string, linkedId: string, purpose?: string) => Promise<boolean>; onRemoveAttachment: (id: string) => Promise<boolean> }) {
  const checklist = parseChecklist(item.checklist);
  const checklistItems = [
    ["arte", "Arte"],
    ["medidas", "Medidas"],
    ["material", "Material"],
    ["prazo", "Prazo"],
    ["arquivos", "Arquivos"]
  ];
  const missing = checklistItems.filter(([key]) => !checklist[key]).length;

  async function toggleChecklist(key: string, value: boolean) {
    await onAction(item.id, { action: "checklist", checklist: { [key]: value } }, "Checklist atualizado.");
  }

  async function updateStep(step: AnyRow, stepStatus: string) {
    const minutes = stepStatus === "COMPLETED" ? prompt("Tempo realizado em minutos", String(step.actualMinutes || "")) || "" : "";
    await onAction(item.id, { action: "step", stepId: step.id, stepStatus, minutes }, "Etapa atualizada.");
  }

  async function registerConsumption() {
    const description = prompt("Material consumido", materials[0]?.name || "");
    if (!description) return;
    const quantity = prompt("Quantidade consumida", "1");
    if (!quantity) return;
    const wasteQuantity = prompt("Perda registrada", "0") || "0";
    const selected = materials.find((material) => material.name.toLowerCase() === description.toLowerCase());
    await onAction(item.id, { action: "consumption", materialId: selected?.id, description, quantity, wasteQuantity }, "Consumo registrado.");
  }

  async function registerRework() {
    const reason = prompt("Motivo do retrabalho");
    if (!reason) return;
    const impact = prompt("Impacto do retrabalho", "Prazo/custo/qualidade afetado") || "";
    const correctiveAction = prompt("Acao corretiva", "Corrigir e revisar antes da entrega") || "";
    await onAction(item.id, { action: "rework", reason, impact, correctiveAction }, "Retrabalho registrado.");
  }

  async function registerIssue() {
    const category = prompt(`Categoria do problema: ${issueCategories.join(", ")}`, issueCategories[0] || "Outro");
    if (!category) return;
    const note = prompt("Descreva o problema e a acao necessaria") || "";
    if (!note) return;
    await onAction(item.id, { action: "issue", category, note }, "Ocorrencia registrada no historico.");
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-black text-slate-950">Pedido #{item.order?.number || "-"}</h3>
          <p className="text-xs font-semibold text-slate-500">{labelForStatus(item.status)} | promessa {day(item.promisedAt)} | {(item.attachments || []).length} arquivo(s)</p>
        </div>
        <span className={missing ? "rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700" : "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700"}>
          {missing ? `${missing} pend.` : "Checklist ok"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {checklistItems.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={Boolean(checklist[key])} onChange={(event) => toggleChecklist(key, event.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      {(item.attachments || []).length ? (
        <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-2">
          {(item.attachments || []).map((file: AnyRow) => (
            <div key={file.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-black text-slate-700">{file.attachment?.originalName || "Arquivo da producao"}</p>
                <p className="font-semibold text-slate-400">{file.purpose || "OTHER"} | {Math.ceil((file.attachment?.sizeBytes || 0) / 1024)} KB</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a className="secondary-action grid h-8 w-8 place-items-center p-0" href={file.url || `/api/attachments/${file.attachmentId}`} target="_blank" rel="noreferrer" title="Abrir arquivo">
                  <Download className="h-4 w-4" />
                </a>
                <button className="secondary-action grid h-8 w-8 place-items-center p-0 text-rose-600" onClick={() => onRemoveAttachment(file.id)} type="button" title="Remover da ficha">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {(item.steps || []).slice(0, 4).map((step: AnyRow) => (
          <div key={step.id} className="rounded-md border border-slate-100 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black text-slate-700">{step.name}</p>
              <span className="text-[10px] font-black text-slate-400">{labelForStatus(step.status)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="secondary-action py-2 text-xs" onClick={() => updateStep(step, "IN_PROGRESS")} type="button">Iniciar etapa</button>
              <button className="secondary-action py-2 text-xs" onClick={() => updateStep(step, "COMPLETED")} type="button">Concluir etapa</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="secondary-action py-2 text-xs" onClick={() => onStatus(item.id, "RELEASED")} type="button">Liberar</button>
        <button className="secondary-action py-2 text-xs" onClick={() => onStatus(item.id, "IN_PROGRESS")} type="button">Iniciar</button>
        <button className="secondary-action py-2 text-xs" onClick={registerConsumption} type="button">Consumo</button>
        <button className="secondary-action py-2 text-xs" onClick={registerIssue} type="button">Problema</button>
        <button className="secondary-action py-2 text-xs" onClick={registerRework} type="button">Retrabalho</button>
        <label className="secondary-action cursor-pointer py-2 text-center text-xs">
          Anexar
          <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUpload(file, "production", item.id, "PHOTO");
            event.currentTarget.value = "";
          }} />
        </label>
        <button className="secondary-action py-2 text-xs" onClick={() => onStatus(item.id, "BLOCKED")} type="button">Bloquear</button>
        <button className="primary-action py-2 text-xs" onClick={() => onStatus(item.id, "COMPLETED")} type="button">Concluir</button>
      </div>
    </article>
  );
}
