import { formatDate, money } from "@/lib/format";
import type { GraphicPermission, GraphicRole } from "@/lib/graphic";
import { hasGraphicPermission } from "@/lib/graphic";

export const graphicReportConfigs = {
  opportunities: {
    title: "Oportunidades da grafica",
    filename: "grafica-oportunidades",
    permission: "report:view",
    columns: [
      ["createdAt", "Criado em"],
      ["title", "Oportunidade"],
      ["clientName", "Cliente"],
      ["source", "Origem"],
      ["productInterest", "Produto"],
      ["estimatedValue", "Valor estimado"],
      ["nextAction", "Proximo passo"],
      ["nextFollowUp", "Retorno"],
      ["status", "Status"]
    ]
  },
  quotes: {
    title: "Orcamentos da grafica",
    filename: "grafica-orcamentos",
    permission: "report:view",
    columns: [
      ["number", "Numero"],
      ["createdAt", "Criado em"],
      ["clientName", "Cliente"],
      ["status", "Status"],
      ["validUntil", "Validade"],
      ["totalPrice", "Preco"],
      ["marginPercent", "Margem"],
      ["approvalRequired", "Exige aprovacao"]
    ]
  },
  orders: {
    title: "Pedidos da grafica",
    filename: "grafica-pedidos",
    permission: "report:view",
    columns: [
      ["number", "Numero"],
      ["createdAt", "Criado em"],
      ["clientName", "Cliente"],
      ["status", "Status"],
      ["soldValue", "Valor vendido"],
      ["billedValue", "Valor faturado"],
      ["receivedValue", "Valor recebido"]
    ]
  },
  production: {
    title: "Producao da grafica",
    filename: "grafica-producao",
    permission: "report:view",
    columns: [
      ["orderNumber", "Pedido"],
      ["createdAt", "Criado em"],
      ["promisedAt", "Prazo prometido"],
      ["status", "Status"],
      ["priority", "Prioridade"],
      ["stepsTotal", "Etapas"],
      ["stepsCompleted", "Etapas concluidas"],
      ["reworksOpen", "Retrabalhos abertos"]
    ]
  },
  receivables: {
    title: "Recebimentos da grafica",
    filename: "grafica-recebimentos",
    permission: "receivable:update",
    columns: [
      ["orderNumber", "Pedido"],
      ["dueDate", "Vencimento"],
      ["status", "Status"],
      ["amount", "Valor"],
      ["received", "Recebido"],
      ["pending", "Pendente"]
    ]
  },
  audit: {
    title: "Auditoria da grafica",
    filename: "grafica-auditoria",
    permission: "cost:view",
    columns: [
      ["createdAt", "Data"],
      ["action", "Acao"],
      ["entity", "Entidade"],
      ["entityId", "Registro"],
      ["status", "Status"],
      ["metadata", "Detalhe"]
    ]
  }
} as const;

export type GraphicReportModel = keyof typeof graphicReportConfigs;

const moneyKeys = new Set(["estimatedValue", "totalPrice", "soldValue", "billedValue", "receivedValue", "amount", "received", "pending"]);
const dateKeys = new Set(["createdAt", "updatedAt", "nextFollowUp", "validUntil", "promisedAt", "dueDate"]);

export function isGraphicReportModel(value: string): value is GraphicReportModel {
  return value in graphicReportConfigs;
}

export function canAccessGraphicReport(role: GraphicRole, model: GraphicReportModel) {
  const permission = graphicReportConfigs[model].permission as GraphicPermission;
  return hasGraphicPermission(role, permission);
}

export function csvEscape(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function formatGraphicReportValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  if (moneyKeys.has(key) && typeof value === "number") return money.format(value);
  if (key === "marginPercent" && typeof value === "number") return `${value.toFixed(1)}%`;
  if (dateKeys.has(key)) return formatDate(value as string | Date);
  return String(value);
}

export function buildGraphicCsv(model: GraphicReportModel, rows: Array<Record<string, unknown>>) {
  const columns = graphicReportConfigs[model].columns as readonly (readonly [string, string])[];
  const header = columns.map(([, label]) => csvEscape(label)).join(";");
  const body = rows.map((row) => columns.map(([key]) => csvEscape(formatGraphicReportValue(key, row[key]))).join(";"));
  return `\uFEFF${[header, ...body].join("\n")}`;
}
