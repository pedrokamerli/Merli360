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
