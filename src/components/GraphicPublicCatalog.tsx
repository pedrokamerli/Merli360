"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, PackageCheck, Search, Share2 } from "lucide-react";

type Row = Record<string, any>;

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

export function GraphicPublicCatalog({ tenantName, items }: { tenantName: string; items: Row[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const categories = useMemo(() => ["Todos", ...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const visible = useMemo(() => items.filter((item) => {
    const text = `${item.name} ${item.description} ${item.category}`.toLowerCase();
    return (category === "Todos" || item.category === category) && text.includes(search.toLowerCase());
  }), [category, items, search]);

  async function share(item: Row, variant: Row) {
    const text = `${item.name} - ${variant.label} - ${brl(variant.priceCents)} (${variantMeta(variant)})`;
    if (navigator.share) {
      await navigator.share({ title: item.name, text, url: window.location.href });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
    setCopied(item.id);
    window.setTimeout(() => setCopied(""), 1800);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-black uppercase text-emerald-700">Catalogo de produtos</p>
            <h1 className="mt-1 text-3xl font-black">{tenantName}</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-600">Escolha o produto, a medida e o kit. O valor exibido corresponde exatamente a opcao selecionada.</p>
          </div>
          <label className="relative block w-full lg:w-80">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto" />
          </label>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Categorias do catalogo">
          {categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-black ${category === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{item}</button>)}
        </nav>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const variants = item.variants || [];
            const variant = variants.find((row: Row) => row.id === selected[item.id]) || variants[0];
            return <article key={item.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="aspect-[4/3] border-b border-slate-200 bg-slate-100" style={imageStyle(item)} role="img" aria-label={`Imagem de ${item.name}`} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-xs font-black uppercase text-emerald-700">{item.category}</p><h2 className="mt-1 text-lg font-black leading-tight">{item.name}</h2></div>
                  {item.featured ? <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">Destaque</span> : null}
                </div>
                <p className="mt-2 min-h-10 text-sm font-medium text-slate-600">{item.description}</p>
                {variant ? <>
                  <label className="mt-4 grid gap-1 text-xs font-black uppercase text-slate-500">
                    <span>Medida e kit</span>
                    <span className="relative"><select className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-bold normal-case text-slate-800 outline-none focus:border-emerald-500" value={variant.id} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))}>{variants.map((option: Row) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 text-slate-400" size={16} /></span>
                  </label>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div><p className="text-xs font-bold text-slate-500">{variantMeta(variant)}</p><p className="mt-1 text-2xl font-black text-slate-950">{brl(variant.priceCents)}</p></div>
                    <button className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" type="button" title="Compartilhar opcao" onClick={() => void share(item, variant)}>{copied === item.id ? <Check size={19} /> : <Share2 size={19} />}</button>
                  </div>
                </> : <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">Opcoes em atualizacao.</p>}
              </div>
            </article>;
          })}
        </div>
        {!visible.length ? <div className="mt-6 rounded-lg border border-slate-200 bg-white p-10 text-center"><PackageCheck className="mx-auto text-slate-400" size={32} /><p className="mt-3 font-black">Nenhum produto encontrado.</p><p className="mt-1 text-sm font-semibold text-slate-500">Tente outra categoria ou termo de busca.</p></div> : null}
      </section>
      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs font-semibold text-slate-500">Valores em reais. Medidas padronizadas em milimetros.</footer>
    </main>
  );
}
