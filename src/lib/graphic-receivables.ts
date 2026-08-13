export function resolveReceivableStatus(amountCents: number, receivedCents: number, now = new Date(), dueDate?: Date | string | null) {
  if (receivedCents <= 0) {
    return dueDate && new Date(dueDate) < now ? "OVERDUE" : "OPEN";
  }
  if (receivedCents >= amountCents) return "PAID";
  return dueDate && new Date(dueDate) < now ? "PARTIAL_OVERDUE" : "PARTIAL";
}

export function addPaymentToReceivable(amountCents: number, receivedCents: number, paymentCents: number) {
  const safePayment = Math.max(0, Math.round(paymentCents || 0));
  const paidNowCents = Math.min(Math.max(0, amountCents - receivedCents), safePayment);
  const nextReceivedCents = Math.min(amountCents, receivedCents + paidNowCents);
  const pendingCents = Math.max(0, amountCents - nextReceivedCents);
  return { paidNowCents, nextReceivedCents, pendingCents };
}

export function graphicPaymentIdempotencyKey(paymentId: string) {
  return `graphic-payment-${paymentId}`;
}

export function defaultGraphicPaymentAccount(value: unknown) {
  return String(value || "").trim() || "Conta principal";
}

export function defaultGraphicPaymentMethod(value: unknown) {
  return String(value || "").trim() || "Manual";
}

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

function splitCents(totalCents: number, percents: number[]) {
  let allocated = 0;
  return percents.map((percent, index) => {
    const amount = index === percents.length - 1 ? totalCents - allocated : Math.round(totalCents * (percent / 100));
    allocated += amount;
    return amount;
  });
}

export function buildGraphicInstallments(totalCents: number, paymentTerms: unknown, baseDate = new Date()) {
  const terms = String(paymentTerms || "").toLowerCase();
  const percents = [...terms.matchAll(/(\d{1,3})\s*%/g)].map((match) => Number(match[1])).filter((value) => value > 0 && value <= 100);
  const normalizedPercents = percents.length >= 2 && percents.reduce((sum, value) => sum + value, 0) === 100 ? percents : [100];
  const amounts = splitCents(Math.max(0, Math.round(totalCents || 0)), normalizedPercents);
  return amounts.map((amountCents, index) => {
    const isFirst = index === 0;
    const dueInDays = normalizedPercents.length === 1 ? 7 : isFirst ? 0 : 7 * index;
    return {
      number: index + 1,
      amountCents,
      dueDate: addDays(baseDate, dueInDays),
      label: normalizedPercents.length === 1 ? "Parcela unica" : isFirst ? "Entrada/aprovacao" : `Parcela ${index + 1}`
    };
  });
}
