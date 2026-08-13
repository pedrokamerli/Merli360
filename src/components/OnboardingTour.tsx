"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, Smartphone, X } from "lucide-react";

type OnboardingTourProps = {
  brandName: string;
  tenantKind: string;
  userName: string;
};

const commonSteps = [
  {
    title: "Comece pelo fluxo de caixa",
    body: "Registre entradas e saidas assim que acontecerem. Isso alimenta dashboard, carteiras, relatorios e saldos.",
    action: "/fluxo",
    actionLabel: "Abrir fluxo"
  },
  {
    title: "Use contas a receber e a pagar",
    body: "Cadastre o que vai vencer. Quando receber ou pagar, use o botao de baixa para o movimento entrar automaticamente no caixa.",
    action: "/receber",
    actionLabel: "Ver contas"
  },
  {
    title: "Organize categorias",
    body: "As categorias ja vem prontas, mas voce pode editar, ocultar ou criar novas para deixar a gestao do seu jeito.",
    action: "/categorias",
    actionLabel: "Ver categorias"
  },
  {
    title: "Envie comprovantes",
    body: "Anexe PDF ou imagem nos lancamentos e documentos. Assim a conferencia fica no mesmo lugar do registro financeiro.",
    action: "/comprovantes",
    actionLabel: "Enviar arquivo"
  },
  {
    title: "Ative no celular",
    body: "Instale como PWA pelo navegador e ative notificacoes para receber lembretes de vencimentos.",
    action: "/notificacoes",
    actionLabel: "Ativar alertas"
  }
];

const agroSteps = [
  {
    title: "Registre vendas e producao",
    body: "No Agro, vendas, plantios, colheitas e estoque trabalham juntos para mostrar resultado rural com menos retrabalho.",
    action: "/vendas",
    actionLabel: "Abrir vendas"
  }
];

const merliSteps = [
  {
    title: "Acompanhe clientes e operacao",
    body: "Use contatos, titulos financeiros, notas, ads e relatorios para manter a consultoria em ordem.",
    action: "/contatos",
    actionLabel: "Abrir contatos"
  }
];

export function OnboardingTour({ brandName, tenantKind, userName }: OnboardingTourProps) {
  const steps = useMemo(() => [tenantKind === "agro" ? agroSteps[0] : merliSteps[0], ...commonSteps], [tenantKind]);
  const storageKey = `onboarding-done:${brandName}:${userName}`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!window.localStorage.getItem(storageKey)) setOpen(true);
  }, [storageKey]);

  function finish() {
    window.localStorage.setItem(storageKey, "1");
    setOpen(false);
    setStep(0);
  }

  function restart() {
    setStep(0);
    setOpen(true);
  }

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <>
      <button
        className="fixed bottom-24 right-4 z-40 hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-xl md:inline-flex"
        onClick={restart}
        type="button"
      >
        <HelpCircle size={17} />
        Tutorial
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 p-3 backdrop-blur-sm md:place-items-center">
          <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div>
                <p className="eyebrow">Primeiro acesso</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{brandName}</h2>
                <p className="mt-1 text-sm text-slate-500">Um guia rapido para usar sem complicar.</p>
              </div>
              <button className="icon-action" onClick={finish} type="button" title="Fechar tutorial">
                <X size={17} />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4 flex gap-2">
                {steps.map((item, index) => (
                  <button
                    key={item.title}
                    className={`h-2 flex-1 rounded-full ${index <= step ? "bg-violet-600" : "bg-slate-200"}`}
                    onClick={() => setStep(index)}
                    type="button"
                    aria-label={`Ir para passo ${index + 1}`}
                  />
                ))}
              </div>

              <div className="rounded-3xl bg-slate-50 p-5">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                  {step === steps.length - 1 ? <Smartphone size={22} /> : step === 3 ? <Bell size={22} /> : <CheckCircle2 size={22} />}
                </div>
                <p className="text-sm font-bold text-slate-500">Passo {step + 1} de {steps.length}</p>
                <h3 className="mt-2 text-xl font-black text-slate-950">{current.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{current.body}</p>
                <a className="secondary-action mt-4" href={current.action}>
                  {current.actionLabel}
                </a>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-5">
              <button className="secondary-action" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} type="button">
                <ChevronLeft size={17} />
                Voltar
              </button>
              {isLast ? (
                <button className="primary-action" onClick={finish} type="button">
                  <CheckCircle2 size={17} />
                  Comecar a usar
                </button>
              ) : (
                <button className="primary-action" onClick={() => setStep(Math.min(steps.length - 1, step + 1))} type="button">
                  Avancar
                  <ChevronRight size={17} />
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
