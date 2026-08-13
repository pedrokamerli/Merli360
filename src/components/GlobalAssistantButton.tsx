"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, X } from "lucide-react";
import { AssistantWorkspace } from "@/components/AssistantWorkspace";

export function GlobalAssistantButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const shouldWelcome = searchParams.get("welcome") === "1";
  const shouldOpenAi = searchParams.get("openAi") === "1";

  useEffect(() => {
    let active = true;
    fetch("/api/assistant/profile", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const required = Boolean(data.profile && !data.profile.onboardingCompleted);
        setOnboardingRequired(required);
        if (shouldOpenAi) {
          setOpen(true);
          return;
        }
        if (required && !sessionStorage.getItem("merli360_ai_onboarding_seen")) {
          setOpen(true);
          sessionStorage.setItem("merli360_ai_onboarding_seen", "1");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [shouldOpenAi]);

  if (pathname === "/login") return null;

  return (
    <>
      <button className="global-assistant-button" type="button" onClick={() => setOpen(true)} aria-label="Abrir assistente IA">
        <Bot size={22} />
        <span>IA</span>
        {onboardingRequired ? <span className="global-assistant-dot" /> : null}
      </button>

      {open ? (
        <div className="global-assistant-backdrop" onClick={() => setOpen(false)}>
          <section className="global-assistant-panel" onClick={(event) => event.stopPropagation()} aria-label="Chat da IA">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="eyebrow">Assistente</p>
                <h2 className="text-lg font-black text-slate-950">IA 360</h2>
              </div>
              <button className="icon-action" type="button" onClick={() => setOpen(false)} aria-label="Fechar assistente">
                <X size={18} />
              </button>
            </div>
            <AssistantWorkspace
              mode="compact"
              initialPrompt={shouldWelcome ? "Terminei meu primeiro acesso. Se apresente, me ensine como falar com voce e me mostre os primeiros passos para usar o sistema." : ""}
              autoStartKey={shouldWelcome ? "first-access-welcome" : ""}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
