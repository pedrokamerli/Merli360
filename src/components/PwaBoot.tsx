"use client";

import { useEffect } from "react";

export function PwaBoot() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // O app continua funcionando mesmo sem PWA.
    });

    const key = `merli360-local-due-${new Date().toISOString().slice(0, 10)}`;
    if (!("Notification" in window) || Notification.permission !== "granted" || localStorage.getItem(key)) return;

    fetch("/api/notifications/due", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const count = Number(data?.summary?.total ?? 0);
        if (count <= 0) return;
        localStorage.setItem(key, "1");
        new Notification("Merli360", {
          body: `${count} conta(s) vencendo ou atrasada(s) para conferir hoje.`,
          icon: "/icon.svg"
        });
      })
      .catch(() => undefined);
  }, []);

  return null;
}
