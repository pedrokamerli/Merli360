"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function GenerateReceivablesButton() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = useState("");

  async function generate() {
    setMessage("Gerando...");
    const response = await fetch("/api/generate-receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month })
    });
    const data = await response.json();
    setMessage(response.ok ? `${data.created} contas geradas para ${month}.` : data.error);
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-line bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-semibold">Gerar contas a receber recorrentes</p>
        <p className="text-sm text-muted">Cria cobranças do mês para clientes recorrentes e recebíveis marcados como recorrentes.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={month} onChange={(event) => setMonth(event.target.value)} type="month" className="rounded border border-line px-3 py-2" />
        <button onClick={generate} className="inline-flex items-center gap-2 rounded bg-accent px-4 py-2 text-sm font-semibold text-white">
          <RefreshCw size={16} />
          Gerar
        </button>
        {message ? <span className="text-sm text-muted">{message}</span> : null}
      </div>
    </div>
  );
}
