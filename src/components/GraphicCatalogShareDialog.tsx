"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, X } from "lucide-react";

type Contact = { id?: string; name?: string; companyName?: string; phone?: string; contact?: string; normalizedPhone?: string };

export function GraphicCatalogShareDialog({ open, onClose, contacts = [] }: { open: boolean; onClose: () => void; contacts?: Contact[] }) {
  const [path, setPath] = useState("");
  const [contactId, setContactId] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const contact = useMemo(() => contacts.find((item, index) => (item.id || String(index)) === contactId), [contactId, contacts]);
  const url = typeof window === "undefined" || !path ? path : `${window.location.origin}${path}`;

  useEffect(() => {
    if (!open) return;
    setError("");
    fetch("/api/gestao-grafica/catalog", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => ok ? setPath(body.publicPath) : setError(body.error || "Nao foi possivel abrir o catalogo."))
      .catch(() => setError("Nao foi possivel abrir o catalogo."));
  }, [open]);

  useEffect(() => {
    if (!contact) return;
    setPhone(String(contact.normalizedPhone || contact.phone || contact.contact || ""));
  }, [contact]);

  if (!open) return null;
  const name = contact?.companyName || contact?.name || "";
  const digits = phone.replace(/\D/g, "").replace(/^55/, "");
  const text = `Ola${name ? `, ${name}` : ""}! Segue o catalogo da Studium com produtos, medidas, kits e valores: ${url}`;

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" onMouseDown={onClose}>
    <section className="w-full max-w-xl rounded-lg bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Catalogo publico</p><h2 className="text-xl font-black text-slate-950">Enviar catalogo ao cliente</h2><p className="mt-1 text-sm font-semibold text-slate-500">Escolha o contato ou informe o WhatsApp.</p></div><button className="icon-action" type="button" title="Fechar" onClick={onClose}><X size={18} /></button></div>
      {error ? <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p> : null}
      <div className="mt-5 grid gap-3">
        {contacts.length ? <label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Cliente ou lead</span><select className="form-control normal-case" value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">Selecione ou digite o telefone</option>{contacts.map((item, index) => <option key={item.id || index} value={item.id || String(index)}>{item.companyName || item.name || "Contato sem nome"}</option>)}</select></label> : null}
        <label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>WhatsApp</span><input className="form-control normal-case" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(14) 99999-9999" /></label>
        <label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Link</span><div className="flex gap-2"><input className="form-control min-w-0 flex-1 normal-case" readOnly value={url || "Carregando..."} /><button className="icon-action shrink-0" type="button" title="Copiar link" disabled={!url} onClick={() => void copy()}>{copied ? <Check size={18} /> : <Copy size={18} />}</button><a className="icon-action shrink-0" title="Abrir catalogo" href={url || "#"} target="_blank" rel="noreferrer"><ExternalLink size={18} /></a></div></label>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="secondary-action px-4 py-2" type="button" onClick={onClose}>Fechar</button><a className={`primary-action inline-flex items-center justify-center gap-2 px-4 py-2 ${!digits || !url ? "pointer-events-none opacity-50" : ""}`} href={digits && url ? `https://wa.me/55${digits}?text=${encodeURIComponent(text)}` : "#"} target="_blank" rel="noreferrer"><MessageCircle size={17} />Enviar pelo WhatsApp</a></div>
    </section>
  </div>;
}
