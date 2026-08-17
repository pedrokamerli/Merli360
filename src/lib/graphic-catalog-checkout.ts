import { normalizePhone } from "@/lib/crm";

export type GraphicCatalogCheckoutItem = { variantId: string; quantity: number };
export type GraphicCatalogCheckoutCustomer = {
  name: string;
  phone: string;
  email: string;
  postalCode: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

export function normalizeGraphicCatalogCheckout(body: any) {
  const customer: GraphicCatalogCheckoutCustomer = {
    name: String(body?.customer?.name || "").trim(),
    phone: normalizePhone(String(body?.customer?.phone || "")),
    email: String(body?.customer?.email || "").trim().toLowerCase(),
    postalCode: String(body?.customer?.postalCode || "").replace(/\D/g, ""),
    address: String(body?.customer?.address || "").trim(),
    number: String(body?.customer?.number || "").trim(),
    complement: String(body?.customer?.complement || "").trim(),
    district: String(body?.customer?.district || "").trim(),
    city: String(body?.customer?.city || "").trim(),
    state: String(body?.customer?.state || "").trim().toUpperCase()
  };
  const grouped = new Map<string, number>();
  for (const row of Array.isArray(body?.items) ? body.items : []) {
    const variantId = String(row?.variantId || "").trim();
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(row?.quantity || 1))));
    if (variantId) grouped.set(variantId, Math.min(99, (grouped.get(variantId) || 0) + quantity));
  }
  const items: GraphicCatalogCheckoutItem[] = [...grouped].map(([variantId, quantity]) => ({ variantId, quantity }));
  const errors = [
    customer.name.length < 2 ? "Informe seu nome." : "",
    !customer.phone ? "Informe um telefone ou WhatsApp valido com DDD." : "",
    customer.postalCode.length !== 8 ? "Informe um CEP com 8 digitos." : "",
    !customer.address ? "Informe o endereco para calcular o frete." : "",
    !customer.number ? "Informe o numero do endereco." : "",
    !customer.district ? "Informe o bairro." : "",
    !customer.city ? "Informe a cidade." : "",
    customer.state.length !== 2 ? "Informe a UF com 2 letras." : "",
    !items.length ? "Adicione pelo menos um produto ao carrinho." : "",
    items.length > 25 ? "O carrinho aceita ate 25 itens diferentes." : ""
  ].filter(Boolean);
  return { customer, items, error: errors[0] || null };
}

export function catalogCheckoutLine(variant: { quantity: number; widthMm?: number | null; heightMm?: number | null; priceCents: number; costCents: number }, kitQuantity: number) {
  const kits = Math.max(1, Math.floor(Number(kitQuantity || 1)));
  const units = Math.max(1, Number(variant.quantity || 1)) * kits;
  const unitArea = variant.widthMm && variant.heightMm ? (Number(variant.widthMm) / 1000) * (Number(variant.heightMm) / 1000) : 0;
  return {
    kits,
    units,
    priceCents: Math.max(0, Number(variant.priceCents || 0)) * kits,
    costCents: Math.max(0, Number(variant.costCents || 0)) * kits,
    area: unitArea ? unitArea * units : null
  };
}
