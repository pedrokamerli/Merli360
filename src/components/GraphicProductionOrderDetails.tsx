"use client";

import { FormEvent, useState } from "react";
import { Check, Download, ExternalLink, FileArchive, ImageIcon, Loader2, MapPin, MessageCircle, Paperclip, Upload, X } from "lucide-react";

type Row = Record<string, any>;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const customerPurposes = new Set(["ARTWORK", "CUSTOMER_ARTWORK", "LOGO", "DOCUMENT", "OTHER"]);
const finalPurposes = new Set(["FINAL_ARTWORK", "PROOF"]);

function brl(cents: number) {
  return money.format(Number(cents || 0) / 100);
}

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function orderAddress(order: Row) {
  const quote = order.quote || {};
  const client = order.client || {};
  return [
    [quote.shippingAddress || client.address, quote.shippingNumber || client.addressNumber].filter(Boolean).join(", "),
    quote.shippingComplement,
    quote.shippingDistrict || client.district,
    [quote.shippingCity || client.city, quote.shippingState || client.state].filter(Boolean).join(" / "),
    quote.shippingPostalCode || client.zipCode ? `CEP ${quote.shippingPostalCode || client.zipCode}` : ""
  ].filter(Boolean).join(" - ");
}

function itemMeta(item: Row) {
  return [
    `${decimal.format(Number(item.quantity || 0))} ${item.unit || "unidade"}`,
    item.width && item.height ? `${decimal.format(item.width)} x ${decimal.format(item.height)} mm` : "",
    item.area ? `${decimal.format(item.area)} m2` : "",
    item.deadlineDays ? `prazo ${item.deadlineDays} dias` : ""
  ].filter(Boolean).join(" | ");
}

function FileGrid({ items, empty }: { items: Row[]; empty: string }) {
  if (!items.length) return <p className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500">{empty}</p>;
  return <div className="grid gap-3 sm:grid-cols-2">{items.map((item) => {
    const preview = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(item.attachment?.mimeType);
    return <a className="overflow-hidden rounded-lg border border-slate-200 bg-white hover:border-emerald-300" href={item.url} key={item.id} rel="noreferrer" target="_blank">
      {preview ? <img alt={`Arquivo ${item.attachment?.originalName || "da producao"}`} className="aspect-video w-full bg-slate-100 object-contain" src={item.url} /> : null}
      <span className="flex items-center gap-3 p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">{preview ? <ImageIcon size={18} /> : <FileArchive size={18} />}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm text-slate-900">{item.attachment?.originalName || "Arquivo"}</b><small className="font-semibold text-slate-500">{fileSize(item.attachment?.sizeBytes || 0)}</small></span><Download className="shrink-0 text-emerald-600" size={17} /></span>
    </a>;
  })}</div>;
}

export function GraphicProductionOrderDetails({ production, order, onClose, onContinue, onUpdated }: { production: Row; order: Row; onClose: () => void; onContinue: () => void; onUpdated: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const attachments = production.attachments || [];
  const customerFiles = attachments.filter((item: Row) => customerPurposes.has(item.purpose));
  const finalFiles = attachments.filter((item: Row) => finalPurposes.has(item.purpose));
  const latestCustomerAt = customerFiles.length ? Math.max(...customerFiles.map((item: Row) => new Date(item.createdAt).getTime())) : 0;
  const latestFinalAt = finalFiles.length ? Math.max(...finalFiles.map((item: Row) => new Date(item.createdAt).getTime())) : 0;
  const finalArtworkApproved = Boolean(production.events?.some((item: Row) => item.action === "FINAL_ARTWORK_APPROVED" && new Date(item.createdAt).getTime() >= Math.max(latestCustomerAt, latestFinalAt)));
  const quote = order.quote || {};
  const client = order.client || {};
  const phone = String(client.whatsapp || client.phone || "").replace(/\D/g, "");
  const publicPath = quote.shareToken ? `/public/orcamento/${quote.shareToken}` : "";

  async function uploadFinalArtwork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const input = formElement.elements.namedItem("files") as HTMLInputElement | null;
    const files = Array.from(input?.files || []);
    if (!files.length) return setMessage("Selecione pelo menos um arquivo de arte final.");
    setBusy(true);
    setMessage("");
    let sent = 0;
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      form.append("linkedModel", "production");
      form.append("linkedId", production.id);
      form.append("purpose", "FINAL_ARTWORK");
      const response = await fetch("/api/gestao-grafica/attachments", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        setBusy(false);
        return setMessage(`${file.name}: ${body.error || "nao foi possivel anexar"}`);
      }
      sent += 1;
    }
    formElement.reset();
    setMessage(`${sent} arquivo(s) de arte final publicado(s) para o cliente.`);
    await onUpdated();
    setBusy(false);
  }

  function sendWhatsApp() {
    if (!phone || !publicPath) return;
    const link = `${window.location.origin}${publicPath}`;
    const text = `Ola, ${client.name || "cliente"}. A arte final do pedido #${order.number} esta pronta para conferencia e aprovacao: ${link}`;
    window.open(`https://wa.me/55${phone.replace(/^55/, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return <div className="fixed inset-0 z-[70] bg-slate-950/55 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Pedido ${order.number}`}>
    <article className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[calc(100vh-2rem)] sm:rounded-lg">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6"><div><p className="text-xs font-black uppercase text-emerald-700">Ficha completa de producao</p><h2 className="mt-1 text-2xl font-black text-slate-950">Pedido #{order.number}</h2><p className="mt-1 text-sm font-semibold text-slate-500">Orcamento #{quote.number || "-"} | {client.name || "Cliente sem nome"}</p></div><button className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600" onClick={onClose} title="Fechar" type="button"><X size={18} /></button></header>

      <div className="flex-1 space-y-7 overflow-y-auto px-4 py-5 sm:px-6">
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}

        <section><h3 className="text-base font-black text-slate-950">Cliente e entrega</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><small className="font-black uppercase text-slate-500">Cliente</small><p className="mt-1 font-bold text-slate-900">{client.name || "Nao informado"}</p></div><div className="rounded-lg bg-slate-50 p-3"><small className="font-black uppercase text-slate-500">Contato</small><p className="mt-1 font-bold text-slate-900">{client.whatsapp || client.phone || client.email || "Nao informado"}</p></div><div className="rounded-lg bg-slate-50 p-3"><small className="font-black uppercase text-slate-500">Valor do pedido</small><p className="mt-1 font-bold text-slate-900">{brl(quote.totalPriceCents || order.soldValueCents)}</p></div></div>{orderAddress(order) ? <p className="mt-3 flex gap-2 rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-700"><MapPin className="shrink-0 text-emerald-600" size={18} />{orderAddress(order)}</p> : null}</section>

        <section><div className="flex items-end justify-between gap-3"><div><h3 className="text-base font-black text-slate-950">Itens que serao produzidos</h3><p className="mt-1 text-sm font-semibold text-slate-500">Confira descricao, quantidade e medidas antes de tocar na producao.</p></div><strong className="text-lg text-slate-950">{brl(quote.totalPriceCents || order.soldValueCents)}</strong></div><div className="mt-3 divide-y rounded-lg border border-slate-200">{(quote.items || order.items || []).map((item: Row) => <div className="flex flex-col justify-between gap-2 p-3 sm:flex-row" key={item.id}><div><b className="text-sm text-slate-900">{item.description}</b><p className="mt-1 text-xs font-semibold text-slate-500">{itemMeta(item)}</p></div><b className="text-sm text-slate-900">{brl(item.priceCents)}</b></div>)}</div>{quote.notes ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900"><b>Observacoes:</b> {quote.notes}</p> : null}</section>

        <section><div className="flex items-center gap-2"><Paperclip className="text-emerald-600" size={19} /><h3 className="text-base font-black text-slate-950">Arquivos enviados pelo cliente</h3></div><p className="mt-1 text-sm font-semibold text-slate-500">Estes arquivos chegaram pelo link do pedido e ja estao vinculados a esta ordem.</p><div className="mt-3"><FileGrid empty="O cliente ainda nao enviou nenhum arquivo." items={customerFiles} /></div></section>

        <section><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ImageIcon className="text-emerald-600" size={19} /><h3 className="text-base font-black text-slate-950">Arte final para o cliente</h3></div><p className="mt-1 text-sm font-semibold text-slate-500">Publique a prova final e envie o mesmo link do pedido pelo WhatsApp.</p></div>{finalArtworkApproved ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"><Check size={14} />Aprovada pelo cliente</span> : finalFiles.length ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">Aguardando aprovacao</span> : null}</div><div className="mt-3"><FileGrid empty="Nenhuma arte final publicada ainda." items={finalFiles} /></div><form className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4" onSubmit={uploadFinalArtwork}><label className="grid gap-2 text-sm font-black text-slate-700"><span>Enviar nova versao da arte final</span><input className="block w-full text-sm font-semibold file:mr-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:font-bold file:text-white" multiple name="files" type="file" /></label><p className="mt-2 text-xs font-semibold text-slate-500">Ao enviar uma nova versao, a aprovacao anterior e cancelada. Limite de 100 MB por arquivo.</p><div className="mt-3 flex flex-wrap gap-2"><button className="primary-action inline-flex items-center gap-2 px-4 py-2" disabled={busy} type="submit">{busy ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}Publicar arte final</button><button className="secondary-action inline-flex items-center gap-2 px-4 py-2 disabled:opacity-50" disabled={!finalFiles.length || !phone || !publicPath} onClick={sendWhatsApp} type="button"><MessageCircle size={16} />Enviar arte final no WhatsApp</button>{publicPath ? <a className="secondary-action inline-flex items-center gap-2 px-4 py-2" href={publicPath} rel="noreferrer" target="_blank"><ExternalLink size={16} />Abrir como cliente</a> : null}</div>{!phone ? <p className="mt-2 text-xs font-bold text-amber-700">Cadastre o telefone do cliente para liberar o WhatsApp.</p> : null}</form></section>
      </div>

      <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-4 sm:flex-row sm:justify-end sm:px-6"><button className="secondary-action px-4 py-2" onClick={onClose} type="button">Fechar</button><button className="primary-action px-4 py-2" onClick={onContinue} type="button">Pedido conferido, continuar na producao</button></footer>
    </article>
  </div>;
}
