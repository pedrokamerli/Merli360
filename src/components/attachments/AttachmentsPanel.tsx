"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Paperclip, RefreshCw, Upload } from "lucide-react";
import { formatDate } from "@/lib/format";

type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  linkedModel?: string | null;
  linkedId?: string | null;
  createdAt: string;
};

export function AttachmentsPanel() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");

  async function load() {
    const response = await fetch("/api/attachments", { cache: "no-store" });
    const data = await response.json();
    setItems(data.items ?? []);
  }

  async function upload() {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/attachments/upload", { method: "POST", body: form });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setStatus(data?.error || "Nao foi possivel enviar.");
      return;
    }
    setFile(null);
    setStatus("Comprovante enviado.");
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5">
      <header className="surface-panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Arquivos</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Comprovantes</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Envie comprovantes em PDF ou imagem. Eles ficam salvos com o banco local/VPS.</p>
        </div>
        <button className="secondary-action" onClick={load}>
          <RefreshCw size={17} />
          Atualizar
        </button>
      </header>

      <section className="surface-panel grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-end">
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Arquivo</span>
          <input className="form-control" type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button className="primary-action" onClick={upload} disabled={!file}>
          <Upload size={17} />
          Enviar comprovante
        </button>
        {status ? <p className="text-sm font-semibold text-slate-500 md:col-span-2">{status}</p> : null}
      </section>

      <section className="surface-panel overflow-hidden">
        <div className="divide-y divide-slate-100">
          {items.length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhum comprovante enviado ainda.</p> : null}
          {items.map((item) => (
            <a key={item.id} href={`/api/attachments/${item.id}`} target="_blank" className="flex items-center justify-between gap-4 p-5 hover:bg-slate-50">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                  <Paperclip size={19} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-950">{item.originalName}</p>
                  <p className="text-sm text-slate-500">{formatDate(item.createdAt)} - {(item.sizeBytes / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <ExternalLink className="shrink-0 text-slate-400" size={18} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
