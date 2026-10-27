"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  DEFAULT_SLIP_PRODUCTS,
  DEFAULT_VIP_PRODUCT,
  GHS_TO_NGN,
  type ProductItem,
} from "@/lib/products";
import { useProducts } from "./ProductsProvider";

interface AdminPricesEditorProps {
  token: string;
}

const productMeta: Record<
  string,
  { tag: string; description: string; badgeColor: string }
> = {
  odds10: {
    tag: "Banker Slip",
    description: "Daily high-confidence 10 odds accumulator",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
  },
  odds50: {
    tag: "Mid Acca",
    description: "High-value 50 odds accumulator",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
  },
  odds100: {
    tag: "Mega Slip",
    description: "Massive 100+ odds monster accumulator",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
  },
  draw: {
    tag: "Draws",
    description: "Full-time draw games and stalemate predictions",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
  },
  correctScore: {
    tag: "Exact Score",
    description: "Precision correct score predictions",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
  },
  vip: {
    tag: "All Access",
    description: "Unlocks every daily board + SportyBet booking codes",
    badgeColor: "bg-slate-900 text-white border-slate-900",
  },
};

const defaultList: ProductItem[] = [
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

export function AdminPricesEditor({ token }: AdminPricesEditorProps) {
  const { setProductList, refreshProducts } = useProducts();
  const [items, setItems] = useState<ProductItem[]>(defaultList);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const data = await apiFetch<{ products: ProductItem[] }>(
          "/api/admin/prices",
          { token, cache: "no-store" }
        );
        if (active && Array.isArray(data.products) && data.products.length > 0) {
          setItems(data.products);
          setProductList(data.products);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load prices"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [token, setProductList]);

  const [exchangeRate, setExchangeRate] = useState<number>(GHS_TO_NGN);

  function updatePrice(
    id: string,
    field: "priceGhs" | "priceNgn",
    value: number
  ) {
    setSavedSuccess(false);
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  function updateLabel(id: string, label: string) {
    setSavedSuccess(false);
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, label } : item))
    );
  }

  function autoCalculateNgn(id: string, rate = exchangeRate) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            priceNgn: Math.round(item.priceGhs * rate),
          };
        }
        return item;
      })
    );
  }

  function applyRateToAll(rate = exchangeRate) {
    setSavedSuccess(false);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        priceNgn: Math.round(item.priceGhs * rate),
      }))
    );
  }

  function resetToDefaults() {
    if (!window.confirm("Reset all board prices to system defaults?")) return;
    setSavedSuccess(false);
    setItems(defaultList);
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    setSavedSuccess(false);
    try {
      // Validate all positive
      for (const item of items) {
        if (item.priceGhs <= 0 || item.priceNgn <= 0) {
          throw new Error(
            `Price for ${item.label} must be greater than zero.`
          );
        }
      }

      const res = await apiFetch<{ products: ProductItem[] }>(
        "/api/admin/prices",
        {
          method: "PUT",
          token,
          body: JSON.stringify({
            prices: items.map((i) => ({
              id: i.id,
              priceGhs: Number(i.priceGhs),
              priceNgn: Number(i.priceNgn),
              label: i.label,
            })),
          }),
        }
      );

      if (res.products) {
        setItems(res.products);
        setProductList(res.products);
      }
      await refreshProducts();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save prices");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Title & overview banner */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-blue-600" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                Database Synced · Live Pricing Engine
              </p>
            </div>
            <h2 className="mt-1 font-sans text-lg font-bold sm:text-xl text-slate-900">
              Odds Board & VIP Prices (Ghana & Nigeria)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Set exact checkout prices saved to MongoDB. Changes apply immediately to public boards and payment checkouts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-2xs focus-within:border-blue-600">
              <span className="text-slate-400 mr-1.5 font-medium">1 GHS =</span>
              <input
                type="number"
                step="0.1"
                min="1"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-transparent font-mono font-bold text-blue-600 outline-none"
                title="Current exchange rate in NGN (e.g. 114)"
              />
              <span className="text-slate-400 ml-1 font-medium">NGN</span>
            </div>
            <button
              type="button"
              onClick={() => applyRateToAll(exchangeRate)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-slate-100 transition shadow-2xs"
              title={`Recalculate all Nigeria prices using 1 GHS = ${exchangeRate} NGN`}
            >
              Sync All to ₦{exchangeRate}
            </button>
            <button
              type="button"
              onClick={resetToDefaults}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 transition shadow-2xs"
            >
              Reset Defaults
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
          <p className="font-semibold">Error saving prices:</p>
          <p>{error}</p>
        </div>
      )}

      {savedSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
          <p className="font-semibold">✓ Prices updated successfully!</p>
          <p className="mt-0.5 opacity-90">
            Live prices for Ghana and Nigeria have been updated across the entire platform and payment gateway.
          </p>
        </div>
      )}

      {/* Pricing list / cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">
            Loading current prices…
          </div>
        ) : (
          items.map((item) => {
            const meta = productMeta[item.id] ?? {
              tag: "Board",
              description: item.label,
              badgeColor: "bg-slate-100 text-slate-600 border-slate-200",
            };
            const isVip = item.id === "vip";

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-2xs ${
                  isVip
                    ? "border-blue-200 bg-blue-50/20"
                    : "border-slate-200/90 bg-white hover:border-slate-300"
                }`}
              >
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                  {/* Board Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.badgeColor}`}
                      >
                        {meta.tag}
                      </span>
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => updateLabel(item.id, e.target.value)}
                        className="bg-transparent font-sans text-sm font-bold text-slate-900 border-b border-dashed border-transparent hover:border-slate-300 focus:border-blue-600 focus:outline-none transition-colors"
                        title="Click to edit board title"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-400">
                        Live Display:
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-600">
                        GH₵ {Number(item.priceGhs).toLocaleString()}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-600">
                        ₦{Number(item.priceNgn).toLocaleString("en-NG")}
                      </span>
                    </div>
                  </div>

                  {/* Ghana Input (GHS) */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      🇬🇭 Ghana Price (GHS)
                    </label>
                    <div className="mt-1.5 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:bg-white focus-within:border-blue-600">
                      <span className="mr-2 font-mono text-xs font-extrabold text-blue-600">
                        GH₵
                      </span>
                      <input
                        type="number"
                        min={1}
                        step="1"
                        required
                        value={item.priceGhs === 0 ? "" : item.priceGhs}
                        onChange={(e) =>
                          updatePrice(
                            item.id,
                            "priceGhs",
                            Math.max(0, Number(e.target.value))
                          )
                        }
                        className="w-full bg-transparent font-mono text-xs font-bold text-slate-900 outline-none"
                        placeholder="e.g. 30"
                      />
                    </div>
                  </div>

                  {/* Nigeria Input (NGN) */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        🇳🇬 Nigeria Price (NGN)
                      </label>
                      <button
                        type="button"
                        onClick={() => autoCalculateNgn(item.id, exchangeRate)}
                        className="text-[10px] text-blue-600 hover:underline font-mono"
                        title={`Calculate using 1 GHS = ${exchangeRate} NGN`}
                      >
                        auto calc (₦{exchangeRate})
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:bg-white focus-within:border-blue-600">
                      <span className="mr-2 font-mono text-xs font-extrabold text-blue-600">
                        ₦
                      </span>
                      <input
                        type="number"
                        min={1}
                        step="1"
                        required
                        value={item.priceNgn === 0 ? "" : item.priceNgn}
                        onChange={(e) =>
                          updatePrice(
                            item.id,
                            "priceNgn",
                            Math.max(0, Number(e.target.value))
                          )
                        }
                        className="w-full bg-transparent font-mono text-xs font-bold text-slate-900 outline-none"
                        placeholder="e.g. 3600"
                      />
                    </div>
                  </div>

                  {/* Quick Summary Pill */}
                  <div className="hidden lg:block text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Status</p>
                    <span className="inline-block mt-1 text-xs font-semibold text-emerald-600">
                      Active
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Save Action Bar */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/95 p-4 backdrop-blur-md shadow-xl">
        <p className="text-xs text-slate-500">
          Click <span className="font-semibold text-slate-800">Save All Prices</span>{" "}
          to commit changes to the live database and payment gateway.
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm transition"
        >
          {saving ? "Saving…" : "Save All Prices"}
        </button>
      </div>
    </div>
  );
}
