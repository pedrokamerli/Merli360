"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, Loader2, Plus, RefreshCw, Save, Search } from "lucide-react";

type Row = Record<string, any>;
const inputClass = "min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format(Number(cents || 0) / 100);
const moneyText = (cents: number) => (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
const moneyCents = (value: string) => Math.round(Number(String(value || "0").replace(/\./g, "").replace(",", ".")) * 100) || 0;

function imageStyle(item: Row) {
  const isSprite = String(item.imageUrl || "").includes("catalog-studium-products.png");
  return { backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined, backgroundPosition: item.imagePosition || "center", backgroundRepeat: "no-repeat", backgroundSize: isSprite ? "300% 200%" : "cover" };
}

function startingPrice(item: Row) {
  const prices = item.variants.map((row: Row) => Number(row.priceCents)).filter((price: number) => price > 0);
  return prices.length ? Math.min(...prices) : 0;
}

export function GraphicCatalogWorkspace() {
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showNewVariant, setShowNewVariant] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", category: "Catalogo", description: "", imageUrl: "" });
  const [newVariant, setNewVariant] = useState({ label: "", quantity: "1", widthMm: "", heightMm: "", price: "", cost: "" });
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/gestao-grafica/catalog?all=1", { cache: "no-store" });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) return setNotice(body.error || "Nao foi possivel carregar o catalogo.");
    setData(body);
    setSelectedId((current) => current && body.items.some((item: Row) => item.id === current) ? current : body.items[0]?.id || "");
  }

  useEffect(() => { void load(); }, []);
  const items = data?.items || [];
  const selected = items.find((item: Row) => item.id === selectedId);
  const variants = useMemo(() => (selected?.variants || []).filter((variant: Row) => `${variant.label} ${variant.sku || ""}`.toLowerCase().includes(variantSearch.toLowerCase())), [selected, variantSearch]);
  const variant = selected?.variants?.find((item: Row) => item.id === variantId) || variants[0];
  const publicUrl = typeof window === "undefined" || !data?.publicPath ? data?.publicPath || "" : `${window.location.origin}${data.publicPath}`;

  useEffect(() => { setVariantId(variants[0]?.id || ""); }, [selectedId, variantSearch]);

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/gestao-grafica/catalog", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update-item", id: selected.id, name: form.get("name"), category: form.get("category"), description: form.get("description"), imageUrl: form.get("imageUrl"), imagePosition: form.get("imagePosition"), status: form.get("status"), featured: form.get("featured") === "on", sortOrder: form.get("sortOrder") }) });
    const body = await response.json(); setSaving(false); setNotice(response.ok ? "Produto atualizado no catalogo." : body.error || "Nao foi possivel atualizar."); if (response.ok) await load();
  }

  async function saveVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!variant) return; setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/gestao-grafica/catalog", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update-variant", id: variant.id, label: form.get("label"), sku: form.get("sku"), quantity: form.get("quantity"), widthMm: form.get("widthMm"), heightMm: form.get("heightMm"), priceCents: moneyCents(String(form.get("price") || "")), costCents: moneyCents(String(form.get("cost") || "")), status: form.get("status") }) });
    const body = await response.json(); setSaving(false); setNotice(response.ok ? "Preco e kit atualizados." : body.error || "Nao foi possivel atualizar."); if (response.ok) await load();
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const response = await fetch("/api/gestao-grafica/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-item", ...newProduct }) });
    const body = await response.json(); setSaving(false); setNotice(response.ok ? "Produto criado. Agora adicione suas opcoes." : body.error || "Nao foi possivel criar."); if (response.ok) { setShowNewProduct(false); setNewProduct({ name: "", category: "Catalogo", description: "", imageUrl: "" }); await load(); setSelectedId(body.item.id); }
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setSaving(true);
    const response = await fetch("/api/gestao-grafica/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-variant", catalogItemId: selected.id, label: newVariant.label, quantity: newVariant.quantity, widthMm: newVariant.widthMm, heightMm: newVariant.heightMm, priceCents: moneyCents(newVariant.price), costCents: moneyCents(newVariant.cost) }) });
    const body = await response.json(); setSaving(false); setNotice(response.ok ? "Nova opcao adicionada." : body.error || "Nao foi possivel adicionar."); if (response.ok) { setShowNewVariant(false); setNewVariant({ label: "", quantity: "1", widthMm: "", heightMm: "", price: "", cost: "" }); await load(); }
  }

  async function rotateLink() {
    if (!window.confirm("Gerar um novo link? O link antigo deixara de funcionar.")) return;
    setSaving(true); const response = await fetch("/api/gestao-grafica/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rotate-link" }) }); const body = await response.json(); setSaving(false); if (!response.ok) return setNotice(body.error || "Nao foi possivel trocar o link."); setData((current: Row) => ({ ...current, ...body })); setNotice("Novo link publico gerado.");
  }

  async function copyLink() { if (!publicUrl) return; await navigator.clipboard.writeText(publicUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }

  return <div className="mx-auto max-w-screen-2xl space-y-5">
    <header className="surface-panel flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Catalogo comercial</p><h1 className="text-2xl font-black text-slate-950">Produtos, imagens, kits e precos</h1><p className="mt-1 text-sm font-semibold text-slate-500">O catalogo alimenta o link do cliente e as opcoes prontas do orcamento.</p></div><div className="flex flex-wrap gap-2"><button className="secondary-action inline-flex items-center gap-2 px-3 py-2" type="button" disabled={!publicUrl} onClick={() => void copyLink()}>{copied ? <Check size={16} /> : <Copy size={16} />}Copiar link</button><a className="secondary-action inline-flex items-center gap-2 px-3 py-2" href={publicUrl || "#"} target="_blank" rel="noreferrer"><ExternalLink size={16} />Ver catalogo</a>{data?.canManage ? <><button className="secondary-action grid h-10 w-10 place-items-center p-0" type="button" title="Gerar novo link" disabled={saving} onClick={() => void rotateLink()}><RefreshCw size={16} /></button><button className="primary-action inline-flex items-center gap-2 px-3 py-2" type="button" onClick={() => setShowNewProduct(true)}><Plus size={16} />Novo produto</button></> : null}</div></header>
    {notice ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</p> : null}
    {loading ? <div className="surface-panel flex items-center gap-2 p-5 text-sm font-bold text-slate-600"><Loader2 className="animate-spin" size={18} />Carregando catalogo...</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map((item: Row) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`overflow-hidden rounded-lg border bg-white text-left shadow-sm transition ${selectedId === item.id ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300"}`}><div className="aspect-[16/10] border-b border-slate-200 bg-slate-100" style={imageStyle(item)} /><div className="p-3"><div className="flex items-start justify-between gap-2"><h2 className="font-black leading-tight text-slate-950">{item.name}</h2>{item.status === "ACTIVE" ? <Eye className="shrink-0 text-emerald-600" size={16} /> : <EyeOff className="shrink-0 text-slate-400" size={16} />}</div><p className="mt-1 text-xs font-semibold text-slate-500">{item.variants.length} opcoes | {item.category}</p><p className="mt-2 text-sm font-black text-emerald-700">A partir de {brl(startingPrice(item))}</p></div></button>)}</section>
    {selected ? <section className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <form className="surface-panel grid content-start gap-3 p-5" onSubmit={saveItem}><div><p className="eyebrow">Produto selecionado</p><h2 className="text-xl font-black">Editar apresentacao</h2></div>{data?.canManage ? <><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Nome</span><input className={inputClass} name="name" defaultValue={selected.name} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Categoria</span><input className={inputClass} name="category" defaultValue={selected.category} /></label><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Ordem</span><input className={inputClass} name="sortOrder" type="number" defaultValue={selected.sortOrder} /></label></div><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Descricao</span><textarea className={`${inputClass} min-h-24 resize-y`} name="description" defaultValue={selected.description || ""} /></label><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Imagem ou arquivo publico</span><input className={inputClass} name="imageUrl" defaultValue={selected.imageUrl || ""} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Posicao da imagem</span><input className={inputClass} name="imagePosition" defaultValue={selected.imagePosition || "center"} /></label><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Visibilidade</span><select className={inputClass} name="status" defaultValue={selected.status}><option value="ACTIVE">Publicado</option><option value="INACTIVE">Oculto</option></select></label></div><label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input name="featured" type="checkbox" defaultChecked={selected.featured} />Destacar no catalogo</label><button className="primary-action inline-flex items-center justify-center gap-2 py-2" disabled={saving}><Save size={16} />Salvar produto</button></> : <><div className="aspect-[16/10] rounded-lg border border-slate-200 bg-slate-100" style={imageStyle(selected)} /><p className="text-sm font-semibold text-slate-600">{selected.description}</p></>}</form>
      <section className="surface-panel p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Precos e kits</p><h2 className="text-xl font-black">{selected.variants.length} opcoes cadastradas</h2></div>{data?.canManage ? <button className="secondary-action inline-flex items-center gap-2 px-3 py-2" type="button" onClick={() => setShowNewVariant(true)}><Plus size={16} />Nova opcao</button> : null}</div><label className="relative mt-4 block"><Search className="absolute left-3 top-3 text-slate-400" size={16} /><input className={`${inputClass} w-full pl-9`} value={variantSearch} onChange={(event) => setVariantSearch(event.target.value)} placeholder="Buscar medida, quantidade ou SKU" /></label><div className="mt-3 grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]"><div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 p-1">{variants.map((item: Row) => <button key={item.id} type="button" onClick={() => setVariantId(item.id)} className={`block w-full rounded-md px-3 py-2 text-left ${variant?.id === item.id ? "bg-slate-950 text-white" : "hover:bg-slate-50"}`}><span className="block truncate text-sm font-black">{item.label}</span><span className={`text-xs font-semibold ${variant?.id === item.id ? "text-slate-300" : "text-slate-500"}`}>{brl(item.priceCents)}</span></button>)}</div>{variant ? <form key={variant.id} className="grid content-start gap-3" onSubmit={saveVariant}><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Nome da opcao</span><input className={inputClass} name="label" defaultValue={variant.label} readOnly={!data?.canManage} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Quantidade</span><input className={inputClass} name="quantity" type="number" min="1" defaultValue={variant.quantity} readOnly={!data?.canManage} /></label><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>SKU</span><input className={inputClass} name="sku" defaultValue={variant.sku || ""} readOnly={!data?.canManage} /></label><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Comprimento (mm)</span><input className={inputClass} name="widthMm" type="number" defaultValue={variant.widthMm || ""} readOnly={!data?.canManage} /></label><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Largura (mm)</span><input className={inputClass} name="heightMm" type="number" defaultValue={variant.heightMm || ""} readOnly={!data?.canManage} /></label><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Preco de venda R$</span><input className={inputClass} name="price" inputMode="decimal" defaultValue={moneyText(variant.priceCents)} readOnly={!data?.canManage} /></label>{data?.canManage ? <label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Custo estimado R$</span><input className={inputClass} name="cost" inputMode="decimal" defaultValue={moneyText(variant.costCents)} /></label> : null}</div>{data?.canManage ? <><label className="grid gap-1 text-xs font-black uppercase text-slate-500"><span>Situacao</span><select className={inputClass} name="status" defaultValue={variant.status}><option value="ACTIVE">Ativa</option><option value="INACTIVE">Oculta</option></select></label><button className="primary-action inline-flex items-center justify-center gap-2 py-2" disabled={saving}><Save size={16} />Salvar preco e kit</button></> : null}</form> : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhuma opcao encontrada.</p>}</div></section>
    </section> : null}
    {showNewProduct ? <Modal title="Novo produto" onClose={() => setShowNewProduct(false)}><form className="grid gap-3" onSubmit={createProduct}><input className={inputClass} required placeholder="Nome do produto" value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} /><input className={inputClass} required placeholder="Categoria" value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })} /><textarea className={`${inputClass} min-h-24`} placeholder="Descricao para o cliente" value={newProduct.description} onChange={(event) => setNewProduct({ ...newProduct, description: event.target.value })} /><input className={inputClass} placeholder="URL da imagem (opcional)" value={newProduct.imageUrl} onChange={(event) => setNewProduct({ ...newProduct, imageUrl: event.target.value })} /><button className="primary-action py-2" disabled={saving}>Cadastrar produto</button></form></Modal> : null}
    {showNewVariant && selected ? <Modal title={`Nova opcao de ${selected.name}`} onClose={() => setShowNewVariant(false)}><form className="grid gap-3" onSubmit={createVariant}><input className={inputClass} required placeholder="Ex.: 50 unidades | 40x50 cm" value={newVariant.label} onChange={(event) => setNewVariant({ ...newVariant, label: event.target.value })} /><div className="grid gap-3 sm:grid-cols-3"><input className={inputClass} required type="number" min="1" placeholder="Quantidade" value={newVariant.quantity} onChange={(event) => setNewVariant({ ...newVariant, quantity: event.target.value })} /><input className={inputClass} type="number" placeholder="Comprimento mm" value={newVariant.widthMm} onChange={(event) => setNewVariant({ ...newVariant, widthMm: event.target.value })} /><input className={inputClass} type="number" placeholder="Largura mm" value={newVariant.heightMm} onChange={(event) => setNewVariant({ ...newVariant, heightMm: event.target.value })} /></div><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} required inputMode="decimal" placeholder="Preco R$" value={newVariant.price} onChange={(event) => setNewVariant({ ...newVariant, price: event.target.value })} /><input className={inputClass} required inputMode="decimal" placeholder="Custo R$" value={newVariant.cost} onChange={(event) => setNewVariant({ ...newVariant, cost: event.target.value })} /></div><button className="primary-action py-2" disabled={saving}>Adicionar opcao</button></form></Modal> : null}
  </div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" onMouseDown={onClose}><section className="w-full max-w-xl rounded-lg bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-black">{title}</h2><button className="secondary-action px-3 py-2" type="button" onClick={onClose}>Fechar</button></div>{children}</section></div>; }
