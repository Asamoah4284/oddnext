import { BoardPrice } from "./models/BoardPrice.js";
import { Stats } from "./models/Stats.js";

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

export const SLIP_PRODUCT_IDS = DEFAULT_SLIP_PRODUCTS.map((item) => item.id) as [
  SlipProductId,
  ...SlipProductId[],
];

export const PRODUCT_IDS = [...DEFAULT_SLIP_PRODUCTS, DEFAULT_VIP_PRODUCT].map(
  (item) => item.id
) as [ProductId, ...ProductId[]];

export type ProductItem = {
  id: ProductId;
  label: string;
  priceGhs: number;
  priceNgn: number;
};

let dynamicProducts: ProductItem[] = [
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

export async function loadProductPrices(): Promise<ProductItem[]> {
  try {
    const docs = await BoardPrice.find();
    const map = new Map(docs.map((d) => [d.id, d]));

    const defaults: ProductItem[] = [
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

    const updated: ProductItem[] = [];
    const seen = new Set<string>();

    for (const def of defaults) {
      seen.add(def.id);
      const existing = map.get(def.id);
      if (existing) {
        updated.push({
          id: def.id,
          label: existing.label || def.label,
          priceGhs: existing.priceGhs,
          priceNgn: existing.priceNgn ?? Math.round(existing.priceGhs * GHS_TO_NGN),
        });
      } else {
        await BoardPrice.findOneAndUpdate(
          { id: def.id },
          {
            id: def.id,
            label: def.label,
            priceGhs: def.priceGhs,
            priceNgn: def.priceNgn,
          },
          { upsert: true, new: true }
        );
        updated.push({ ...def });
      }
    }

    for (const doc of docs) {
      if (!seen.has(doc.id)) {
        updated.push({
          id: doc.id as ProductId,
          label: doc.label,
          priceGhs: doc.priceGhs,
          priceNgn: doc.priceNgn ?? Math.round(doc.priceGhs * GHS_TO_NGN),
        });
      }
    }

    dynamicProducts = updated;

    // Ensure Stats vipPriceGhs is kept in sync with the database VIP price
    const vipDoc = updated.find((p) => p.id === "vip");
    if (vipDoc) {
      await Stats.updateOne(
        { key: "global" },
        { $set: { vipPriceGhs: vipDoc.priceGhs } }
      ).catch(() => {});
    }
  } catch (err) {
    console.error("Failed to load board prices from database, using defaults:", err);
  }
  return dynamicProducts;
}

export async function updateProductPrices(
  updates: Array<{ id: string; priceGhs?: number; priceNgn?: number; label?: string }>
): Promise<ProductItem[]> {
  for (const item of updates) {
    const updateObj: Record<string, unknown> = {};
    if (typeof item.priceGhs === "number") updateObj.priceGhs = item.priceGhs;
    if (typeof item.priceNgn === "number") updateObj.priceNgn = item.priceNgn;
    if (item.label) updateObj.label = item.label;

    if (Object.keys(updateObj).length > 0) {
      await BoardPrice.findOneAndUpdate(
        { id: item.id },
        { $set: updateObj },
        { upsert: true }
      );
    }
  }

  const vipUpdate = updates.find((u) => u.id === "vip");
  if (vipUpdate && typeof vipUpdate.priceGhs === "number") {
    await Stats.updateOne(
      { key: "global" },
      { $set: { vipPriceGhs: vipUpdate.priceGhs } }
    ).catch(() => {});
  }

  return loadProductPrices();
}

export function getProducts(): ProductItem[] {
  return dynamicProducts;
}

export function getSlipProducts(): ProductItem[] {
  return dynamicProducts.filter((item) => item.id !== "vip");
}

export function getProduct(id: string): ProductItem | undefined {
  return dynamicProducts.find((item) => item.id === id);
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

export function isSlipProductId(id: string): id is SlipProductId {
  return SLIP_PRODUCT_IDS.includes(id as SlipProductId);
}

export function canAccessBoard(
  user:
    | {
        role?: string;
        isVip?: boolean;
        vipActive?: boolean;
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

