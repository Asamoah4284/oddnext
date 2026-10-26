"use client";

import Link from "next/link";
import { formatProductPrice } from "@/lib/products";
import { useProducts } from "@/components/ProductsProvider";

const blurbs: Record<string, string> = {
  odds10: "Banker slip",
  odds50: "Stronger acca",
  odds100: "High odds slip",
  draw: "Draws only",
  correctScore: "Exact scores",
  vip: "Every board open",
};

export function VipPromo({ price }: { price?: number }) {
  const { slipProducts, vipProduct } = useProducts();
  const vip = vipProduct ?? { priceGhs: price ?? 1500, priceNgn: 180000 };

  return (
    <section id="vip" className="mx-auto max-w-6xl px-4 pb-4">
      <div className="overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_top_right,#22c55e33,transparent_40%),linear-gradient(160deg,#141917,#0f1613)] p-5 sm:p-8 md:p-12">
        <p className="text-sm font-medium text-star">Boards + VIP</p>
        <h2 className="mt-2 text-2xl font-extrabold leading-snug sm:text-5xl">
          Pay one board, or unlock all.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-mute sm:text-base">
          Pick a slip and pay that price. VIP is {formatProductPrice(vip, "GH")} or{" "}
          {formatProductPrice(vip, "NG")} and opens every board, with booking codes.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
          <span className="rounded-full bg-fire/15 px-3 py-1 font-semibold text-star ring-1 ring-fire/30">
            👑 7 Days Full Access
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white/90 ring-1 ring-white/15">
            📱 Valid on 2 Devices
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white/90 ring-1 ring-white/15">
            ⚡ Instant Unlock Code
          </span>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md">
          {slipProducts.map((item) => (
            <Link
              key={item.id}
              href="/profile"
              className="flex items-center justify-between gap-4 border-t border-white/10 px-4 py-4 transition hover:bg-white/5 first:border-t-0"
            >
              <div>
                <p className="text-base font-bold text-cream">{item.label}</p>
                <p className="mt-0.5 text-xs text-mute">{blurbs[item.id]}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-extrabold text-star">
                  {formatProductPrice(item, "GH")}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-mute">
                  {formatProductPrice(item, "NG")}
                </p>
              </div>
            </Link>
          ))}
          <Link
            href="/profile"
            className="flex items-center justify-between gap-4 border-t border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-star/15 px-4 py-4 transition hover:brightness-110"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-base font-extrabold text-white">{vip.label || "VIP all access"}</p>
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-pitch-dark">
                  7 Days
                </span>
              </div>
              <p className="mt-0.5 text-xs text-star/80">Every board + SportyBet codes + 2 devices</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-black text-amber-300">
                {formatProductPrice(vip, "GH")}
              </p>
              <p className="mt-0.5 text-xs font-bold text-amber-300/80">
                {formatProductPrice(vip, "NG")}
              </p>
            </div>
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/profile" className="btn-vip w-full sm:w-auto">
            Get 7-Day VIP Pass 👑
          </Link>
          <a
            href="#reveal-code"
            className="text-xs font-semibold text-mute hover:text-star sm:text-sm"
          >
            Already have a VIP code? Enter it above ↑
          </a>
        </div>
      </div>
    </section>
  );
}
