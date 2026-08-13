"use client";

import { useMemo, useState } from "react";
import type { QuestionnaireQuestion } from "@/lib/public-questionnaire";

export function PublicQuestionnaireForm({ questionnaireId, questions }: { questionnaireId: string; questions: QuestionnaireQuestion[] }) {
  const sections = useMemo(() => {
    return questions.reduce<Array<{ title: string; questions: QuestionnaireQuestion[] }>>((acc, question) => {
      const current = acc[acc.length - 1];
      if (!current || current.title !== question.section) acc.push({ title: question.section, questions: [question] });
      else current.questions.push(question);
      return acc;
    }, []);
  }, [questions]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [respondentName, setRespondentName] = useState("");
  const [respondentPhone, setRespondentPhone] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const answered = Object.values(answers).filter((value) => value.trim()).length;
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0;

  async function submit() {
    setStatus("sending");
    setError("");
    const response = await fetch("/api/public-questionnaires/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionnaireId, respondentName, respondentPhone, respondentEmail, answers })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus("error");
      setError(data.error || "Nao foi possivel enviar. Tente novamente.");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <section className="rounded-[2rem] border border-emerald-200 bg-white p-8 text-center shadow-xl shadow-emerald-100">
        <p className="text-sm font-black uppercase tracking-widest text-emerald-600">Recebido</p>
        <h2 className="mt-2 text-3xl font-black text-slate-950">Questionario enviado</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-slate-500">
          Obrigado. Suas respostas foram salvas com seguranca e serao usadas para organizar o planejamento.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="sticky top-0 z-10 rounded-b-[2rem] border border-slate-200 bg-white/95 p-4 shadow-lg shadow-slate-200/70 backdrop-blur md:rounded-[2rem]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-violet-600">Progresso</p>
            <strong className="text-xl text-slate-950">{progress}% respondido</strong>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={status === "sending" || !respondentName.trim()}
            className="rounded-2xl bg-violet-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-violet-200 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {status === "sending" ? "Enviando..." : "Enviar respostas"}
          </button>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
        {error ? <p className="mt-3 text-sm font-bold text-rose-600">{error}</p> : null}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/70">
        <h2 className="text-lg font-black text-slate-950">Dados para contato</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-xs font-black uppercase text-slate-500">Nome completo *</span>
            <input value={respondentName} onChange={(event) => setRespondentName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-semibold outline-none focus:border-violet-500" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase text-slate-500">WhatsApp</span>
            <input value={respondentPhone} onChange={(event) => setRespondentPhone(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-semibold outline-none focus:border-violet-500" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase text-slate-500">Email</span>
            <input value={respondentEmail} onChange={(event) => setRespondentEmail(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-semibold outline-none focus:border-violet-500" />
          </label>
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.title} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/70">
          <p className="text-xs font-black uppercase tracking-widest text-violet-600">{section.title}</p>
          <div className="mt-5 space-y-5">
            {section.questions.map((question, index) => (
              <label key={question.id} className="block space-y-2">
                <span className="block text-sm font-black text-slate-900">
                  {index + 1}. {question.text}
                </span>
                <textarea
                  value={answers[question.id] || ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                  rows={3}
                  className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500"
                  placeholder="Responda aqui..."
                />
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
