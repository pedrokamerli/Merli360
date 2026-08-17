"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, CheckCircle2, Clock3, Download, Eye, FileArchive, FileText, ImageIcon, Loader2, MapPin, Paperclip, Upload } from "lucide-react";

type Row = Record<string, any>;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format(Number(cents || 0) / 100);
const shortDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(value));
const status = (value?: string) => ({ PENDING_REVIEW: "Em revisao pela Studium", PENDING: "Aguardando conferencia", RELEASED: "Preparado para producao", IN_PROGRESS: "Em producao", BLOCKED: "Em verificacao", COMPLETED: "Concluido", SCHEDULED: "Expedicao agendada", DELIVERED: "Entregue", ACCEPTED: "Aceite confirmado", COMPLAINT: "Em atendimento", SENT: "Enviado", VIEWED: "Visualizado", APPROVED: "Aprovado" } as Row)[value || ""] || value || "Aguardando";
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const customerPurposes = new Set(["ARTWORK", "CUSTOMER_ARTWORK", "LOGO", "DOCUMENT", "OTHER"]);
const finalPurposes = new Set(["FINAL_ARTWORK", "PROOF"]);

function quoteItemMeta(item: Row) {
  const parts = [`${decimal.format(Number(item.quantity || 0))} ${item.unit}`];
  if (item.width && item.height) parts.push(`${decimal.format(Number(item.width))} x ${decimal.format(Number(item.height))} mm`);
  if (item.area) parts.push(`area total ${decimal.format(Number(item.area))} m2`);
  parts.push(`prazo de ${item.deadlineDays || 7} dias`);
  return parts.join(" | ");
}

function shippingAddress(quote: Row) {
  return [[quote.shippingAddress, quote.shippingNumber].filter(Boolean).join(", "), quote.shippingComplement, quote.shippingDistrict, [quote.shippingCity, quote.shippingState].filter(Boolean).join(" / "), quote.shippingPostalCode ? `CEP ${quote.shippingPostalCode}` : ""].filter(Boolean).join(" - ");
}

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function AttachmentList({ items, empty }: { items: Row[]; empty: string }) {
  if (!items.length) return <p className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500">{empty}</p>;
  return <div className="grid gap-3 sm:grid-cols-2">{items.map((item) => {
    const preview = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(item.mimeType);
    return <a className="overflow-hidden rounded-lg border border-slate-200 bg-white hover:border-emerald-300" href={item.url} key={item.id} rel="noreferrer" target="_blank">
      {preview ? <img alt={`Visualizacao de ${item.originalName}`} className="aspect-video w-full object-contain bg-slate-100" src={item.url} /> : null}
      <span className="flex items-center gap-3 p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">{preview ? <ImageIcon size={18} /> : <FileArchive size={18} />}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm text-slate-900">{item.originalName}</b><small className="font-semibold text-slate-500">{fileSize(item.sizeBytes)}</small></span><Download className="shrink-0 text-emerald-600" size={17} /></span>
    </a>;
  })}</div>;
}

export function GraphicPublicQuotePortal({ token, quote }: { token: string; quote: Row }) {
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const order = quote.orders?.[0];
  const production = order?.productionOrders?.[0];
  const delivery = order?.deliveries?.[0];
  const steps = useMemo(() => production?.steps || [], [production]);
  const attachments = quote.attachments || [];
  const customerFiles = attachments.filter((item: Row) => customerPurposes.has(item.purpose));
  const finalFiles = attachments.filter((item: Row) => finalPurposes.has(item.purpose));
  const latestCustomerAt = customerFiles.length ? Math.max(...customerFiles.map((item: Row) => new Date(item.createdAt).getTime())) : 0;
  const latestFinalAt = finalFiles.length ? Math.max(...finalFiles.map((item: Row) => new Date(item.createdAt).getTime())) : 0;
  const finalMatchesCustomerFiles = latestFinalAt >= latestCustomerAt;
  const finalArtworkApproved = Boolean(production?.events?.some((item: Row) => item.action === "FINAL_ARTWORK_APPROVED" && new Date(item.createdAt).getTime() >= Math.max(latestFinalAt, latestCustomerAt)));
  const delivered = ["DELIVERED", "ACCEPTED"].includes(delivery?.status);
  const pendingReview = quote.status === "PENDING_REVIEW";
  const canApprove = ["SENT", "VIEWED"].includes(quote.status);
  const canUploadArtwork = Boolean(order && ["PENDING", "BLOCKED"].includes(production?.status));
  const orderMessage = delivered ? "Pedido entregue. Obrigado por acompanhar com a gente." : production?.status === "COMPLETED" ? "Producao concluida. A equipe esta preparando a expedicao." : production?.status === "IN_PROGRESS" ? "Seu pedido esta em producao. Acompanhe cada etapa abaixo." : finalArtworkApproved ? "Arte final aprovada. O pedido esta pronto para a conferencia da producao." : "Envie seus arquivos e acompanhe a preparacao da arte final.";

  async function approve() {
    setBusyAction("quote");
    const response = await fetch(`/api/gestao-grafica/public-quotes/${token}?action=approve`, { method: "POST" });
    const body = await response.json();
    setBusyAction("");
    if (!response.ok) return setMessage(body.error || "Nao foi possivel aprovar agora.");
    setConfirmingApproval(false);
    window.location.reload();
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const input = formElement.elements.namedItem("files") as HTMLInputElement | null;
    const files = Array.from(input?.files || []);
    if (!files.length) return setMessage("Selecione pelo menos um arquivo para enviar.");
    setBusyAction("upload");
    setMessage("");
    let sent = 0;
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/gestao-grafica/public-quotes/${token}?action=artwork`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        setBusyAction("");
        return setMessage(`${file.name}: ${body.error || "nao foi possivel enviar"}`);
      }
      sent += 1;
    }
    setMessage(`${sent} arquivo(s) recebido(s). A producao ja pode visualizar.`);
    formElement.reset();
    window.setTimeout(() => window.location.reload(), 700);
  }

  async function approveFinalArtwork() {
    setBusyAction("final");
    setMessage("");
    const response = await fetch(`/api/gestao-grafica/public-quotes/${token}?action=approve-final-artwork`, { method: "POST" });
    const body = await response.json();
    setBusyAction("");
    if (!response.ok) return setMessage(body.error || "Nao foi possivel aprovar a arte final.");
    setMessage("Arte final aprovada. A equipe de producao foi avisada.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  return <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
    <header className="surface-panel p-5"><p className="eyebrow">Acompanhamento do pedido</p><div className="mt-1 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black text-slate-950">{order ? `Pedido #${order.number}` : `Orcamento #${quote.number}`}</h1>{order ? <p className="mt-1 text-xs font-bold text-slate-500">Originado do orcamento #{quote.number}</p> : null}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{status(order ? production?.status : quote.status)}</span></div><p className="mt-2 text-sm font-semibold text-slate-500">{quote.tenant?.brandName || "Merli360"} | Orcamento valido ate {shortDate(quote.validUntil)}</p></header>

    {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}

    {pendingReview ? <section className="surface-panel border-amber-200 bg-amber-50 p-5"><div className="flex gap-3"><Clock3 className="shrink-0 text-amber-700" size={22} /><div><h2 className="font-black text-amber-950">Solicitacao recebida</h2><p className="mt-1 text-sm font-semibold text-amber-800">A equipe Studium esta conferindo os itens, o frete e o prazo. Este mesmo link sera liberado para sua aprovacao.</p></div></div></section> : null}

    <section className="surface-panel p-5" id="pedido"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Eye className="text-emerald-600" size={18} /><h2 className="font-black text-slate-950">Pedido completo</h2></div><p className="mt-1 text-sm text-slate-500">{quote.paymentTerms || "Condicao a combinar"}</p></div><div className="text-right"><small className="block font-bold text-slate-500">{pendingReview ? "Subtotal preliminar" : "Total"}</small><strong className="text-xl text-slate-950">{brl(quote.totalPriceCents)}</strong></div></div><div className="mt-4 divide-y rounded-lg border border-slate-200">{quote.items.map((item: Row) => <div key={item.id} className="flex flex-col justify-between gap-2 p-3 text-sm sm:flex-row"><span><b>{item.description}</b><br /><small className="font-semibold text-slate-500">{quoteItemMeta(item)}</small></span><b>{brl(item.priceCents)}</b></div>)}</div>{quote.freightCents ? <p className="mt-3 flex justify-between text-sm font-bold text-slate-600"><span>Frete</span><span>{brl(quote.freightCents)}</span></p> : null}{shippingAddress(quote) ? <p className="mt-4 flex gap-2 text-sm font-semibold text-slate-600"><MapPin className="shrink-0 text-emerald-600" size={17} />{shippingAddress(quote)}</p> : null}{!order && !pendingReview ? <div className="mt-4"><div className="flex flex-wrap gap-2"><button className="primary-action inline-flex items-center gap-2 px-4 py-2" disabled={Boolean(busyAction) || !canApprove} type="button" onClick={() => setConfirmingApproval(true)}><CheckCircle2 size={16} />Aprovar orcamento</button><a className="secondary-action inline-flex items-center gap-2 px-4 py-2" href={`/api/gestao-grafica/public-quotes/${token}/pdf`} target="_blank" rel="noreferrer"><FileText size={16} />Baixar PDF</a></div>{confirmingApproval ? <div className="mt-4 border-t border-slate-200 pt-4"><p className="font-black text-slate-950">Confirmar aprovacao de {brl(quote.totalPriceCents)}?</p><p className="mt-1 text-sm font-semibold text-slate-600">Ao confirmar, a equipe recebe o pedido e prepara a ordem de producao.</p><div className="mt-3 flex flex-wrap gap-2"><button className="secondary-action px-4 py-2" type="button" disabled={Boolean(busyAction)} onClick={() => setConfirmingApproval(false)}>Voltar</button><button className="primary-action inline-flex items-center gap-2 px-4 py-2" type="button" disabled={Boolean(busyAction)} onClick={() => void approve()}>{busyAction === "quote" ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Confirmar aprovacao</button></div></div> : null}</div> : null}</section>

    {order ? <>
      <section className="surface-panel p-5"><div className="flex items-start gap-3"><Paperclip className="mt-0.5 shrink-0 text-emerald-600" size={20} /><div><h2 className="font-black text-slate-950">Arquivos enviados para producao</h2><p className="mt-1 text-sm font-semibold text-slate-500">Logo, arte, medidas, referencias e arquivos editaveis ficam vinculados ao pedido #{order.number}.</p></div></div><div className="mt-4"><AttachmentList empty="Nenhum arquivo enviado ainda." items={customerFiles} /></div>{canUploadArtwork ? <form className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4" onSubmit={upload}><label className="grid gap-2 text-sm font-black text-slate-700"><span>Adicionar arquivos do pedido</span><input className="block w-full text-sm font-semibold file:mr-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:font-bold file:text-white" multiple name="files" type="file" /></label><p className="mt-2 text-xs font-semibold text-slate-500">Imagens, PDF, CDR, AI, PSD, EPS, SVG, TIFF, documentos e ZIP/RAR/7Z. Ate 100 MB por arquivo.</p><button className="primary-action mt-3 inline-flex items-center justify-center gap-2 px-4 py-2" disabled={Boolean(busyAction)}>{busyAction === "upload" ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}Enviar para a producao</button></form> : <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">A producao ja foi liberada. Fale com a equipe antes de substituir arquivos.</p>}</section>

      <section className="surface-panel p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ImageIcon className="text-emerald-600" size={20} /><h2 className="font-black text-slate-950">Arte final para aprovacao</h2></div><p className="mt-1 text-sm font-semibold text-slate-500">Confira com atencao textos, cores, medidas e posicionamento antes da producao.</p></div>{finalArtworkApproved ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"><Check size={14} />Aprovada</span> : null}</div><div className="mt-4"><AttachmentList empty="A equipe ainda esta preparando a arte final." items={finalFiles} /></div>{finalFiles.length && !finalMatchesCustomerFiles ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">Voce enviou um arquivo mais recente. Aguarde a equipe publicar uma nova versao da arte final.</p> : null}{finalFiles.length && finalMatchesCustomerFiles && !finalArtworkApproved ? <button className="primary-action mt-4 inline-flex items-center gap-2 px-4 py-3" disabled={Boolean(busyAction)} onClick={() => void approveFinalArtwork()} type="button">{busyAction === "final" ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}Aprovar esta arte final</button> : null}{finalArtworkApproved ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">Aprovacao registrada. Esta e a versao liberada para producao.</p> : null}</section>

      <section className="surface-panel p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-950">Jornada de producao</h2><p className="mt-1 text-sm font-semibold text-emerald-700">{orderMessage}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{status(production?.status)}</span></div><div className="mt-4 space-y-2">{steps.map((step: Row) => <div key={step.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"><span className="font-bold text-slate-800">{step.name}</span><span className={step.status === "COMPLETED" ? "font-black text-emerald-700" : "font-black text-slate-500"}>{status(step.status)}</span></div>)}</div>{delivery ? <p className="mt-4 text-sm font-semibold text-slate-600">Entrega: {status(delivery.status)}{delivery.expectedAt ? ` | previsao ${shortDate(delivery.expectedAt)}` : ""}</p> : null}</section>
    </> : null}
  </main>;
}
