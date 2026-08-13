export function resolveReceivableStatus(amountCents: number, receivedCents: number, now = new Date(), dueDate?: Date | string | null) {
  if (receivedCents <= 0) {
    return dueDate && new Date(dueDate) < now ? "OVERDUE" : "OPEN";
  }
  if (receivedCents >= amountCents) return "PAID";
  return dueDate && new Date(dueDate) < now ? "PARTIAL_OVERDUE" : "PARTIAL";
}

export function addPaymentToReceivable(amountCents: number, receivedCents: number, paymentCents: number) {
  const safePayment = Math.max(0, Math.round(paymentCents || 0));
  const nextReceivedCents = Math.min(amountCents, receivedCents + safePayment);
  const pendingCents = Math.max(0, amountCents - nextReceivedCents);
  return { paidNowCents: safePayment, nextReceivedCents, pendingCents };
}
