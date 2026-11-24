import { apiFetch } from "./api";
import { getOrCreateDeviceId } from "./deviceId";
import type { PaidTip } from "./payments";

export type RevealResponse = {
  status: "ok";
  type: "single" | "vip";
  product: string;
  /** Opaque 30-minute unlock session token — the code itself is never returned. */
  sessionToken: string;
  tips: PaidTip[];
  unlockCount?: number;
  maxUnlocks?: number;
  remainingUnlocks?: number;
  graceMinutesRemaining?: number;
  vipExpiresAt?: string;
  daysRemaining?: number;
  dailyUnlockCount?: number;
  maxDailyUnlocks?: number;
  dailyRemainingUnlocks?: number;
  devicesCount?: number;
  maxDevices?: number;
};

export type LookupCodeItem = {
  product: string;
  label: string;
  type: "single" | "vip";
  /** sms: just texted · recently_sent: texted <2 min ago · shown: Nigeria one-time display · unavailable: couldn't deliver */
  delivery: "sms" | "shown" | "recently_sent" | "unavailable";
  /** Only present for a Nigerian payer's code during its one-time display. */
  code?: string;
};

export type LookupPendingItem = {
  product: string;
  amount: number;
  currency: string;
  status: string;
  proofSubmitted: boolean;
  createdAt: string;
};

export type LookupResponse = {
  ok: boolean;
  count: number;
  maskedPhone: string;
  items: LookupCodeItem[];
  pending?: LookupPendingItem[];
};

export function revealCode(code: string): Promise<RevealResponse> {
  const deviceId = getOrCreateDeviceId();
  return apiFetch<RevealResponse>("/api/codes/reveal", {
    method: "POST",
    body: JSON.stringify({ code, deviceId }),
  });
}

export function lookupCodesByPhone(phone: string): Promise<LookupResponse> {
  return apiFetch<LookupResponse>("/api/codes/lookup", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}
