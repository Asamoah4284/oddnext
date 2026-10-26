import { Payment } from "../models/Payment.js";

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

export function extractCorePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}
