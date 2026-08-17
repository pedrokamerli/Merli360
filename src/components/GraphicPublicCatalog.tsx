"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, MapPin, Minus, PackageCheck, Plus, Search, Share2, ShoppingCart, Trash2, X } from "lucide-react";

type Row = Record<string, any>;
type CartLine = { item: Row; variant: Row; quantity: number };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format(Number(cents || 0) / 100);

function imageStyle(item: Row) {
  const isSprite = String(item.imageUrl || "").includes("catalog-studium-products.png");
  return {
    backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined,
    backgroundPosition: item.imagePosition || "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: isSprite ? "300% 200%" : "cover"
  };
}

function variantMeta(variant: Row) {
  const size = variant.widthMm && variant.heightMm ? `${variant.widthMm} x ${variant.heightMm} mm` : "Sem medida fixa";
  const quantity = Math.max(1, Number(variant.quantity || 1));
  return `${quantity} ${quantity === 1 ? "unidade" : "unidades"} | ${size}`;
}

export function GraphicPublicCatalog({ tenantName, token, items }: { tenantName: string; token: string; items: Row[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Row | null>(null);
  const categories = useMemo(() => ["Todos", ...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const visible = useMemo(() => items.filter((item) => {
    const text = `${item.name} ${item.description} ${item.category}`.toLowerCase();
    return (category === "Todos" || item.category === category) && text.includes(search.toLowerCase());
  }), [category, items, search]);
  const cartLines = Object.values(cart);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartLines.reduce((sum, line) => sum + Number(line.variant.priceCents || 0) * line.quantity, 0);

  function addToCart(item: Row, variant: Row) {
    setCart((current) => ({ ...current, [variant.id]: { item, variant, quantity: Math.min(99, (current[variant.id]?.quantity || 0) + 1) } }));
    setCartOpen(true);
  }

  function changeQuantity(variantId: string, quantity: number) {
    setCart((current) => {
      if (quantity <= 0) { const next = { ...current }; delete next[variantId]; return next; }
      return { ...current, [variantId]: { ...current[variantId], quantity: Math.min(99, quantity) } };
    });
  }

  async function share(item: Row, variant: Row) {
    const text = `${item.name} - ${variant.label} - ${brl(variant.priceCents)} (${variantMeta(variant)})`;
    if (navigator.share) { await navigator.share({ title: item.name, text, url: window.location.href }); return; }
    await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
    setCopied(item.id);
    window.setTimeout(() => setCopied(""), 1800);
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/gestao-grafica/public-catalog/${token}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cartLines.map((line) => ({ variantId: line.variant.id, quantity: line.quantity })),
        customer: Object.fromEntries(["name", "phone", "email", "postalCode", "address", "number", "complement", "district", "city", "state"].map((key) => [key, form.get(key)]))
      })
    });
    const body = await response.json();
    setSubmitting(false);
    if (!response.ok) return setError(body.error || "Nao foi possivel enviar a solicitacao.");
    setResult(body);
    setCart({});
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div><p className="text-xs font-black uppercase text-emerald-700">Catalogo de produtos</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{tenantName}</h1><p className="mt-1 text-sm font-semibold text-slate-600">Escolha produtos e kits para solicitar seu orcamento.</p></div>
          <div className="flex gap-2"><label className="relative min-w-0 flex-1 lg:w-80"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto" /></label><button className="relative inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white" type="button" onClick={() => setCartOpen(true)}><ShoppingCart size={18} /><span className="hidden sm:inline">Carrinho</span>{cartCount ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs text-white">{cartCount}</span> : null}</button></div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Categorias do catalogo">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-black ${category === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{item}</button>)}</nav>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const variants = item.variants || [];
            const variant = variants.find((row: Row) => row.id === selected[item.id]) || variants[0];
            return <article key={item.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="aspect-[4/3] border-b border-slate-200 bg-slate-100" style={imageStyle(item)} role="img" aria-label={`Imagem de ${item.name}`} /><div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-emerald-700">{item.category}</p><h2 className="mt-1 text-lg font-black leading-tight">{item.name}</h2></div>{item.featured ? <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">Destaque</span> : null}</div><p className="mt-2 min-h-10 text-sm font-medium text-slate-600">{item.description}</p>{variant ? <><label className="mt-4 grid gap-1 text-xs font-black uppercase text-slate-500"><span>Medida e kit</span><span className="relative"><select className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-bold normal-case text-slate-800 outline-none focus:border-emerald-500" value={variant.id} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))}>{variants.map((option: Row) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 text-slate-400" size={16} /></span></label><div className="mt-4"><p className="text-xs font-bold text-slate-500">{variantMeta(variant)}</p><p className="mt-1 text-2xl font-black text-slate-950">{brl(variant.priceCents)}</p></div><div className="mt-4 grid grid-cols-[44px_1fr] gap-2"><button className="grid h-11 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50" type="button" title="Compartilhar opcao" onClick={() => void share(item, variant)}>{copied === item.id ? <Check size={19} /> : <Share2 size={19} />}</button><button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700" type="button" onClick={() => addToCart(item, variant)}><ShoppingCart size={17} />Adicionar ao carrinho</button></div></> : <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">Opcoes em atualizacao.</p>}</div></article>;
          })}
        </div>
        {!visible.length ? <div className="mt-6 rounded-lg border border-slate-200 bg-white p-10 text-center"><PackageCheck className="mx-auto text-slate-400" size={32} /><p className="mt-3 font-black">Nenhum produto encontrado.</p></div> : null}
      </section>
      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs font-semibold text-slate-500">Valores dos produtos em reais. O frete e o prazo sao confirmados pela equipe.</footer>

      {cartOpen ? <div className="fixed inset-0 z-50 bg-slate-950/45" onMouseDown={() => setCartOpen(false)}><aside className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-4 shadow-2xl sm:p-6" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-emerald-700">Solicitar orcamento</p><h2 className="mt-1 text-2xl font-black">Seu carrinho</h2></div><button className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200" type="button" title="Fechar" onClick={() => setCartOpen(false)}><X size={18} /></button></div>{result ? <section className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-5"><Check className="text-emerald-700" size={28} /><h3 className="mt-3 text-xl font-black text-emerald-950">Solicitacao #{result.quoteNumber} recebida</h3><p className="mt-2 text-sm font-semibold text-emerald-800">{result.message}</p><a className="mt-4 inline-flex rounded-lg bg-emerald-700 px-4 py-3 text-sm font-black text-white" href={result.publicPath}>Acompanhar solicitacao</a></section> : <>{cartLines.length ? <><div className="mt-5 divide-y rounded-lg border border-slate-200">{cartLines.map((line) => <div className="p-3" key={line.variant.id}><div className="flex items-start justify-between gap-3"><div><p className="font-black">{line.item.name}</p><p className="text-xs font-semibold text-slate-500">{line.variant.label}</p></div><button className="text-rose-600" type="button" title="Remover" onClick={() => changeQuantity(line.variant.id, 0)}><Trash2 size={17} /></button></div><div className="mt-3 flex items-center justify-between gap-3"><div className="flex items-center rounded-lg border border-slate-200"><button className="grid h-9 w-9 place-items-center" type="button" title="Diminuir" onClick={() => changeQuantity(line.variant.id, line.quantity - 1)}><Minus size={15} /></button><span className="w-9 text-center text-sm font-black">{line.quantity}</span><button className="grid h-9 w-9 place-items-center" type="button" title="Aumentar" onClick={() => changeQuantity(line.variant.id, line.quantity + 1)}><Plus size={15} /></button></div><b>{brl(line.variant.priceCents * line.quantity)}</b></div></div>)}</div><div className="mt-4 flex items-center justify-between rounded-lg bg-slate-950 p-4 text-white"><span className="text-sm font-bold">Subtotal dos produtos</span><strong className="text-xl">{brl(cartTotal)}</strong></div><form className="mt-6 grid gap-3" onSubmit={checkout}><div><div className="flex items-center gap-2"><MapPin className="text-emerald-600" size={18} /><h3 className="font-black">Contato e entrega</h3></div><p className="mt-1 text-xs font-semibold text-slate-500">Usaremos estes dados para confirmar frete, prazo e enviar o orcamento.</p></div><div className="grid gap-3 sm:grid-cols-2"><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:col-span-2" name="name" required placeholder="Nome completo ou empresa" /><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold" name="phone" required inputMode="tel" placeholder="Telefone / WhatsApp com DDD" /><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold" name="email" type="email" placeholder="E-mail (opcional)" /><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold" name="postalCode" required inputMode="numeric" placeholder="CEP" /><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold" name="state" required maxLength={2} placeholder="UF" /><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:col-span-2" name="address" required placeholder="Endereco" /><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold" name="number" required placeholder="Numero" /><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold" name="complement" placeholder="Complemento" /><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold" name="district" required placeholder="Bairro" /><input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold" name="city" required placeholder="Cidade" /></div>{error ? <p className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p> : null}<button className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-black text-white disabled:opacity-60" disabled={submitting}>{submitting ? <Loader2 className="animate-spin" size={18} /> : <ShoppingCart size={18} />}Enviar para orcamento</button></form></> : <div className="mt-8 rounded-lg bg-slate-50 p-8 text-center"><ShoppingCart className="mx-auto text-slate-400" size={30} /><p className="mt-3 font-black">Seu carrinho esta vazio.</p><button className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white" type="button" onClick={() => setCartOpen(false)}>Voltar ao catalogo</button></div>}</>}</aside></div> : null}
    </main>
  );
}
