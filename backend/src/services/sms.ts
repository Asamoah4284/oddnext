import { config } from "../config.js";
import { getProduct, type PayCountry } from "../products.js";

const SMS_URL = "https://api.moolre.com/open/sms/send";

const SKIP_PHONE_KEYS = /accountnumber|account_number|secret|webhook|email|amount|reference|externalref|transaction/;

export function looksLikeGhPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return (
    (digits.startsWith("233") && digits.length === 12) ||
    (digits.startsWith("0") && digits.length === 10) ||
    (digits.length === 9 && /^[235]/.test(digits))
  );
}

export function looksLikeNgPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return (
    (digits.startsWith("234") && digits.length === 13) ||
    (digits.startsWith("0") && digits.length === 11) ||
    (digits.length === 10 && /^[789]/.test(digits))
  );
}

export function detectPayCountry(value: string): PayCountry | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("234") || looksLikeNgPhone(value)) return "NG";
  if (digits.startsWith("233") || looksLikeGhPhone(value)) return "GH";
  return null;
}

export function looksLikePayPhone(value: string, country?: PayCountry): boolean {
  if (country === "GH") return looksLikeGhPhone(value);
  if (country === "NG") return looksLikeNgPhone(value);
  return looksLikeGhPhone(value) || looksLikeNgPhone(value);
}

export function formatPhoneForMoolre(phoneNumber: string): string {
  const clean = phoneNumber.replace(/[\s\-()]/g, "");
  let formatted = clean.startsWith("+") ? clean.slice(1) : clean;
  const country = detectPayCountry(formatted) ?? "GH";
  const prefix = country === "NG" ? "234" : "233";
  if (formatted.startsWith("0")) {
    formatted = `${prefix}${formatted.slice(1)}`;
  } else if (!formatted.startsWith(prefix)) {
    formatted = `${prefix}${formatted}`;
  }
  return formatted;
}

export function extractPayerPhone(...payloads: unknown[]): string {
  for (const payload of payloads) {
    const found = walkForPhone(payload, 0);
    if (found) return found;
  }
  return "";
}

function walkForPhone(value: unknown, depth: number): string {
  if (value == null || depth > 5) return "";
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value);
    return looksLikePayPhone(text) ? text : "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkForPhone(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const preferred = [
    "payer",
    "phonenumber",
    "phone_number",
    "phone",
    "msisdn",
    "mobile",
    "customerphone",
    "customer_phone",
    "from",
  ];
  for (const key of preferred) {
    if (!(key in record)) continue;
    const found = walkForPhone(record[key], depth + 1);
    if (found) return found;
  }
  for (const [key, item] of Object.entries(record)) {
    if (SKIP_PHONE_KEYS.test(key.toLowerCase())) continue;
    const found = walkForPhone(item, depth + 1);
    if (found) return found;
  }
  return "";
}

export type SlipLine = {
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  odds: number;
  bookingCode?: string;
};

export function buildOddsMessage(
  productId: string,
  tips: SlipLine[],
  revealCode?: string
): string {
  const product = getProduct(productId);
  const label = product?.label ?? "VIP";
  const lines = tips.slice(0, 8).map(
    (tip) => `${tip.homeTeam} vs ${tip.awayTeam}: ${tip.prediction} @${tip.odds}`
  );
  const codes = [
    ...new Set(tips.map((tip) => tip.bookingCode).filter(Boolean)),
  ];
  const codeLine = codes.length ? `\nBooking code: ${codes.join(", ")}` : "";
  const revealLine = revealCode ? `\nYour Unlock Code: ${revealCode}` : "";
  return `Oddnext ${label} unlocked.\n${lines.join("\n") || "Open the site for today's slip."}${codeLine}${revealLine}`;
}

export async function sendMoolreSms(
  phoneNumber: string,
  message: string
): Promise<boolean> {
  if (!config.moolre.apiKey) {
    console.warn("MOOLRE_API_KEY is not set. SMS skipped.");
    return false;
  }
  if (!phoneNumber) return false;

  const recipient = formatPhoneForMoolre(phoneNumber);
  if (recipient.startsWith("234")) {
    // SMS provider does not support Nigerian numbers (+234).
    // Users unlock their odds directly on site using their phone number.
    return false;
  }
  const payload = {
    type: 1,
    senderid: config.moolre.senderId,
    messages: [{ recipient, message }],
  };

  const response = await fetch(SMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-VASKEY": config.moolre.apiKey,
    },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as {
    status?: number;
    message?: string;
  };

  if (!response.ok || data.status !== 1) {
    console.error("Moolre SMS failed", data.message || response.status);
    return false;
  }
  return true;
}
