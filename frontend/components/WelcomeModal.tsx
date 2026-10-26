"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useProducts } from "@/components/ProductsProvider";
import { compactCount } from "@/lib/format";
import type { SiteStats } from "@/lib/types";

const SEEN_KEY = "oddnext_welcome_seen";

export function WelcomeModal({ stats }: { stats: SiteStats }) {
  const { user, ready } = useAuth();
  const { vipProduct, slipProducts } = useProducts();
  const [open, setOpen] = useState(false);

  const vipPrice = vipProduct?.priceGhs ?? stats.vipPriceGhs;
  const minBoardPrice =
    slipProducts.length > 0
      ? Math.min(...slipProducts.map((p) => p.priceGhs))
      : 30;

  useEffect(() => {
    if (!ready) return;
    if (user?.vipActive) return;
    if (window.localStorage.getItem(SEEN_KEY)) return;
    setOpen(true);
  }, [ready, user]);

  function dismiss() {
    window.localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-[#0c0c0c] px-5 py-10 text-center shadow-slip sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,transparent_42%,#222_43%,#222_46%,transparent_47%)]" />
        </div>
        <span className="absolute left-5 top-8 h-2.5 w-2.5 rounded-full bg-fire" />
        <span className="absolute right-16 top-10 h-2 w-2 rounded-full bg-star" />
        <span className="absolute bottom-24 left-8 h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />
        <span className="absolute bottom-16 right-10 h-2 w-2 rounded-full bg-orange-400" />

        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 text-2xl leading-none text-white/50 hover:text-white"
          aria-label="Close"
        >
          ×
        </button>

        <div className="relative font-sans tracking-normal">
          <h2 className="text-4xl font-extrabold uppercase leading-[0.95] text-white sm:text-6xl">
            Unlock your
            <br />
            winning
            <br />
            <span className="text-fire">streak</span>{" "}
            <span aria-hidden>🔥</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
            Pay a board from GHS {minBoardPrice}, or join VIP for GHS {vipPrice} and open
            every slip. Nothing is posted free.
          </p>

          <div className="mx-auto mt-6 flex max-w-lg flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/70 sm:text-sm">
            <span>🏆 {stats.winRate}% win rate</span>
            <span>👥 {compactCount(stats.vipMembers)} VIP members</span>
            <span>⭐ Boards from GHS {minBoardPrice}</span>
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-3">
            <Link
              href="/profile"
              onClick={dismiss}
              className="btn-vip w-full px-6 py-3 text-sm font-extrabold uppercase tracking-wide sm:w-auto"
            >
              VIP 7-Day Pass · GHS {vipPrice} 👑
            </Link>
            <a
              href="#reveal-code"
              onClick={dismiss}
              className="text-xs font-semibold text-white/60 hover:text-fire"
            >
              Already paid? Enter reveal code →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
