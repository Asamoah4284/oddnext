import { apiFetch } from "./api";

export const PAY_REF_KEY = "oddnext_pay_ref";
export const PAYMENT_EVENT = "oddnext:payment";

export type PaidTip = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  odds: number;
  bookingCode: string;
  league: string;
  product?: string;
  kickoffAt?: string | Date;
};

export type PaymentVerify = {
  status: string;
  reference?: string;
  product?: string;
  amount?: number;
  currency?: string;
  provider?: string;
  proofSubmitted?: boolean;
  proofSubmittedAt?: string | null;
  smsSent?: boolean;
  slipViewed?: boolean;
  createdAt?: string;
  revealCode?: string;
  codeType?: string;
  unlockCount?: number;
  maxUnlocks?: number;
  vipExpiresAt?: string | null;
  tips?: PaidTip[];
};

export type PaymentMessage = {
  type: typeof PAYMENT_EVENT;
  reference: string;
};

export function submitPaymentProof(
  reference: string,
  proofImage: string,
  senderName?: string,
  phone?: string,
  token?: string | null
) {
  return apiFetch<{
    success: boolean;
    reference: string;
    status: string;
    message: string;
  }>("/api/payments/proof", {
    method: "POST",
    token,
    body: JSON.stringify({
      reference,
      proofImage,
      senderName,
      phone,
    }),
  });
}

export function storePayRef(ref: string) {
  sessionStorage.setItem(PAY_REF_KEY, ref);
}

export function readPayRef() {
  return sessionStorage.getItem(PAY_REF_KEY);
}

export function clearPayRef() {
  sessionStorage.removeItem(PAY_REF_KEY);
}

export function isPaymentMessage(data: unknown): data is PaymentMessage {
  if (!data || typeof data !== "object") return false;
  const message = data as PaymentMessage;
  return message.type === PAYMENT_EVENT && typeof message.reference === "string";
}

export function verifyCheckout(
  reference: string,
  token: string | null,
  poll = false
) {
  return apiFetch<PaymentVerify>(
    `/api/payments/verify/${reference}${poll ? "?poll=1" : ""}`,
    { token }
  );
}

export function fetchLatestPayment(token: string) {
  return apiFetch<PaymentVerify>("/api/payments/latest", { token });
}

export function ackSlip(reference: string, token: string | null) {
  if (!reference || !token) return Promise.resolve();
  return apiFetch("/api/payments/ack/" + reference, {
    method: "POST",
    token,
  }).catch(() => undefined);
}
