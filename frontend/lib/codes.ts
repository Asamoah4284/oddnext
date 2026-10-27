import { apiFetch } from "./api";
import { getOrCreateDeviceId } from "./deviceId";
import type { PaidTip } from "./payments";

export type RevealResponse = {
  status: "ok";
  type: "single" | "vip";
  product: string;
  code: string;
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
  code: string;
  product: string;
  type: "single" | "vip";
  createdAt: string;
  remainingUnlocks: number | null;
  daysRemaining: number | null;
  dailyRemainingUnlocks?: number | null;
  maxDailyUnlocks?: number | null;
};

export type LookupPendingItem = {
  reference: string;
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
  codes: LookupCodeItem[];
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
