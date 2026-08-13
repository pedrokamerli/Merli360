"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Save } from "lucide-react";

type AiConfig = {
  provider: string;
  model: string;
  apiKey: string;
  apiKeyMasked?: string;
  hasApiKey?: boolean;
  geminiModel: string;
  geminiApiKey: string;
  geminiApiKeyMasked?: string;
  hasGeminiApiKey?: boolean;
  openaiModel: string;
  openaiApiKey: string;
  openaiApiKeyMasked?: string;
  hasOpenaiApiKey?: boolean;
  cheapProvider: string;
  smartProvider: string;
  visionProvider: string;
  systemContext: string;
  webSearchEnabled: boolean;
  autoExecute: boolean;
};

const geminiModelOptions = [
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash - melhor geral/agentes" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite - barato e rapido" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview - mais raciocinio" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash - custo/beneficio" },
  { value: "gemini-flash-latest", label: "Gemini Flash Latest - alias automatico" }
];

const openaiModelOptions = [
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol - mais inteligente" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra - equilibrio" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna - menor custo" },
  { value: "gpt-5.6", label: "GPT-5.6 - alias flagship" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini - compatibilidade/custo" }
];

function isPreset(value: string, options: Array<{ value: string }>) {
  return options.some((option) => option.value === value);
}

export function AiSettingsPanel() {
  const [aiConfig, setAiConfig] = useState<AiConfig>({
    provider: "gemini",
    model: "gemini-flash-latest",
    apiKey: "",
    geminiModel: "gemini-flash-latest",
    geminiApiKey: "",
    openaiModel: "gpt-4.1-mini",
    openaiApiKey: "",
    cheapProvider: "gemini",
    smartProvider: "openai",
    visionProvider: "openai",
    systemContext: "",
    webSearchEnabled: true,
    autoExecute: false
  });
  const [savingAi, setSavingAi] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/ai-settings", { cache: "no-store" });
    const data = await response.json();
    if (data.config) setAiConfig({ ...data.config, apiKey: "", geminiApiKey: "", openaiApiKey: "" });
  }

  useEffect(() => {
    load();
  }, []);

  async function saveAiSettings() {
    setSavingAi(true);
    setMessage("");
    const response = await fetch("/api/admin/ai-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiConfig)
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Nao foi possivel salvar a IA.");
    } else {
      setAiConfig({ ...data.config, apiKey: "", geminiApiKey: "", openaiApiKey: "" });
      setMessage("Configuracao da IA salva.");
    }
    setSavingAi(false);
  }

  return (
    <section className="surface-panel p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
          <BrainCircuit size={22} />
        </div>
        <div>
          <p className="eyebrow">Configuracao global</p>
          <h2 className="text-lg font-black text-slate-950">IA do SaaS</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Somente o superadmin define Gemini, OpenAI, roteamento, chaves e contexto usado pela IA em todos os tenants.
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-violet-100 bg-violet-50/60 p-4 lg:col-span-2">
          <p className="eyebrow text-violet-700">Estrategia</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Modo</span>
              <select
                className="form-control bg-white"
                value={aiConfig.provider}
                onChange={(event) =>
                  setAiConfig({
                    ...aiConfig,
                    provider: event.target.value,
                    model: event.target.value === "openai" ? aiConfig.openaiModel : event.target.value === "gemini" ? aiConfig.geminiModel : "hybrid"
                  })
                }
              >
                <option value="hybrid">Hibrido: Gemini + OpenAI</option>
                <option value="gemini">Somente Gemini</option>
                <option value="openai">Somente OpenAI</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Rotina/barato</span>
              <select className="form-control bg-white" value={aiConfig.cheapProvider} onChange={(event) => setAiConfig({ ...aiConfig, cheapProvider: event.target.value })}>
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Pesado/inteligente</span>
              <select className="form-control bg-white" value={aiConfig.smartProvider} onChange={(event) => setAiConfig({ ...aiConfig, smartProvider: event.target.value })}>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Anexos/imagens</span>
              <select className="form-control bg-white" value={aiConfig.visionProvider} onChange={(event) => setAiConfig({ ...aiConfig, visionProvider: event.target.value })}>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs font-bold text-violet-700">
            Recomendado: Gemini para conversa comum e classificacoes simples; OpenAI para leitura de imagens, comprovantes e tarefas mais complexas.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <p className="eyebrow">Gemini</p>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">Modelo Gemini</span>
            <select
              className="form-control bg-white"
              value={isPreset(aiConfig.geminiModel, geminiModelOptions) ? aiConfig.geminiModel : "custom"}
              onChange={(event) => {
                const nextModel = event.target.value === "custom" ? aiConfig.geminiModel : event.target.value;
                setAiConfig({ ...aiConfig, geminiModel: nextModel, model: aiConfig.provider === "gemini" ? nextModel : aiConfig.model });
              }}
            >
              {geminiModelOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
              <option value="custom">Outro modelo Gemini</option>
            </select>
            {!isPreset(aiConfig.geminiModel, geminiModelOptions) ? (
              <input className="form-control mt-2" value={aiConfig.geminiModel} onChange={(event) => setAiConfig({ ...aiConfig, geminiModel: event.target.value, model: aiConfig.provider === "gemini" ? event.target.value : aiConfig.model })} placeholder="ID do modelo Gemini" />
            ) : null}
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">API key Gemini</span>
            <input
              className="form-control"
              type="password"
              placeholder={aiConfig.hasGeminiApiKey ? `Configurada (${aiConfig.geminiApiKeyMasked || "oculta"})` : "Cole a chave Gemini aqui"}
              value={aiConfig.geminiApiKey}
              onChange={(event) => setAiConfig({ ...aiConfig, geminiApiKey: event.target.value })}
            />
          </label>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <p className="eyebrow">OpenAI</p>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">Modelo OpenAI</span>
            <select
              className="form-control bg-white"
              value={isPreset(aiConfig.openaiModel, openaiModelOptions) ? aiConfig.openaiModel : "custom"}
              onChange={(event) => {
                const nextModel = event.target.value === "custom" ? aiConfig.openaiModel : event.target.value;
                setAiConfig({ ...aiConfig, openaiModel: nextModel, model: aiConfig.provider === "openai" ? nextModel : aiConfig.model });
              }}
            >
              {openaiModelOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
              <option value="custom">Outro modelo OpenAI</option>
            </select>
            {!isPreset(aiConfig.openaiModel, openaiModelOptions) ? (
              <input className="form-control mt-2" value={aiConfig.openaiModel} onChange={(event) => setAiConfig({ ...aiConfig, openaiModel: event.target.value, model: aiConfig.provider === "openai" ? event.target.value : aiConfig.model })} placeholder="ID do modelo OpenAI" />
            ) : null}
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">API key OpenAI</span>
            <input
              className="form-control"
              type="password"
              placeholder={aiConfig.hasOpenaiApiKey ? `Configurada (${aiConfig.openaiApiKeyMasked || "oculta"})` : "Cole a chave OpenAI aqui"}
              value={aiConfig.openaiApiKey}
              onChange={(event) => setAiConfig({ ...aiConfig, openaiApiKey: event.target.value })}
            />
          </label>
        </div>

        <label className="hidden">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Provedor legado</span>
          <select
            className="form-control"
            value={aiConfig.provider}
            onChange={(event) =>
              setAiConfig({
                ...aiConfig,
                provider: event.target.value,
                model: event.target.value === "openai" ? "gpt-4.1-mini" : "gemini-flash-latest"
              })
            }
          >
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label className="hidden">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Modelo</span>
          <input className="form-control" value={aiConfig.model} onChange={(event) => setAiConfig({ ...aiConfig, model: event.target.value })} />
        </label>
        <label className="hidden">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">API key</span>
          <input
            className="form-control"
            type="password"
            placeholder={aiConfig.hasApiKey ? `Configurada (${aiConfig.apiKeyMasked || "oculta"})` : "Cole a chave aqui"}
            value={aiConfig.apiKey}
            onChange={(event) => setAiConfig({ ...aiConfig, apiKey: event.target.value })}
          />
        </label>
        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:col-span-2">
          <label className="flex items-center gap-2 text-sm font-black text-slate-700">
            <input type="checkbox" checked={aiConfig.webSearchEnabled} onChange={(event) => setAiConfig({ ...aiConfig, webSearchEnabled: event.target.checked })} />
            Permitir busca na web quando necessario
          </label>
          <label className="flex items-center gap-2 text-sm font-black text-slate-700">
            <input type="checkbox" checked={aiConfig.autoExecute} onChange={(event) => setAiConfig({ ...aiConfig, autoExecute: event.target.checked })} />
            Permitir execucao automatica sem confirmacao
          </label>
          <p className="text-xs font-semibold text-slate-500">Recomendado manter execucao automatica desligada para evitar registros errados no banco.</p>
        </div>
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Contexto da IA</span>
          <textarea
            className="form-control min-h-[260px]"
            placeholder="Explique como a IA deve agir, linguagem, regras de negocio, limites, padrao de categorias, quando consultar web, quando pedir confirmacao..."
            value={aiConfig.systemContext}
            onChange={(event) => setAiConfig({ ...aiConfig, systemContext: event.target.value })}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="primary-action" onClick={saveAiSettings} disabled={savingAi}>
          <Save size={17} />
          {savingAi ? "Salvando IA..." : "Salvar configuracao da IA"}
        </button>
        <span className="text-xs font-bold text-slate-500">A chave salva substitui o `.env`; se deixar vazio, a chave atual permanece.</span>
        {message ? <span className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{message}</span> : null}
      </div>
    </section>
  );
}
