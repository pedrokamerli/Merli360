"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, Download, RefreshCw, Smartphone } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function DashboardSetupActions({ brandName }: { brandName: string }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [notificationsActive, setNotificationsActive] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState("Verificando notificacoes...");
  const [installStatus, setInstallStatus] = useState("Disponivel quando o navegador permitir instalar.");
  const [busy, setBusy] = useState(false);

  const canNotify = useMemo(() => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator, []);
  const doneKey = `quick-setup-done:${brandName}`;

  async function refreshSetupState(forceInstalled?: boolean, forceNotifications?: boolean) {
    const pwaInstalled = forceInstalled ?? isStandalone();
    let pushActive = forceNotifications ?? false;

    if (!forceNotifications && canNotify && Notification.permission === "granted" && "PushManager" in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        pushActive = Boolean(await registration.pushManager.getSubscription());
      } catch {
        pushActive = window.localStorage.getItem(`${doneKey}:notifications`) === "1";
      }
    }

    setInstalled(pwaInstalled);
    setNotificationsActive(pushActive);
    if (pwaInstalled) setInstallStatus("App instalado neste aparelho.");
    setNotificationStatus(pushActive ? "Notificacoes ativas neste aparelho." : "Ative para receber lembretes de vencimentos.");

    if (pwaInstalled && pushActive) {
      window.localStorage.setItem(doneKey, "1");
      setHidden(true);
    }
  }

  useEffect(() => {
    if (window.localStorage.getItem(doneKey) === "1" && isStandalone()) {
      setHidden(true);
      return;
    }

    refreshSetupState();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallStatus("Instalacao disponivel neste navegador.");
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallStatus("App instalado neste aparelho.");
      refreshSetupState(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [canNotify, doneKey]);

  async function installApp() {
    if (installed) {
      setInstallStatus("O app ja esta instalado neste aparelho.");
      return;
    }

    if (!installPrompt) {
      setInstallStatus("No iPhone, toque em Compartilhar e depois em Adicionar a Tela de Inicio. No Chrome, use Instalar app no menu.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setInstallStatus("App instalado com sucesso.");
      await refreshSetupState(true);
    } else {
      setInstallStatus("Instalacao cancelada. Voce pode tentar novamente pelo menu do navegador.");
    }
  }

  async function enableNotifications() {
    setBusy(true);
    try {
      if (!canNotify || !("PushManager" in window)) {
        setNotificationStatus("Este navegador nao suporta push. O PWA ainda pode ser instalado.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationStatus("Permissao negada. Ative nas configuracoes do navegador para receber alertas.");
        return;
      }

      const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
      const keyData = await keyResponse.json();
      if (!keyData.configured || !keyData.publicKey) {
        setNotificationStatus("Chaves VAPID nao configuradas no servidor.");
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
        setNotificationStatus(data?.error || "Nao foi possivel salvar este aparelho.");
        return;
      }

      await fetch("/api/push/test", { method: "POST" }).catch(() => undefined);
      window.localStorage.setItem(`${doneKey}:notifications`, "1");
      setNotificationsActive(true);
      setNotificationStatus("Notificacoes ativadas neste aparelho.");
      await refreshSetupState(undefined, true);
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  return (
    <section className="surface-panel p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="eyebrow">Configuracao rapida</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{brandName} no celular</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Instale como app e ative os avisos para vencimentos de contas a pagar e receber.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button className="primary-action" onClick={installApp} type="button">
            {installed ? <CheckCircle2 size={17} /> : <Download size={17} />}
            {installed ? "App instalado" : "Instalar app"}
          </button>
          <button className="secondary-action" onClick={enableNotifications} disabled={busy} type="button">
            {busy ? <RefreshCw className="animate-spin" size={17} /> : notificationsActive ? <CheckCircle2 size={17} /> : <Bell size={17} />}
            {notificationsActive ? "Notificacoes ativas" : "Ativar notificacoes"}
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-800">
            <Smartphone size={17} className="text-violet-600" />
            Instalacao PWA
          </div>
          <p className="mt-1 text-sm text-slate-500">{installStatus}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-800">
            <Bell size={17} className="text-emerald-600" />
            Notificacoes push
          </div>
          <p className="mt-1 text-sm text-slate-500">{notificationStatus}</p>
        </div>
      </div>
    </section>
  );
}
