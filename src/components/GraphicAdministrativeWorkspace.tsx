"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, ClipboardPlus, Loader2, Package, Plus, RefreshCw, ShoppingCart, Truck } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";

type Row = Record<string, any>;
const inputClass = "min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (cents: number) => money.format(Number(cents || 0) / 100);

export function GraphicAdministrativeWorkspace() {
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [movement, setMovement] = useState({ materialId: "", type: "ENTRY", quantity: "", unitCost: "", note: "" });
  const [supplier, setSupplier] = useState({ name: "", contactName: "", phone: "", email: "" });
  const [purchase, setPurchase] = useState({ supplierId: "", expectedAt: "", notes: "", items: [{ materialId: "", quantity: "", unitCost: "" }] });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/gestao-grafica/inventory", { cache: "no-store" });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) setMessage(payload.error || "Nao foi possivel carregar o administrativo.");
    else setData(payload);
  }

  useEffect(() => { void load(); }, []);

  async function request(payload: Row) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/gestao-grafica/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) { setMessage(body.error || "Nao foi possivel concluir a operacao."); return false; }
    await load();
    return true;
  }

  const materials = data?.materials || [];
  const suppliers = data?.suppliers || [];
  const purchases = data?.purchases || [];
  const needs = data?.needs || [];
  const payables = data?.payables || [];
  const receivables = data?.receivables || [];
  const criticalMaterials = useMemo(() => materials.filter((item: Row) => Number(item.currentStock || 0) <= Number(item.minStock || 0)), [materials]);

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await request({ action: "movement", ...movement })) { setMovement({ materialId: "", type: "ENTRY", quantity: "", unitCost: "", note: "" }); setMessage("Movimentacao registrada e saldo atualizado."); }
  }
  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await request({ action: "supplier", ...supplier })) { setSupplier({ name: "", contactName: "", phone: "", email: "" }); setMessage("Fornecedor salvo."); }
  }
  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await request({ action: "purchase", ...purchase })) { setPurchase({ supplierId: "", expectedAt: "", notes: "", items: [{ materialId: "", quantity: "", unitCost: "" }] }); setMessage("Compra criada como rascunho."); }
  }
  async function receivePurchase(item: Row) {
    const openItems = item.items.filter((line: Row) => Number(line.receivedQuantity || 0) < Number(line.quantity || 0));
    if (!openItems.length) return;
    const received = openItems.map((line: Row) => {
      const pending = Number(line.quantity) - Number(line.receivedQuantity || 0);
      const value = prompt(`Quantidade recebida de ${line.material?.name || "material"} (pendente: ${pending})`, String(pending));
      return { itemId: line.id, quantity: value === null ? 0 : Number(String(value).replace(",", ".")) };
    }).filter((line: { itemId: string; quantity: number }) => Number.isFinite(line.quantity) && line.quantity > 0);
    if (!received.length) return;
    if (await request({ action: "receive-purchase", purchaseId: item.id, items: received })) setMessage("Recebimento registrado e estoque atualizado.");
  }
  async function orderPurchase(item: Row) {
    if (await request({ action: "order-purchase", purchaseId: item.id })) setMessage("Compra marcada como pedida e conta a pagar criada.");
  }
  async function settlePayable(item: Row) {
    const amount = prompt("Valor pago", String(Number(item.openCents || 0) / 100));
    if (!amount) return;
    if (await request({ action: "settle-payable", titleId: item.id, amount, accountName: "Conta principal", method: "Manual" })) setMessage("Pagamento registrado.");
  }
  async function settleReceivable(item: Row) {
    const amount = prompt("Valor recebido", String((Number(item.amountCents || 0) - Number(item.receivedCents || 0)) / 100));
    if (!amount) return;
    setSaving(true);
    const response = await fetch("/api/gestao-grafica/receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, amount, accountName: "Conta principal", method: "Manual" }) });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) { setMessage(body.error || "Nao foi possivel registrar o recebimento."); return; }
    setMessage("Recebimento registrado.");
    await load();
  }

  return <div className="mx-auto max-w-screen-2xl space-y-5">
    <header className="surface-panel flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
      <div><p className="eyebrow">Marina / Administrativo</p><h1 className="text-2xl font-black text-slate-950">O que precisa receber, comprar ou controlar hoje?</h1><p className="mt-1 text-sm font-medium text-slate-500">Estoque por movimentacao, compras e pendencias de material em um so lugar.</p></div>
      <button className="secondary-action inline-flex items-center gap-2 px-4 py-2" onClick={load} type="button"><RefreshCw size={16} />Atualizar</button>
    </header>
    {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div> : null}
    {loading ? <div className="surface-panel flex items-center gap-2 p-5 text-sm font-bold text-slate-600"><Loader2 className="animate-spin" size={18} />Carregando administrativo...</div> : null}
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard label="Abaixo do minimo" value={String(criticalMaterials.length)} hint="materiais para revisar" tone={criticalMaterials.length ? "danger" : "good"} />
      <MetricCard label="Faltas para pedidos" value={String(needs.length)} hint="necessidades abertas" tone={needs.length ? "warn" : "good"} />
      <MetricCard label="Compras em aberto" value={String(purchases.filter((item: Row) => !["RECEIVED", "CANCELLED"].includes(item.status)).length)} hint="rascunhos e pedidos" />
      <MetricCard label="A receber" value={String(receivables.length)} hint="parcelas pendentes" tone={receivables.some((item: Row) => new Date(item.dueDate) < new Date()) ? "warn" : undefined} />
    </section>
    <section className="surface-panel p-4"><div className="mb-3 flex items-center gap-2"><Package className="text-emerald-600" size={18} /><h2 className="font-black text-slate-950">Estoque de materiais</h2></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{materials.length ? materials.map((item: Row) => <article key={item.id} className={`rounded-lg border p-3 ${Number(item.currentStock || 0) <= Number(item.minStock || 0) ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}><p className="font-black text-slate-950">{item.name}</p><p className="mt-1 text-sm font-bold text-slate-700">{item.currentStock} {item.unit}</p><p className="text-xs font-semibold text-slate-500">Minimo: {item.minStock} | {item.location || "Local nao informado"}</p></article>) : <p className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-500">Nenhum material cadastrado.</p>}</div></section>
    <section className="grid gap-4 xl:grid-cols-3">
      <form className="surface-panel p-4" onSubmit={submitMovement}>
        <div className="mb-3 flex items-center gap-2"><ClipboardPlus className="text-emerald-600" size={18} /><h2 className="font-black text-slate-950">Movimentar estoque</h2></div>
        <div className="grid gap-3"><select className={inputClass} required value={movement.materialId} onChange={(event) => setMovement({ ...movement, materialId: event.target.value })}><option value="">Selecione material</option>{materials.map((item: Row) => <option key={item.id} value={item.id}>{item.name} ({item.currentStock} {item.unit})</option>)}</select><select className={inputClass} value={movement.type} onChange={(event) => setMovement({ ...movement, type: event.target.value })}><option value="ENTRY">Entrada</option><option value="OUTPUT">Saida</option><option value="ADJUSTMENT">Ajuste</option><option value="LOSS">Perda</option><option value="RETURN">Devolucao</option></select><input className={inputClass} required inputMode="decimal" placeholder="Quantidade" value={movement.quantity} onChange={(event) => setMovement({ ...movement, quantity: event.target.value })} /><input className={inputClass} inputMode="decimal" placeholder="Custo unitario R$ (opcional)" value={movement.unitCost} onChange={(event) => setMovement({ ...movement, unitCost: event.target.value })} /><input className={inputClass} placeholder="Observacao" value={movement.note} onChange={(event) => setMovement({ ...movement, note: event.target.value })} /><button className="primary-action py-2" disabled={saving}>Registrar movimentacao</button></div>
      </form>
      <form className="surface-panel p-4" onSubmit={submitSupplier}>
        <div className="mb-3 flex items-center gap-2"><Truck className="text-violet-600" size={18} /><h2 className="font-black text-slate-950">Novo fornecedor</h2></div>
        <div className="grid gap-3"><input className={inputClass} required placeholder="Nome do fornecedor" value={supplier.name} onChange={(event) => setSupplier({ ...supplier, name: event.target.value })} /><input className={inputClass} placeholder="Pessoa de contato" value={supplier.contactName} onChange={(event) => setSupplier({ ...supplier, contactName: event.target.value })} /><input className={inputClass} placeholder="Telefone" value={supplier.phone} onChange={(event) => setSupplier({ ...supplier, phone: event.target.value })} /><input className={inputClass} type="email" placeholder="E-mail" value={supplier.email} onChange={(event) => setSupplier({ ...supplier, email: event.target.value })} /><button className="secondary-action py-2" disabled={saving}>Salvar fornecedor</button></div>
      </form>
      <section className="surface-panel p-4"><div className="mb-3 flex items-center gap-2"><AlertTriangle className="text-amber-500" size={18} /><h2 className="font-black text-slate-950">Pendencias de material</h2></div><div className="space-y-2">{needs.length ? needs.map((item: Row) => <article key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="font-black text-slate-950">{item.material?.name}</p><p className="text-xs font-semibold text-slate-600">Faltam {item.missingQuantity} {item.material?.unit} para producao.</p></article>) : <p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Nenhuma falta calculada.</p>}</div></section>
    </section>
    <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      <form className="surface-panel p-4" onSubmit={submitPurchase}>
        <div className="mb-3 flex items-center gap-2"><ShoppingCart className="text-emerald-600" size={18} /><h2 className="font-black text-slate-950">Criar compra</h2></div>
        <div className="grid gap-3"><select className={inputClass} value={purchase.supplierId} onChange={(event) => setPurchase({ ...purchase, supplierId: event.target.value })}><option value="">Fornecedor a definir</option>{suppliers.map((item: Row) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className={inputClass} type="date" value={purchase.expectedAt} onChange={(event) => setPurchase({ ...purchase, expectedAt: event.target.value })} />
        {purchase.items.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_130px_34px]"><select className={inputClass} required value={line.materialId} onChange={(event) => { const items = [...purchase.items]; items[index] = { ...line, materialId: event.target.value }; setPurchase({ ...purchase, items }); }}><option value="">Material</option>{materials.map((item: Row) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className={inputClass} required inputMode="decimal" placeholder="Qtd." value={line.quantity} onChange={(event) => { const items = [...purchase.items]; items[index] = { ...line, quantity: event.target.value }; setPurchase({ ...purchase, items }); }} /><input className={inputClass} required inputMode="decimal" placeholder="Custo R$" value={line.unitCost} onChange={(event) => { const items = [...purchase.items]; items[index] = { ...line, unitCost: event.target.value }; setPurchase({ ...purchase, items }); }} /><button className="icon-action" type="button" title="Remover material" disabled={purchase.items.length === 1} onClick={() => setPurchase({ ...purchase, items: purchase.items.filter((_, current) => current !== index) })}>-</button></div>)}
        <button className="secondary-action inline-flex items-center justify-center gap-2 py-2" type="button" onClick={() => setPurchase({ ...purchase, items: [...purchase.items, { materialId: "", quantity: "", unitCost: "" }] })}><Plus size={15} />Adicionar material</button><input className={inputClass} placeholder="Observacao" value={purchase.notes} onChange={(event) => setPurchase({ ...purchase, notes: event.target.value })} /><button className="primary-action py-2" disabled={saving}>Criar compra</button></div>
      </form>
      <section className="surface-panel p-4"><div className="mb-3 flex items-center gap-2"><Package className="text-violet-600" size={18} /><h2 className="font-black text-slate-950">Compras recentes</h2></div><div className="space-y-2">{purchases.length ? purchases.map((item: Row) => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">Compra #{item.number}</p><p className="text-xs font-semibold text-slate-500">{item.supplier?.name || "Fornecedor a definir"} | {brl(item.totalCents)}</p></div><span className="text-xs font-black text-slate-600">{item.status === "DRAFT" ? "Rascunho" : item.status === "ORDERED" ? "Pedido ao fornecedor" : item.status === "PARTIALLY_RECEIVED" ? "Recebimento parcial" : item.status === "RECEIVED" ? "Recebida" : item.status}</span></div><p className="mt-2 text-xs font-semibold text-slate-500">{item.items.map((line: Row) => `${line.material?.name}: ${line.receivedQuantity}/${line.quantity}`).join(" | ")}</p>{item.status === "DRAFT" || item.status === "REQUESTED" ? <button className="secondary-action mt-3 w-full py-2 text-xs" type="button" disabled={saving} onClick={() => orderPurchase(item)}>Marcar como pedida</button> : null}{!["RECEIVED", "CANCELLED", "DRAFT", "REQUESTED"].includes(item.status) ? <button className="primary-action mt-3 w-full py-2 text-xs" type="button" disabled={saving} onClick={() => receivePurchase(item)}>Registrar recebimento</button> : null}</article>) : <p className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-500">Nenhuma compra cadastrada.</p>}</div></section>
    </section>
    <section className="grid gap-4 xl:grid-cols-2">
      <section className="surface-panel p-4"><div className="mb-3 flex items-center gap-2"><Banknote className="text-emerald-600" size={18} /><h2 className="font-black text-slate-950">Contas a receber</h2></div><div className="space-y-2">{receivables.length ? receivables.map((item: Row) => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">Pedido #{item.order?.number || "-"}</p><p className="text-xs font-semibold text-slate-500">Vencimento {new Intl.DateTimeFormat("pt-BR").format(new Date(item.dueDate))}</p></div><p className="font-black text-slate-800">{brl(Number(item.amountCents || 0) - Number(item.receivedCents || 0))}</p></div><button className="primary-action mt-3 w-full py-2 text-xs" type="button" disabled={saving} onClick={() => settleReceivable(item)}>Registrar recebimento</button></article>) : <p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Nenhuma parcela pendente.</p>}</div></section>
      <section className="surface-panel p-4"><div className="mb-3 flex items-center gap-2"><Banknote className="text-violet-600" size={18} /><h2 className="font-black text-slate-950">Contas a pagar</h2></div><div className="space-y-2">{payables.length ? payables.map((item: Row) => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{item.description}</p><p className="text-xs font-semibold text-slate-500">Vencimento {new Intl.DateTimeFormat("pt-BR").format(new Date(item.dueDate))}</p></div><p className="font-black text-slate-800">{brl(item.openCents)}</p></div><button className="secondary-action mt-3 w-full py-2 text-xs" type="button" disabled={saving} onClick={() => settlePayable(item)}>Registrar pagamento</button></article>) : <p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Nenhuma conta a pagar em aberto.</p>}</div></section>
    </section>
  </div>;
}
