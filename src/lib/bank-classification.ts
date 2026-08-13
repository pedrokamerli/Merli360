import { prisma } from "@/lib/prisma";

export type BankClassificationInput = {
  tenantId: string;
  userId?: string | null;
  description: string;
  direction: "IN" | "OUT";
  amountCents?: number;
};

export type BankClassificationResult = {
  category: string;
  paymentMethod: string;
  costCenter?: string | null;
  counterpartyName?: string | null;
  counterpartyDocument?: string | null;
  source: string;
  confidence: number;
  reason: string;
};

export function normalizeText(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDocument(text: string) {
  const cnpj = String(text || "").match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  if (cnpj) return cnpj[0].replace(/\D/g, "");
  const cpf = String(text || "").match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  return cpf ? cpf[0].replace(/\D/g, "") : "";
}

export function extractCounterpartyName(description: string) {
  const text = String(description || "")
    .replace(/\b(pix|pix recebido|pix enviado|ted|doc|transferencia|transf|boleto|pagamento|compra|cartao|credito|debito)\b/gi, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, " ")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, " ")
    .replace(/\b(r\$|agencia|conta|documento|saldo|historico|data|hora)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ").filter((word) => !/^\d+$/.test(word));
  return words.slice(0, 5).join(" ").trim().slice(0, 80);
}

export function learningPattern(description: string, counterpartyName?: string | null, document?: string | null) {
  if (document) return `doc:${document}`;
  const name = normalizeText(counterpartyName || extractCounterpartyName(description));
  if (name.length >= 4) return `name:${name.slice(0, 70)}`;
  return `desc:${normalizeText(description).slice(0, 70)}`;
}

export async function lookupCounterparty(description: string) {
  const document = extractDocument(description);
  if (document.length === 14) {
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${document}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        return {
          name: data.nome_fantasia || data.razao_social || extractCounterpartyName(description),
          document,
          source: "CNPJ consultado na BrasilAPI",
          reason: data.cnae_fiscal_descricao ? `CNAE: ${data.cnae_fiscal_descricao}` : "CNPJ encontrado na movimentacao."
        };
      }
    } catch {
      return { name: extractCounterpartyName(description), document, source: "CNPJ detectado", reason: "Nao foi possivel consultar o CNPJ agora." };
    }
  }
  const name = extractCounterpartyName(description);
  if (!document && name.length >= 4) {
    try {
      const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(`${name} empresa Brasil`)}&format=json&no_html=1&skip_disambig=1`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        const text = [data.Heading, data.AbstractText, data.RelatedTopics?.[0]?.Text].filter(Boolean).join(" ");
        if (text) return { name, document: "", source: "Nome consultado na web", reason: text.slice(0, 180) };
      }
    } catch {
      return { name, document: "", source: "Nome detectado", reason: "Consulta web indisponivel no momento." };
    }
  }
  return { name, document, source: name ? "Nome detectado" : "Sem contraparte identificada", reason: "" };
}

function heuristicClassification(description: string, direction: "IN" | "OUT", counterpartyReason = ""): BankClassificationResult {
  const text = normalizeText(description).toUpperCase();
  let paymentMethod = "";
  if (/\bPIX\b/.test(text)) paymentMethod = "Pix";
  else if (/TED|DOC|TRANSFER|TRANSF/.test(text)) paymentMethod = "Transferencia";
  else if (/BOLETO|TITULO|COD BARRAS|CODIGO DE BARRAS/.test(text)) paymentMethod = "Boleto";
  else if (/CARTAO|CARD|MASTERCARD|VISA|ELO/.test(text)) paymentMethod = /CREDITO/.test(text) ? "Credito" : /DEBITO/.test(text) ? "Debito" : "Cartao";

  const entry = direction === "IN";
  const base = (category: string, confidence = 0.65, reason = "Regra automatica por palavra-chave.") => ({
    category,
    paymentMethod,
    source: "Regra do sistema",
    confidence,
    reason: [reason, counterpartyReason].filter(Boolean).join(" ")
  });

  if (/FACEBK|FACEBOOK|META ADS|META PAY|(^|\s)FB(\s|$)|INSTAGRAM ADS|GOOGLE ADS|TIKTOK ADS/.test(text)) return base("Marketing e anuncios", 0.9);
  if (/CANVA|OPENAI|CHATGPT|CAPCUT|ADOBE|GOOGLE WORKSPACE|DOMINIO|HOSTINGER|HOSTGATOR|LOCAWEB|REGISTROBR|REGISTRO BR|MICROSOFT|APPLE/.test(text)) return base("Ferramentas e sistemas", 0.9);
  if (/MEI|DAS|SIMPLES|DARF|IMPOSTO|INSS|RECEITA FEDERAL|PREFEITURA/.test(text)) return base("Impostos e taxas", 0.85);
  if (/IOF|TARIFA|CESTA|PACOTE SERVICOS|ANUIDADE|JUROS|MULTA|MANUT CONTA/.test(text)) return base("Tarifas bancarias", 0.85);
  if (/UBER|99|FRETE/.test(text)) return base("Transporte e frete", 0.8);
  if (/POSTO|COMBUSTIVEL|GASOLINA|ETANOL|SHELL|IPIRANGA|PETROBRAS/.test(text)) return base("Combustivel", 0.82);
  if (/IFOOD|SUPERMERCADO|RESTAURANTE|PADARIA|LANCHONETE|ALIMENT/.test(text)) return base("Alimentacao", 0.75);
  if (/ENERGIA|ELEKTRO|CPFL|ENEL|CEMIG|COPEL/.test(text)) return base("Energia", 0.8);
  if (/AGUA|SABESP|SANEPAR|DAE/.test(text)) return base("Agua", 0.8);
  if (/INTERNET|VIVO|CLARO|TIM|OI|ALGAR|TELEFONE|CELULAR/.test(text)) return base("Internet e telefone", 0.78);
  if (/PIX|TED|DOC|TRANSFER|TRANSF/.test(text)) return base(entry ? "Entrada a conferir" : "Saida a conferir", 0.55, "Forma de pagamento detectada, categoria precisa de revisao.");
  return base(entry ? "Entrada a conferir" : "A conferir", 0.4, "Sem regra especifica. Precisa revisar.");
}

export async function classifyBankTransaction(input: BankClassificationInput): Promise<BankClassificationResult> {
  const counterparty = await lookupCounterparty(input.description);
  const pattern = learningPattern(input.description, counterparty.name, counterparty.document);
  const rules = await prisma.aiLearningRule.findMany({
    where: {
      tenantId: input.tenantId,
      OR: [
        { userId: input.userId || null },
        { userId: null }
      ]
    },
    orderBy: [{ correctionCount: "desc" }, { updatedAt: "desc" }],
    take: 250
  });
  const normalizedDescription = normalizeText(input.description);
  const learned = rules.find((rule) => {
    if (rule.direction && rule.direction !== input.direction) return false;
    if (rule.counterpartyDocument && counterparty.document && rule.counterpartyDocument === counterparty.document) return true;
    const rulePattern = normalizeText(rule.pattern.replace(/^(name|desc|doc):/, ""));
    return rulePattern.length >= 4 && normalizedDescription.includes(rulePattern);
  });
  if (learned) {
    await prisma.aiLearningRule.update({ where: { id: learned.id }, data: { lastMatchedAt: new Date() } }).catch(() => null);
    return {
      category: learned.category,
      paymentMethod: learned.paymentMethod || "",
      costCenter: learned.costCenter,
      counterpartyName: learned.counterpartyName || counterparty.name,
      counterpartyDocument: learned.counterpartyDocument || counterparty.document,
      source: "Aprendizado do usuario",
      confidence: Math.max(Number(learned.confidence || 0.9), 0.9),
      reason: `Aprendido anteriormente para ${learned.counterpartyName || learned.pattern}.`
    };
  }

  const rule = heuristicClassification(input.description, input.direction, counterparty.reason);
  return {
    ...rule,
    counterpartyName: counterparty.name,
    counterpartyDocument: counterparty.document,
    source: counterparty.source !== "Sem contraparte identificada" && rule.confidence < 0.75 ? `${rule.source} + ${counterparty.source}` : rule.source
  };
}

export async function saveBankClassificationLearning(input: {
  tenantId: string;
  userId?: string | null;
  description: string;
  direction: "IN" | "OUT";
  category: string;
  paymentMethod?: string | null;
  costCenter?: string | null;
  counterpartyName?: string | null;
  counterpartyDocument?: string | null;
}) {
  const counterpartyName = input.counterpartyName || extractCounterpartyName(input.description);
  const counterpartyDocument = input.counterpartyDocument || extractDocument(input.description) || null;
  const pattern = learningPattern(input.description, counterpartyName, counterpartyDocument);
  const existing = await prisma.aiLearningRule.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.userId || null,
      pattern,
      direction: input.direction
    }
  });
  if (existing) {
    return prisma.aiLearningRule.update({
      where: { id: existing.id },
      data: {
        category: input.category,
        paymentMethod: input.paymentMethod || null,
        costCenter: input.costCenter || null,
        counterpartyName,
        counterpartyDocument,
        correctionCount: { increment: 1 },
        confidence: 0.98,
        source: "USER_CORRECTION"
      }
    });
  }
  return prisma.aiLearningRule.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId || null,
      pattern,
      direction: input.direction,
      category: input.category,
      paymentMethod: input.paymentMethod || null,
      costCenter: input.costCenter || null,
      counterpartyName,
      counterpartyDocument,
      confidence: 0.98,
      source: "USER_CORRECTION"
    }
  });
}
