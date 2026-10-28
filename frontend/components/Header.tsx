"use client";

import Link from "next/link";
import { useState } from "react";
import { HamburgerIcon } from "@/components/Hamburger";
import { BRAND_NAME } from "@/lib/api";

export function Header({
  overlay = false,
}: {
  telegramCount?: number;
  telegramUrl?: string;
  overlay?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const handleOpenReveal = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oddnext:open-reveal-modal"));
      if (window.location.pathname !== "/") {
        window.location.href = "/?reveal=1";
      } else {
        const el = document.getElementById("reveal-input") || document.getElementById("reveal-code");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          if (el instanceof HTMLInputElement) el.focus();
        }
      }
    }
  };

  return (
    <header
      className={
        overlay
          ? "absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-black/50 to-transparent"
          : "sticky top-0 z-40 border-b border-white/5 bg-paper/75 backdrop-blur-xl"
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-fire text-sm font-extrabold text-pitch-dark">
            ON
          </span>
          <span className="text-lg font-extrabold tracking-tight">{BRAND_NAME}</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-mute md:flex">
          <a href="#tips" className="flex items-center gap-2 transition hover:text-ink">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fire opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-fire" />
            </span>
            Live boards
          </a>
          <a href="#vip" className="transition hover:text-ink">
            VIP
          </a>
          <button
            type="button"
            onClick={handleOpenReveal}
            className="rounded-full border border-line bg-surface/80 px-3.5 py-1.5 text-xs font-semibold text-cream transition hover:border-fire/50 hover:bg-surface active:scale-95 cursor-pointer"
          >
            🔑 Reveal code
          </button>
          <Link href="/profile" className="btn-primary">
            Get VIP
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={handleOpenReveal}
            className="rounded-full border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-cream active:scale-95 cursor-pointer"
          >
            🔑 Code
          </button>
          <Link href="/profile" className="btn-primary px-3 py-1.5 text-xs">
            VIP
          </Link>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/20 text-ink"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <HamburgerIcon open={open} />
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-white/10 bg-paper/95 px-5 py-5 text-sm backdrop-blur-xl md:hidden">
          <a href="#tips" onClick={() => setOpen(false)} className="flex items-center gap-2 font-medium">
            <span className="h-2 w-2 rounded-full bg-fire animate-pulse" />
            Live boards
          </a>
          <a href="#vip" onClick={() => setOpen(false)} className="block font-medium">
            VIP Subscription
          </a>
          <button
            type="button"
            onClick={(e) => {
              setOpen(false);
              handleOpenReveal(e);
            }}
            className="block w-full text-left font-semibold text-fire cursor-pointer"
          >
            🔑 Enter Reveal Code
          </button>
          <Link href="/profile" className="btn-primary mt-2 inline-flex w-full">
            Get VIP Access
          </Link>
        </div>
      )}

    </header>
  );
}
