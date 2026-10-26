"use client";

import { useState } from "react";
import { getProduct } from "@/lib/products";
import type { PaidTip } from "@/lib/payments";

export function PaidSlip({
  tips,
  product,
  smsSent,
  revealCode,
  remainingUnlocks,
  daysRemaining,
  graceMinutes,
}: {
  tips: PaidTip[];
  product?: string;
  smsSent?: boolean;
  revealCode?: string;
  remainingUnlocks?: number | null;
  daysRemaining?: number | null;
  graceMinutes?: number;
}) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const label = getProduct(product ?? "")?.label ?? (product === "vip" ? "VIP All Boards" : "Board");
  const codes = [...new Set(tips.map((tip) => tip.bookingCode).filter(Boolean))];

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/40 backdrop-blur-sm">
      <div className="border-b border-line px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-fire">
            Unlocked
          </p>
          {revealCode && (
            <span className="rounded-full bg-fire/15 px-2.5 py-0.5 font-mono text-xs font-bold text-fire ring-1 ring-fire/30">
              Code: {revealCode}
            </span>
          )}
        </div>
        <h3 className="mt-1 text-xl font-extrabold text-cream sm:text-2xl">{label}</h3>
        <p className="mt-1 text-sm text-mute">
          {daysRemaining != null
            ? `VIP Subscription active · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining.`
            : remainingUnlocks != null
            ? `Usable ${remainingUnlocks} more time${remainingUnlocks === 1 ? "" : "s"}${graceMinutes ? ` (Active session: ${graceMinutes}m left)` : ""}.`
            : smsSent
            ? "This slip is on SMS and saved with your reveal code."
            : "Read it now or re-open anytime using your reveal code."}
        </p>
      </div>
      {tips.length === 0 ? (
        <p className="px-4 py-6 text-sm text-mute">
          This board is open. Nothing posted on it yet.
        </p>
      ) : (
        tips.map((tip) => (
          <div
            key={tip.id}
            className="flex items-start justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0"
          >
            <div>
              <p className="text-xs text-mute">{tip.league}</p>
              <p className="text-sm font-semibold">
                {tip.homeTeam} vs {tip.awayTeam}
              </p>
              <p className="text-sm text-star">{tip.prediction}</p>
            </div>
            <p className="font-mono text-sm">@{tip.odds}</p>
          </div>
        ))
      )}
      {codes.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper/90 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-mute">SportyBet / BetPawa:</span>
            <div className="flex flex-wrap gap-2">
              {codes.map((c) => (
                <span
                  key={c}
                  className="rounded-lg bg-fire/15 px-2.5 py-1 font-mono text-sm font-extrabold text-star ring-1 ring-fire/30"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(codes.join(", "))}
            className="rounded-lg bg-surface px-3 py-1.5 text-xs font-bold text-cream ring-1 ring-line transition hover:border-fire hover:bg-fire/10 hover:text-fire"
          >
            {copiedCode ? "✓ Copied to clipboard!" : "Copy Booking Code"}
          </button>
        </div>
      )}
    </div>
  );
}
