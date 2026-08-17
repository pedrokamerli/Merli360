"use client";

import { Check, Copy, ExternalLink, Loader2, MapPin, MessageCircle, ShoppingCart } from "lucide-react";
import { useState } from "react";

type Row = Record<string, any>;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format(Number(cents || 0) / 100);

function address(item: Row) {
  return [
    [item.shippingAddress, item.shippingNumber].filter(Boolean).join(", "),
    item.shippingComplement,
    item.shippingDistrict,
    [item.shippingCity, item.shippingState].filter(Boolean).join(" / "),
    item.shippingPostalCode ? `CEP ${item.shippingPostalCode}` : ""
  ].filter(Boolean).join(" - ");
}

export function GraphicCatalogRequestsPanel({ requests, compact = false }: { requests: Row[]; compact?: boolean }) {
  const [freights, setFreights] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [approved, setApproved] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function approve(item: Row) {
    setBusyId(item.id);
    setMessage("");
    const freightCents = Math.max(0, Math.round(Number(freights[item.id] || 0) * 100));
    const response = await fetch("/api/gestao-grafica/quotes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action: "approve-catalog-request", freightCents }) });
    const body = await response.json();
    setBusyId("");
    if (!response.ok) return setMessage(body.error || "Nao foi possivel liberar a solicitacao.");
    setApproved((current) => ({ ...current, [item.id]: body.publicPath }));
    setMessage(`Orcamento #${item.number} revisado e liberado para o cliente.`);
  }

  async function copy(path: string) {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setMessage("Link do orcamento copiado.");
  }

  function whatsapp(item: Row, path: string) {
    const phone = String(item.client?.whatsapp || item.client?.phone || "").replace(/\D/g, "").replace(/^55/, "");
    if (!phone) return setMessage("O cliente nao possui WhatsApp cadastrado.");
    const text = `Ola! Seu orcamento #${item.number} foi revisado. Veja os itens, baixe o PDF e aprove por aqui: ${window.location.origin}${path}`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return <section className="surface-panel p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ShoppingCart className="text-emerald-600" size={18} /><h2 className="font-black text-slate-950">Solicitacoes do catalogo</h2></div><p className="mt-1 text-sm font-semibold text-slate-500">Confira produtos e endereco, informe o frete e libere o link para o cliente.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{requests.length} pendente(s)</span></div>{message ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}<div className={`mt-4 grid gap-3 ${compact ? "" : "xl:grid-cols-2"}`}>{requests.map((item) => { const publicPath = approved[item.id]; return <article className="rounded-lg border border-slate-200 bg-white p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-emerald-700">Orcamento #{item.number}</p><h3 className="mt-1 text-lg font-black text-slate-950">{item.client?.name || "Cliente do catalogo"}</h3><p className="text-xs font-semibold text-slate-500">{item.client?.phone || item.client?.whatsapp || item.client?.email || "Contato nao informado"}</p></div><strong className="text-lg text-slate-950">{brl(item.totalPriceCents)}</strong></div><div className="mt-3 divide-y rounded-lg border border-slate-100 bg-slate-50">{(item.items || []).map((quoteItem: Row) => <div className="flex justify-between gap-3 p-2.5 text-xs" key={quoteItem.id}><span className="font-bold text-slate-700">{quoteItem.description}<small className="block text-slate-500">{quoteItem.quantity} unidade(s)</small></span><b>{brl(quoteItem.priceCents)}</b></div>)}</div><p className="mt-3 flex gap-2 text-xs font-semibold text-slate-600"><MapPin className="shrink-0 text-emerald-600" size={15} />{address(item) || "Endereco nao informado"}</p>{publicPath ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="flex items-center gap-2 text-sm font-black text-emerald-800"><Check size={16} />Liberado para o cliente</p><div className="mt-3 flex flex-wrap gap-2"><button className="secondary-action inline-flex items-center gap-2 px-3 py-2 text-xs" type="button" onClick={() => void copy(publicPath)}><Copy size={14} />Copiar link</button><a className="secondary-action inline-flex items-center gap-2 px-3 py-2 text-xs" href={publicPath} target="_blank" rel="noreferrer"><ExternalLink size={14} />Abrir</a><button className="primary-action inline-flex items-center gap-2 px-3 py-2 text-xs" type="button" onClick={() => whatsapp(item, publicPath)}><MessageCircle size={14} />WhatsApp</button></div></div> : <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="grid gap-1 text-xs font-black text-slate-600"><span>Frete para este endereco (R$)</span><input className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" type="number" min="0" step="0.01" placeholder="0,00" value={freights[item.id] || ""} onChange={(event) => setFreights((current) => ({ ...current, [item.id]: event.target.value }))} /></label><button className="primary-action mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5" type="button" disabled={busyId === item.id} onClick={() => void approve(item)}>{busyId === item.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}Revisar e liberar</button></div>}</article>; })}{!requests.length ? <p className="rounded-lg bg-slate-50 p-5 text-sm font-bold text-slate-500">Nenhuma solicitacao nova no catalogo.</p> : null}</div></section>;
}
