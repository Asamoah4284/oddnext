import { Payment } from "../models/Payment.js";
import { addDays, endOfDay } from "../utils/dates.js";

export function normalizeRevealCode(rawCode: string): string {
  if (!rawCode) return "";
  let clean = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.startsWith("VIP") && !clean.startsWith("VIP-") && clean.length > 3) {
    clean = `VIP-${clean.slice(3)}`;
  } else if (clean.startsWith("ODD") && !clean.startsWith("ODD-") && clean.length > 3) {
    clean = `ODD-${clean.slice(3)}`;
  }
  return clean;
}

export async function generateUniqueRevealCode(product: string): Promise<string> {
  const isVip = product === "vip";
  const prefix = isVip ? "VIP" : "ODD";
  for (let attempt = 0; attempt < 20; attempt++) {
    const num = Math.floor(10000 + Math.random() * 90000);
    const code = `${prefix}-${num}`;
    const exists = await Payment.findOne({ revealCode: code }).select("_id").lean();
    if (!exists) return code;
  }
  return `${prefix}-${Date.now().toString().slice(-5)}`;
}

/** Fallback VIP length for legacy/seeded payments that never got vipExpiresAt. */
export const VIP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * When a paid code stops working.
 * - VIP: vipExpiresAt, or createdAt + 7 days for older/seeded records (never "forever").
 * - Single slip: end of the day after purchase — the same window as
 *   slipWindow()/isSlipExpired() in services/vip.ts (a slip code only covers
 *   the slip that was on sale the day it was paid).
 */
export function codeExpiry(payment: {
  product?: string | null;
  codeType?: string | null;
  vipExpiresAt?: Date | null;
  paidAt?: Date | null;
  createdAt?: Date | null;
}): Date {
  const isVip = payment.codeType === "vip" || payment.product === "vip";
  if (isVip) {
    if (payment.vipExpiresAt) return new Date(payment.vipExpiresAt);
    const base = payment.createdAt ? new Date(payment.createdAt).getTime() : 0;
    return new Date(base + VIP_TTL_MS);
  }
  const paidAt = payment.paidAt ?? payment.createdAt ?? new Date(0);
  return endOfDay(addDays(new Date(paidAt), 1));
}

/** Nigerian payers can't receive SMS, so their code is shown on the site for this long after approval. */
export const NG_CODE_DISPLAY_WINDOW_MS = 10 * 60 * 1000;

export function isNigerianPayment(payment: { currency?: string | null; phone?: string | null }): boolean {
  if ((payment.currency || "").toUpperCase() === "NGN") return true;
  const digits = (payment.phone || "").replace(/\D/g, "");
  return digits.startsWith("234");
}

/**
 * Codes are never shown on the website, except for Nigerian payers (no SMS support):
 * shown during a short window starting the first time it's requested, then never again.
 * Mutates codeShownAt; caller must save the payment.
 */
export function takeDisplayableCode(
  payment: {
    currency?: string | null;
    phone?: string | null;
    revealCode?: string | null;
    codeShownAt?: Date | null;
  },
  now = new Date()
): string | undefined {
  if (!payment.revealCode || !isNigerianPayment(payment)) return undefined;
  if (!payment.codeShownAt) {
    payment.codeShownAt = now;
    return payment.revealCode;
  }
  const shownAgo = now.getTime() - new Date(payment.codeShownAt).getTime();
  return shownAgo <= NG_CODE_DISPLAY_WINDOW_MS ? payment.revealCode : undefined;
}

export function maskPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 6) return "your phone";
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
}

export function extractCorePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}
