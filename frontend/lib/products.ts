export const GHS_TO_NGN = 114;

export type PayCountry = "GH" | "NG";
export type PayCurrency = "GHS" | "NGN";

export type PricedProduct = {
  id?: string;
  label?: string;
  priceGhs: number;
  priceNgn?: number;
};

export const DEFAULT_SLIP_PRODUCTS = [
  { id: "odds10", label: "10 odds", priceGhs: 30, priceNgn: 3420 },
  { id: "odds50", label: "50 odds", priceGhs: 80, priceNgn: 9120 },
  { id: "odds100", label: "100+ odds", priceGhs: 100, priceNgn: 11400 },
  { id: "draw", label: "Draw games", priceGhs: 80, priceNgn: 9120 },
  { id: "correctScore", label: "Correct score", priceGhs: 300, priceNgn: 34200 },
] as const;

export const DEFAULT_VIP_PRODUCT = {
  id: "vip",
  label: "VIP all access",
  priceGhs: 1500,
  priceNgn: 171000,
} as const;

export type SlipProductId = (typeof DEFAULT_SLIP_PRODUCTS)[number]["id"];
export type ProductId = SlipProductId | typeof DEFAULT_VIP_PRODUCT.id;

export const SLIP_PRODUCTS = DEFAULT_SLIP_PRODUCTS;
export const VIP_PRODUCT = DEFAULT_VIP_PRODUCT;
export const PRODUCTS = [...SLIP_PRODUCTS, VIP_PRODUCT] as const;

export type ProductItem = {
  id: ProductId;
  label: string;
  priceGhs: number;
  priceNgn: number;
};

export function getProduct(id: string): ProductItem | undefined {
  const all: ProductItem[] = [
    ...DEFAULT_SLIP_PRODUCTS.map((p) => ({
      id: p.id,
      label: p.label,
      priceGhs: p.priceGhs,
      priceNgn: p.priceNgn,
    })),
    {
      id: DEFAULT_VIP_PRODUCT.id,
      label: DEFAULT_VIP_PRODUCT.label,
      priceGhs: DEFAULT_VIP_PRODUCT.priceGhs,
      priceNgn: DEFAULT_VIP_PRODUCT.priceNgn,
    },
  ];
  return all.find((item) => item.id === id);
}

export function currencyForCountry(country: PayCountry): PayCurrency {
  return country === "NG" ? "NGN" : "GHS";
}

export function amountForCountry(
  priceGhs: number,
  country: PayCountry,
  rate = GHS_TO_NGN,
  priceNgn?: number
): number {
  if (country !== "NG") return priceGhs;
  if (priceNgn != null) return priceNgn;
  return Math.round(priceGhs * rate);
}

export function amountForProduct(
  product: PricedProduct,
  country: PayCountry,
  rate = GHS_TO_NGN
): number {
  return amountForCountry(product.priceGhs, country, rate, product.priceNgn);
}

export function formatProductPrice(
  product: PricedProduct | number,
  country: PayCountry
): string {
  const priced = typeof product === "number" ? { priceGhs: product } : product;
  const amount = amountForProduct(priced, country);
  if (country === "NG") return `₦${amount.toLocaleString("en-NG")}`;
  return `GHS ${amount}`;
}

export function productLabel(id: string) {
  return getProduct(id)?.label ?? id;
}

export function canAccessBoard(
  user:
    | {
        role?: string;
        vipActive?: boolean;
        isVip?: boolean;
        entitlements?: string[];
      }
    | null
    | undefined,
  board?: SlipProductId
): boolean {
  if (!user) return false;
  if (user.vipActive || user.isVip) return true;
  if (board && Array.isArray(user.entitlements) && user.entitlements.includes(board)) {
    return true;
  }
  return false;
}

