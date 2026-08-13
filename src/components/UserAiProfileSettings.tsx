"use client";

import { useEffect, useState } from "react";
import { Save, UserRoundCog } from "lucide-react";

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

export function UserAiProfileSettings() {
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/assistant/profile", { cache: "no-store" });
    const data = await response.json();
    if (data.profile) setProfile(data.profile);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProfile() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/assistant/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...profile,
        assistantName: profile.assistantName || "Assistente 360"
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Nao foi possivel salvar suas configuracoes.");
    } else {
      setProfile(data.profile);
      setMessage("Suas configuracoes da IA foram salvas.");
    }
    setSaving(false);
  }

  return (
    <section className="surface-panel p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <UserRoundCog size={22} />
        </div>
        <div>
          <p className="eyebrow">Minha IA</p>
          <h2 className="text-lg font-black text-slate-950">Configuracoes do usuario</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Essas metas, memoria e preferencias sao suas. Outros usuarios nao veem nem usam essa memoria.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Nome de quem vai usar</span>
          <input className="form-control" value={profile.ownerName || ""} onChange={(event) => setProfile({ ...profile, ownerName: event.target.value })} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Nome da assistente</span>
          <input className="form-control" value={profile.assistantName || ""} onChange={(event) => setProfile({ ...profile, assistantName: event.target.value })} />
        </label>
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Metas e objetivos financeiros</span>
          <textarea
            className="form-control min-h-[180px]"
            placeholder="Ex: separar pessoal do MEI, manter PJ Santander com saldo minimo, pagar contas em dia, guardar reserva..."
            value={profile.goalsText || ""}
            onChange={(event) => setProfile({ ...profile, goalsText: event.target.value })}
          />
        </label>
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">Memoria da IA</span>
          <textarea
            className="form-control min-h-[170px]"
            placeholder="Resumo duravel que a IA usa para entender rotina, contas, objetivos e preferencias."
            value={profile.memoryText || ""}
            onChange={(event) => setProfile({ ...profile, memoryText: event.target.value })}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="primary-action" onClick={saveProfile} disabled={saving}>
          <Save size={17} />
          {saving ? "Salvando..." : "Salvar minhas configuracoes"}
        </button>
        {message ? <span className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{message}</span> : null}
      </div>
    </section>
  );
}
