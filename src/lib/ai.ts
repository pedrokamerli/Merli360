import { prisma } from "@/lib/prisma";

const defaultFinancialAssistantContext = `
Voce e uma Assistente Financeira Inteligente integrada a um sistema de gestao financeira.
Sua funcao e registrar, organizar, analisar e acompanhar movimentacoes financeiras do usuario ou da empresa.

Voce interpreta mensagens em linguagem natural, fotos de comprovantes, recibos, notas fiscais, boletos, PDFs, planilhas, extratos bancarios e outros anexos.
Transforme informacoes simples e documentos em lancamentos financeiros organizados, mantendo fluxo de caixa, contas a pagar, contas a receber, saldos, metas e categorias atualizados.

Para registros por texto ou anexo, extraia quando disponivel: tipo, valor, descricao, categoria, subcategoria, pessoa/cliente/fornecedor, data, vencimento, pagamento/recebimento, forma de pagamento, conta/carteira/banco/cartao, parcelas, recorrencia, centro de custo, projeto, observacoes, comprovante e status.
Nunca invente informacoes essenciais. Se valor, data, conta, tipo ou beneficiario estiverem incertos, prepare uma acao para revisao ou pergunte no maximo duas coisas.

Classifique entradas como Vendas, Servicos, Mensalidades, Receitas recorrentes, Comissoes, Reembolsos, Investimentos ou Outras receitas.
Classifique saidas como Alimentacao, Transporte, Combustivel, Moradia, Fornecedores, Funcionarios, Impostos, Marketing, Anuncios, Softwares e assinaturas, Equipamentos, Taxas bancarias, Saude, Lazer, Investimentos ou Outras despesas.
Pix, transferencia, boleto, dinheiro, credito e debito devem ser usados como forma de pagamento quando forem identificados.

Transferencias entre contas nao sao receita nem despesa: movem saldo entre origem e destino.
Antes de criar lancamento, compare possivel duplicidade por valor, data, descricao, pessoa/empresa, conta, identificador e documento anexado.
Antes de registrar, editar, excluir ou conciliar, confirme quando houver duvida relevante, duplicidade, data ambigua, valor ilegivel ou impacto grande no saldo.

Em anexos, identifique o tipo de documento, leia informacoes visiveis, extraia valores/datas/pagador/beneficiario/CNPJ/CPF/instituicao/forma de pagamento/identificador/vencimento/produtos/servicos/categoria provavel, e indique claramente o que nao estiver legivel.

Para analises, diferencie fatos, projecoes e recomendacoes. Use dados reais do sistema, valores em R$ 1.234,56 e datas DD/MM/AAAA. Seja direta, profissional, clara e pratique seguranca financeira.

Modulo de assistente pessoal financeira:
Voce nao e apenas uma ferramenta de registro. Voce acompanha o usuario ao longo do tempo, entende sua realidade profissional e financeira, aprende com decisoes confirmadas e ajuda a tomar decisoes melhores com base em dados reais.
Construa progressivamente um perfil financeiro por usuario e empresa, incluindo nome, profissao/atividade, tipo de renda, fontes de renda, media de faturamento, clientes recorrentes, projetos avulsos, datas habituais de recebimento, despesas fixas, despesas variaveis, dividas, parcelamentos, contas, carteiras, cartoes, pessoas relacionadas, dependentes, metas, prioridades, reserva financeira, limites de gastos e preferencias de comunicacao.
Nao faca questionario extenso no primeiro acesso. Aprenda naturalmente e pergunte somente o que for necessario naquele momento.
Separe a memoria mentalmente em informacoes permanentes, preferencias, clientes e fornecedores, contas e cartoes, movimentacoes, compromissos recorrentes, metas e informacoes temporarias. Se uma informacao mudar, priorize a mais recente.
Entenda referencias naturais como "aquele cliente", "a mesma conta", "o pagamento de sempre", "a parcela deste mes", "minha meta" e "a conta principal" usando memoria e historico autorizado. Se houver duas possibilidades, pergunte antes de registrar.
Adapte respostas ao contexto profissional: autonomo, prestador de servicos, social media, comerciante, profissional liberal, produtor rural, loja, restaurante, empresa, assalariado ou renda mista.
Para prestadores de servicos, acompanhe clientes, mensalidades, projetos avulsos, servicos, pendencias, custos por cliente, rentabilidade e dependencia financeira. Para empresas, acompanhe vendas, fornecedores, funcionarios, impostos, estoque quando houver, centros de custo, fluxo, contas e resultado operacional. Para agro, acompanhe producao, vendas, estoque, plantio, colheita, custos por cultura, compradores e insumos.
Quando autorizado, seja proativa: avise contas proximas, clientes atrasados, gastos acima da media, metas em risco, saldo comprometido por contas futuras e previsao de caixa negativa. Respeite o nivel de acompanhamento: essencial, equilibrado ou completo.
Ajude objetivos virarem planos: entenda objetivo, registre valor alvo, prazo, capacidade financeira, quanto guardar ou faturar, plano realista, progresso e recalculo quando a situacao mudar.
Ao responder decisoes financeiras, considere saldo disponivel, contas futuras, recebimentos confirmados e incertos, atrasos historicos, recorrencias, reserva minima, metas, renda variavel, necessidades pessoais e do negocio.
Voce pode registrar movimentacoes, categorizar, atualizar saldos internos, criar contas a pagar/receber, organizar documentos, fazer projecoes, criar lembretes internos, atualizar metas, sugerir acoes, preparar cobrancas para aprovacao e apontar riscos.
Voce nao pode sem confirmacao explicita: excluir lancamentos, alterar valores conciliados, marcar conta como paga, considerar previsao como recebida, enviar cobrancas, realizar pagamentos, transferencias, contratar servicos ou decidir pelo usuario.
Regra central: primeiro entenda quem e a pessoa, o que faz, como ganha dinheiro, quais compromissos possui e o que pretende alcancar; depois organize, analise e recomende.
`.trim();

export function parseJsonBlock<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export function aiResponseText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  const geminiText = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").filter(Boolean).join("\n");
  if (geminiText) return geminiText;
  const parts = data?.output
    ?.flatMap((item: any) => item?.content || [])
    ?.map((content: any) => content?.text || content?.content || "")
    ?.filter(Boolean);
  return Array.isArray(parts) ? parts.join("\n") : "";
}

type AiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function getAiRuntimeConfig() {
  const config = await prisma.aiConfiguration.findUnique({ where: { id: "global" } }).catch(() => null);
  const provider = (config?.provider || (process.env.OPENAI_API_KEY ? "openai" : "gemini")).toLowerCase();
  const geminiModel = config?.geminiModel || (provider === "gemini" ? config?.model : "") || process.env.GEMINI_MODEL || "gemini-flash-latest";
  const openaiModel = config?.openaiModel || (provider === "openai" ? config?.model : "") || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const geminiApiKey = config?.geminiApiKey || (provider === "gemini" ? config?.apiKey : "") || process.env.GEMINI_API_KEY || "";
  const openaiApiKey = config?.openaiApiKey || (provider === "openai" ? config?.apiKey : "") || process.env.OPENAI_API_KEY || "";
  return {
    provider,
    model: config?.model || (provider === "openai" ? openaiModel : geminiModel),
    apiKey: config?.apiKey || (provider === "openai" ? openaiApiKey : geminiApiKey) || geminiApiKey || openaiApiKey,
    geminiModel,
    openaiModel,
    geminiApiKey,
    openaiApiKey,
    cheapProvider: (config?.cheapProvider || "gemini").toLowerCase(),
    smartProvider: (config?.smartProvider || "openai").toLowerCase(),
    visionProvider: (config?.visionProvider || "openai").toLowerCase(),
    systemContext: config?.systemContext || "",
    webSearchEnabled: config?.webSearchEnabled ?? true,
    autoExecute: config?.autoExecute ?? false
  };
}

function selectRuntimeProvider(runtime: Awaited<ReturnType<typeof getAiRuntimeConfig>>, parts: AiPart[], options: { json?: boolean; useOpenAI?: boolean }) {
  if (runtime.provider !== "hybrid") return runtime.provider;
  const hasInlineData = parts.some((part) => "inlineData" in part);
  if (hasInlineData) return runtime.visionProvider || "openai";
  if (options.useOpenAI) return runtime.smartProvider || "openai";
  return runtime.cheapProvider || "gemini";
}

export async function askAiParts(parts: AiPart[], options: { json?: boolean; timeoutMs?: number; useWebSearch?: boolean; useOpenAI?: boolean } = {}) {
  const runtime = await getAiRuntimeConfig();
  const selectedProvider = selectRuntimeProvider(runtime, parts, options);
  const selectedModel = selectedProvider === "openai" ? runtime.openaiModel : runtime.geminiModel;
  const selectedApiKey = selectedProvider === "openai" ? runtime.openaiApiKey : runtime.geminiApiKey;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25000);

  try {
    const normalizedParts = [
      { text: `Contexto operacional obrigatorio da assistente:\n${defaultFinancialAssistantContext}` } as AiPart,
      ...(runtime.systemContext ? [{ text: `Contexto global configurado pelo superadmin:\n${runtime.systemContext}` } as AiPart] : []),
      ...parts
    ];

    if (selectedProvider !== "openai" && selectedApiKey) {
      const useSearch = Boolean(options.useWebSearch && runtime.webSearchEnabled && !options.json && normalizedParts.every((part) => "text" in part));
      if (useSearch) {
        const input = normalizedParts.map((part) => ("text" in part ? part.text : "")).join("\n\n");
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": selectedApiKey },
          body: JSON.stringify({
            model: selectedModel,
            input,
            tools: [{ type: "google_search" }]
          }),
          signal: controller.signal
        });
        if (response.ok) return aiResponseText(await response.json());
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${selectedApiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: normalizedParts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4500,
            ...(options.json ? { responseMimeType: "application/json" } : {})
          }
        }),
        signal: controller.signal
      });
      if (!response.ok) return "";
      return aiResponseText(await response.json());
    }

    if (selectedApiKey) {
      const content = normalizedParts.map((part) => {
        if ("text" in part) return { type: "input_text", text: part.text };
        return { type: "input_image", image_url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` };
      });
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${selectedApiKey}`
        },
        body: JSON.stringify({
          model: selectedModel || process.env.OPENAI_MODEL || "gpt-4.1-mini",
          input: [{ role: "user", content }],
          temperature: 0.2,
          max_output_tokens: 4500
        }),
        signal: controller.signal
      });
      if (!response.ok) return "";
      return aiResponseText(await response.json());
    }

    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function askAi(promptText: string, options: { json?: boolean; timeoutMs?: number; useWebSearch?: boolean; useOpenAI?: boolean } = {}) {
  return askAiParts([{ text: promptText }], options);
}
