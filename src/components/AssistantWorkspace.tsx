"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Paperclip, Send, Sparkles, X } from "lucide-react";

type Profile = {
  assistantName: string;
  ownerName?: string | null;
  businessName?: string | null;
  goalsText?: string | null;
  preferences?: string | null;
  personality?: string | null;
  memoryText?: string | null;
  onboardingStep?: number;
  onboardingCompleted?: boolean;
};

type Message = {
  id?: string;
  role: string;
  content: string;
};

type PendingAction = {
  action: string;
  confidence?: number;
  type?: string;
  amount?: number;
  description?: string;
  category?: string;
  dueDate?: string;
  date?: string;
  paymentMethod?: string;
  account?: string;
  targetModel?: string;
  searchText?: string;
  reportType?: string;
  goalsText?: string;
  balances?: Array<{ account: string; amount: number }>;
  data?: Record<string, any>;
};

type FinancialAccountOption = {
  id?: string;
  name: string;
  type?: string | null;
  status?: string | null;
  includeInTotal?: boolean | null;
};

const starterPrompts = [
  "Me ensine o passo a passo para usar o SaaS hoje.",
  "Analise meu caixa deste mes e me diga os 3 pontos mais importantes.",
  "O que eu preciso revisar nas importacoes e conciliacao?"
];

const actionPrompts = [
  { label: "Entrada", prompt: "Quero registrar uma entrada. Me pergunte valor, conta, forma de pagamento e descricao se faltar." },
  { label: "Despesa", prompt: "Quero registrar uma despesa. Me pergunte valor, conta, forma de pagamento, categoria e data se faltar." },
  { label: "A receber", prompt: "Quero adicionar uma conta a receber. Me ajude a preencher cliente, valor, vencimento e observacoes." },
  { label: "A pagar", prompt: "Quero adicionar uma conta a pagar. Me ajude a preencher descricao, valor, vencimento, categoria e conta." },
  { label: "Relatorio", prompt: "Faca um relatorio simples do meu mes com entradas, saidas, saldo, pendencias e dicas praticas." }
];

export function AssistantWorkspace({ mode = "page", initialPrompt = "", autoStartKey = "" }: { mode?: "page" | "compact"; initialPrompt?: string; autoStartKey?: string }) {
  const [profile, setProfile] = useState<Profile>({
    assistantName: "Assistente 360",
    ownerName: "",
    businessName: "",
    goalsText: "",
    preferences: "",
    personality: "",
    memoryText: "",
    onboardingStep: 0,
    onboardingCompleted: false
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [pendingContext, setPendingContext] = useState<any>(null);
  const [accounts, setAccounts] = useState<FinancialAccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [attachmentAccount, setAttachmentAccount] = useState("PJ");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }

  async function load() {
    const [profileResponse, chatResponse, accountsResponse] = await Promise.all([
      fetch("/api/assistant/profile", { cache: "no-store" }),
      fetch("/api/assistant/chat", { cache: "no-store" }),
      fetch("/api/financialAccounts", { cache: "no-store" })
    ]);
    const [profileData, chatData, accountsData] = await Promise.all([profileResponse.json(), chatResponse.json(), accountsResponse.json()]);
    if (profileData.profile) setProfile(profileData.profile);
    setMessages(chatData.messages ?? []);
    setAccounts((accountsData.items ?? []).filter((account: FinancialAccountOption) => account.status !== "inativa" && account.status !== "cancelada"));
    const activeAccounts = (accountsData.items ?? []).filter((account: FinancialAccountOption) => account.status !== "inativa" && account.status !== "cancelada");
    const pj = activeAccounts.find((account: FinancialAccountOption) => account.name.toLowerCase() === "pj");
    setAttachmentAccount((current) => current || pj?.name || activeAccounts[0]?.name || "PJ");
    setLoaded(true);
    scrollToLatest("auto");
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    scrollToLatest(messages.length <= 1 ? "auto" : "smooth");
  }, [messages, loading, pendingAction]);

  useEffect(() => {
    if (!loaded || !initialPrompt.trim() || loading) return;
    const key = `merli360_ai_autostart_${autoStartKey || initialPrompt.slice(0, 40)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.setTimeout(() => send(initialPrompt), 350);
  }, [loaded, initialPrompt, autoStartKey, loading]);

  function accountOptions() {
    const items = accounts.length ? accounts : [{ name: "PJ", type: "conta bancaria", status: "ativa", includeInTotal: true }];
    const seen = new Set<string>();
    return items.filter((account) => {
      const key = account.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function defaultAccountFor(action?: PendingAction | null) {
    if (!action) return "";
    const options = accountOptions();
    const account = String(action.account || "").trim();
    const exact = options.find((item) => item.name.toLowerCase() === account.toLowerCase());
    if (exact) return exact.name;
    const contained = options.find((item) => account && (item.name.toLowerCase().includes(account.toLowerCase()) || account.toLowerCase().includes(item.name.toLowerCase())));
    if (contained) return contained.name;
    const pj = options.find((item) => item.name.toLowerCase() === "pj");
    const dinheiro = options.find((item) => item.name.toLowerCase().includes("dinheiro"));
    if (action.paymentMethod === "Dinheiro" && dinheiro) return dinheiro.name;
    return pj?.name || options[0]?.name || "";
  }

  function applyPendingAction(action?: PendingAction | null) {
    setPendingAction(action || null);
    if (!action) setPendingPlanId(null);
    setSelectedAccount(defaultAccountFor(action));
  }

  function actionNeedsAccount(action?: PendingAction | null) {
    return ["create_transaction", "create_payable", "create_receivable"].includes(action?.action || "");
  }

  function accountLabel(action: PendingAction) {
    if (action.action === "create_transaction" && action.type === "entrada") return "Conta onde entrou";
    if (action.action === "create_transaction") return "Conta de onde saiu";
    if (action.action === "create_receivable") return "Conta prevista para receber";
    if (action.action === "create_payable") return "Conta prevista para pagar";
    return "Conta/carteira";
  }

  async function send(text = message) {
    const content = text.trim();
    if (!content) return;
    setMessage("");
    setMessages((current) => [...current, { role: "user", content }]);
    setLoading(true);
    scrollToLatest();
    const response = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content })
    });
    const data = await response.json();
    setMessages((current) => [...current, { role: "assistant", content: data.answer || data.error || "Nao consegui responder agora." }]);
    applyPendingAction(data.pendingAction || null);
    setPendingPlanId(data.pendingPlanId || null);
    setPendingContext({ message: content, enrichment: data.enrichment });
    setLoading(false);
  }

  async function sendAttachment() {
    if (!file) return;
    const instruction = message.trim() || "Leia este anexo e registre o lancamento financeiro se houver valor claro.";
    setMessages((current) => [...current, { role: "user", content: `${instruction}\n\n[Anexo: ${file.name}]` }]);
    setMessage("");
    setLoading(true);
    scrollToLatest();
    const form = new FormData();
    form.set("file", file);
    form.set("message", instruction);
    form.set("account", attachmentAccount || "PJ");
    const response = await fetch("/api/assistant/analyze", { method: "POST", body: form });
    const data = await response.json();
    setMessages((current) => [...current, { role: "assistant", content: data.answer || data.error || "Nao consegui ler esse anexo agora." }]);
    applyPendingAction(data.pendingAction || null);
    setPendingPlanId(data.pendingPlanId || null);
    setPendingContext({ message: instruction, enrichment: data.enrichment, attachmentId: data.attachment?.id });
    setFile(null);
    setLoading(false);
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const operation = actionNeedsAccount(pendingAction)
      ? { ...pendingAction, account: selectedAccount || pendingAction.account || defaultAccountFor(pendingAction) }
      : pendingAction;
    setLoading(true);
    scrollToLatest();
    const response = await fetch("/api/assistant/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, planId: pendingPlanId, ...pendingContext })
    });
    const data = await response.json();
    setMessages((current) => [...current, { role: "assistant", content: data.answer || data.error || "Nao consegui executar essa acao." }]);
    applyPendingAction(null);
    setPendingPlanId(null);
    setPendingContext(null);
    setLoading(false);
    if (data.redirectTo) {
      window.setTimeout(() => {
        window.location.href = data.redirectTo;
      }, 700);
    }
  }

  function pendingSummary(action: PendingAction) {
    const money = action.amount ? `R$ ${Number(action.amount).toFixed(2)}` : "";
    const date = action.dueDate || action.date || "";
    const account = actionNeedsAccount(action) ? ` - conta: ${selectedAccount || action.account || "escolha antes de salvar"}` : "";
    if (action.action === "create_payable") return `Criar conta a pagar: ${action.description || "-"} ${money} ${date ? `vence ${date}` : ""}${account}`;
    if (action.action === "create_receivable") return `Criar conta a receber: ${action.description || "-"} ${money} ${date ? `vence ${date}` : ""}${account}`;
    if (action.action === "create_transaction") return `Criar lancamento no fluxo: ${action.type || ""} ${action.description || "-"} ${money} em ${action.category || "A conferir"}${account}`;
    if (action.action === "delete_record") return `Remover registro em ${action.targetModel || "tabela"}: ${action.searchText || action.description || "item indicado"}`;
    if (action.action === "update_profile") return `Atualizar configuracao/metas da IA`;
    if (action.action === "update_initial_balance") return `Atualizar saldo inicial: ${(action.balances || []).map((item) => `${item.account} R$ ${Number(item.amount || 0).toFixed(2)}`).join(", ") || "carteira informada"}`;
    if (action.action === "reset_operational_data") return "Executar Reset boom: apagar registros operacionais deste tenant para teste e zerar saldos iniciais das carteiras.";
    if (action.action === "reset_ai_learning") return "Executar Reset IA: apagar conversa, memoria e regras aprendidas da assistente deste usuario, mantendo os dados financeiros.";
    if (action.action === "create_record") return `Criar registro em ${action.targetModel || "cadastros"}: ${action.data?.name || action.data?.title || action.data?.description || "novo item"}`;
    if (action.action === "update_record") return `Atualizar registro em ${action.targetModel || "cadastros"}: ${action.searchText || action.data?.name || action.data?.title || "item indicado"}`;
    if (action.action === "create_report") return `Gerar relatorio: ${action.reportType || "financeiro"}`;
    return `Executar: ${action.action}`;
  }

  function suggestions() {
    const base = [...actionPrompts];
    if (!profile.onboardingCompleted) {
      return [
        { label: "Me guie", prompt: "Estou começando agora. Me explique como falar com voce e quais informações devo mandar primeiro." },
        ...base.slice(0, 4)
      ];
    }
    return base;
  }

  const chatPanel = (
    <div className={mode === "compact" ? "flex h-full min-h-0 flex-col overflow-hidden" : "surface-panel flex h-[calc(100vh-170px)] min-h-[620px] flex-col overflow-hidden"}>
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center gap-2">
          <Bot className="text-violet-600" size={20} />
          <h2 className="font-black text-slate-950">{profile.assistantName || "Assistente 360"}</h2>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {starterPrompts.map((prompt) => (
            <button key={prompt} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700" onClick={() => send(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
        {!messages.length ? (
          <div className="rounded-2xl border border-dashed border-violet-200 bg-white p-5 text-sm font-semibold text-slate-600">
            Antes de cadastrar tudo, voce pode conversar com a IA. Ela pergunta o que voce quer controlar, cria um passo a passo e prepara os registros para voce confirmar.
          </div>
        ) : null}
        {messages.map((item, index) => (
          <div key={`${item.role}-${index}`} className={item.role === "user" ? "ml-auto max-w-[86%] rounded-2xl bg-violet-600 p-3 text-sm font-semibold text-white" : "max-w-[92%] whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700"}>
            {item.content}
          </div>
        ))}
        {loading ? <div className="max-w-[80%] rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-500">Lendo, classificando e conferindo seus dados...</div> : null}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      <div className="border-t border-slate-100 bg-white p-4">
        {pendingAction ? (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-black uppercase text-amber-700">A IA ainda nao salvou</p>
            <p className="mt-1 text-sm font-black text-slate-900">{pendingSummary(pendingAction)}</p>
            <p className="mt-1 text-xs font-bold text-amber-700">Revise e confirme para gravar no banco de dados.</p>
            {actionNeedsAccount(pendingAction) ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-black uppercase text-amber-800">{accountLabel(pendingAction)}</span>
                <select className="form-control bg-white" value={selectedAccount} onChange={(event) => setSelectedAccount(event.target.value)}>
                  {accountOptions().map((account) => (
                    <option key={account.name} value={account.name}>
                      {account.name}{account.type ? ` - ${account.type}` : ""}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] font-bold text-amber-700">
                  Entradas somam nessa conta. Saidas reduzem o saldo dessa conta.
                </span>
              </label>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="primary-action px-3 py-2" onClick={confirmPendingAction} disabled={loading || (actionNeedsAccount(pendingAction) && !selectedAccount)}>
                <Check size={16} />
                Confirmar e salvar
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700" onClick={() => applyPendingAction(null)} type="button">
                <X size={16} />
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {suggestions().map((item) => (
            <button
              key={item.label}
              className="shrink-0 rounded-full border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
              type="button"
              onClick={() => send(item.prompt)}
              disabled={loading}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            className="form-control min-h-[52px] flex-1 resize-none"
            placeholder="Digite uma despesa, receita, pergunta ou instrucao para o anexo..."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <button className="primary-action self-end px-4" onClick={() => send()} disabled={loading || !message.trim()} title="Enviar">
            <Send size={18} />
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_170px_auto] sm:items-center">
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
            <Paperclip size={17} />
            {file ? file.name : "Enviar anexo"}
            <input
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp,application/pdf,.csv,.xlsx,.xls,.ofx,.qfx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <select className="form-control bg-white" value={attachmentAccount} onChange={(event) => setAttachmentAccount(event.target.value)} title="Conta do extrato/anexo">
            {accountOptions().map((account) => (
              <option key={account.name} value={account.name}>
                {account.name}
              </option>
            ))}
          </select>
          {file ? (
            <button className="primary-action px-4 py-2" onClick={sendAttachment} disabled={loading}>
              <Sparkles size={17} />
              Ler e registrar
            </button>
          ) : null}
          <p className="text-xs font-semibold text-slate-500">Imagens, comprovantes, PDFs, CSV, XLSX e OFX.</p>
        </div>
      </div>
    </div>
  );

  if (mode === "compact") return chatPanel;

  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">IA</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Assistente Financeira 360</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Converse, registre receitas/despesas por texto e envie comprovantes para leitura automatica.</p>
            {!profile.onboardingCompleted ? (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">Entrevista inicial pendente: converse com a IA para ela salvar sua memoria de uso.</p>
            ) : null}
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl bg-violet-50 px-4 py-3 text-sm font-black text-violet-700">
            <Sparkles size={18} />
            IA operacional
          </div>
        </div>
      </header>

      <section>
        {chatPanel}
      </section>
    </div>
  );
}
