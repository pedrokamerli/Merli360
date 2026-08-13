export const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

export const number = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1
});

export function formatDate(value?: string | Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0)),
    end: new Date(Date.UTC(year, monthNumber, 1, 0, 0, 0))
  };
}

export function slugHash(parts: Array<string | number | Date | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("|")
    .replace(/\s+/g, " ");
}
