import type { ProductItem, SlipProductId } from "./products";
import type { SiteStats, TipsResponse } from "./types";

function envUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed.replace(/\/$/, "");
  return fallback;
}

function siteUrl(): string {
  const configured = envUrl(process.env.NEXT_PUBLIC_SITE_URL, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return vercel.startsWith("http") ? vercel.replace(/\/$/, "") : `https://${vercel}`;
  }
  return "http://localhost:3000";
}

export const API_URL = envUrl(
  process.env.NEXT_PUBLIC_API_URL,
  "http://localhost:4000"
);
export const SITE_URL = siteUrl();
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Oddnext";
export const TOKEN_KEY = "oddnext_token";
export const AUTH_EXPIRED_EVENT = "oddnext:auth-expired";

const AUTH_FORM_PATHS = new Set(["/api/auth/login", "/api/auth/register"]);

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type FetchOptions = RequestInit & {
  token?: string | null;
  next?: { revalidate?: number };
};

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, headers, next, ...rest } = options;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      signal: rest.signal ?? AbortSignal.timeout(25000),
      ...(next ? { next } : {}),
    });
  } catch (err) {
    const aborted =
      err instanceof DOMException &&
      (err.name === "AbortError" || err.name === "TimeoutError");
    throw new ApiError(
      0,
      aborted
        ? "The payment server took too long. Try again."
        : "Cannot reach the API. Check that the site is connected to the live server."
    );
  }

  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
  } & T;

  if (!res.ok) {
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      !AUTH_FORM_PATHS.has(path.split("?")[0])
    ) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(res.status, data.message || "Request failed");
  }
  return data;
}

export async function fetchStats(): Promise<SiteStats> {
  return apiFetch<SiteStats>("/api/stats", {
    next: { revalidate: 30 },
  });
}

export async function fetchProducts(): Promise<ProductItem[]> {
  try {
    const data = await apiFetch<{ products: ProductItem[] }>("/api/products", {
      next: { revalidate: 30 },
    });
    return Array.isArray(data.products) && data.products.length > 0
      ? data.products
      : [];
  } catch {
    return [];
  }
}

export const REVEAL_CODE_KEY = "oddnext_reveal_code";

export async function fetchTips(
  tab: "yesterday" | "today",
  token?: string | null,
  board: SlipProductId = "odds10",
  code?: string | null
): Promise<TipsResponse> {
  const activeCode =
    code ||
    (typeof window !== "undefined"
      ? localStorage.getItem(REVEAL_CODE_KEY)
      : null);

  const headers: Record<string, string> = {};
  if (activeCode) {
    headers["x-reveal-code"] = activeCode;
  }

  return apiFetch<TipsResponse>(`/api/tips?tab=${tab}&board=${board}`, {
    token,
    headers,
    cache: token || activeCode ? "no-store" : undefined,
    next: token || activeCode ? undefined : { revalidate: 30 },
  });
}

export const fallbackStats: SiteStats = {
  winRate: 90,
  monthlyTips: 320,
  vipMembers: 1800,
  telegramCount: 100000,
  telegramUrl: "https://t.me/oddnext",
  vipPriceGhs: 1500,
};
