"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, RefreshCw, Send } from "lucide-react";
import { formatDate, money } from "@/lib/format";

type DueItem = {
  id: string;
  label: string;
  description: string;
  contact?: string | null;
  dueDate: string;
  amount: number;
  href: string;
};

type DueResponse = {
  items: DueItem[];
  summary: { total: number; overdue: number; dueToday: number; upcoming: number };
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function NotificationsPanel() {
  const [due, setDue] = useState<DueResponse | null>(null);
  const [status, setStatus] = useState("Carregando vencimentos...");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/notifications/due", { cache: "no-store" });
    const data = await response.json();
    setDue(data);
    setStatus(data.summary.total ? `${data.summary.total} pendencia(s) para acompanhar.` : "Nenhum vencimento proximo.");
  }

  async function enablePush() {
    setBusy(true);
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("Este navegador nao suporta push. A instalacao PWA ainda funciona.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("Permissao de notificacao negada no navegador.");
        return;
      }

      const keyResponse = await fetch("/api/push/public-key");
      const keyData = await keyResponse.json();
      if (!keyData.configured) {
        setStatus("Notificacao local ativada. Para push mesmo com o app fechado, configure as chaves VAPID na VPS.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
        }));

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatus(data?.error || "Nao foi possivel ativar push.");
        return;
      }

      setStatus("Notificacoes ativadas neste aparelho.");
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    setBusy(true);
    const response = await fetch("/api/notifications/send-due", { method: "POST" });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setStatus(data?.error || "Nao foi possivel enviar notificacao.");
      return;
    }
    if (data.configured === false) setStatus("Chaves VAPID ainda nao configuradas na VPS.");
    else setStatus(`Disparo feito: ${data.sent ?? 0} enviado(s), ${data.failed ?? 0} falha(s).`);
  }

  useEffect(() => {
    load().catch(() => setStatus("Nao foi possivel carregar os vencimentos."));
  }, []);

  return (
    <div className="space-y-5">
      <header className="surface-panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">PWA e alertas</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Notificacoes</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Ative no celular para receber lembretes de contas a pagar e a receber.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-action" onClick={load} disabled={busy}>
            <RefreshCw size={17} />
            Atualizar
          </button>
          <button className="secondary-action" onClick={sendNow} disabled={busy}>
            <Send size={17} />
            Enviar agora
          </button>
          <button className="primary-action" onClick={enablePush} disabled={busy}>
            <Bell size={17} />
            Ativar no celular
          </button>
        </div>
      </header>

      <section className="surface-panel p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="text-emerald-500" size={22} />
          <p className="font-semibold text-slate-800">{status}</p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {[
          ["Total", due?.summary.total ?? 0],
          ["Atrasadas", due?.summary.overdue ?? 0],
          ["Hoje", due?.summary.dueToday ?? 0],
          ["Proximas", due?.summary.upcoming ?? 0]
        ].map(([label, value]) => (
          <div key={label} className="surface-panel p-5">
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="surface-panel overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h3 className="text-lg font-bold text-slate-950">Vencimentos para acompanhar</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {(due?.items ?? []).length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhuma conta vencendo nos proximos dias.</p> : null}
          {(due?.items ?? []).map((item) => (
            <a key={`${item.label}-${item.id}`} href={item.href} className="block p-5 transition hover:bg-slate-50">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-violet-600">{item.label}</p>
                  <p className="mt-1 font-bold text-slate-950">{item.description}</p>
                  <p className="text-sm text-slate-500">{item.contact || "Sem contato vinculado"} - vence em {formatDate(item.dueDate)}</p>
                </div>
                <p className="text-lg font-black text-slate-950">{money.format(item.amount)}</p>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
