"use client";

import { useMemo, useState } from "react";
import { getProduct } from "@/lib/products";
import type { PaidTip } from "@/lib/payments";

export function PaidSlip({
  tips,
  product,
  smsSent,
  revealCode,
  remainingUnlocks,
  daysRemaining,
  dailyRemainingUnlocks,
  maxDailyUnlocks,
  graceMinutes,
}: {
  tips: PaidTip[];
  product?: string;
  smsSent?: boolean;
  revealCode?: string;
  remainingUnlocks?: number | null;
  daysRemaining?: number | null;
  dailyRemainingUnlocks?: number | null;
  maxDailyUnlocks?: number | null;
  graceMinutes?: number;
}) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const isVip = product === "vip";
  const label = getProduct(product ?? "")?.label ?? (isVip ? "VIP All Access (All Boards)" : "Board");

  const boardGroups = useMemo(() => {
    if (!isVip) return null;
    const map = new Map<string, { productId: string; label: string; bookingCode: string; tips: PaidTip[] }>();
    const order = ["odds10", "odds50", "odds100", "draw", "correctScore"];
    for (const p of order) {
      map.set(p, {
        productId: p,
        label: getProduct(p)?.label ?? p,
        bookingCode: "",
        tips: [],
      });
    }

    for (const tip of tips) {
      const p = tip.product || "odds10";
      let g = map.get(p);
      if (!g) {
        g = {
          productId: p,
          label: getProduct(p)?.label ?? p,
          bookingCode: tip.bookingCode || "",
          tips: [],
        };
        map.set(p, g);
      }
      if (!g.bookingCode && tip.bookingCode) g.bookingCode = tip.bookingCode;
      g.tips.push(tip);
    }

    return Array.from(map.values()).filter((g) => g.tips.length > 0);
  }, [tips, isVip]);

  const allCodes = useMemo(() => {
    return [...new Set(tips.map((tip) => tip.bookingCode).filter(Boolean))];
  }, [tips]);

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/40 shadow-xl backdrop-blur-sm">
      <div className="border-b border-line bg-paper/60 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-fire animate-pulse" />
            <p className="text-xs font-bold uppercase tracking-wider text-fire">
              {isVip ? "VIP Full Vault Unlocked" : "Single Slip Unlocked"}
            </p>
          </div>
          {revealCode && (
            <span className="rounded-full bg-fire/15 px-3 py-1 font-mono text-xs font-extrabold text-fire ring-1 ring-fire/30">
              Pass: {revealCode}
            </span>
          )}
        </div>
        <h3 className="mt-2 text-2xl font-black text-cream sm:text-3xl">{label}</h3>
        <p className="mt-1 text-sm text-mute">
          {daysRemaining != null ? (
            <span>
              VIP 7-Day All-Access · {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining ·{" "}
              <span className="font-semibold text-star">
                {dailyRemainingUnlocks ?? 3} of {maxDailyUnlocks ?? 3} unlocks left today
              </span>
              {graceMinutes ? ` (Active session: ${graceMinutes}m left)` : ""}. Resets everyday.
            </span>
          ) : remainingUnlocks != null ? (
            `Usable ${remainingUnlocks} more time${remainingUnlocks === 1 ? "" : "s"}${graceMinutes ? ` (Active session: ${graceMinutes}m left)` : ""}.`
          ) : smsSent ? (
            "This slip is sent to SMS and saved under your reveal code."
          ) : (
            "Active slip · copy booking codes to bet on SportyBet or BetPawa."
          )}
        </p>

        {isVip && allCodes.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fire/20 bg-fire/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-star">All Booking Codes:</span>
              {allCodes.map((c) => (
                <span
                  key={c}
                  className="rounded-lg bg-surface px-2.5 py-1 font-mono text-xs font-bold text-cream ring-1 ring-line"
                >
                  {c}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => handleCopy(allCodes.join(" "))}
              className="rounded-lg bg-fire px-3 py-1 text-xs font-bold text-pitch-dark transition hover:brightness-110"
            >
              {copiedCode === allCodes.join(" ") ? "✓ All Copied" : "Copy All Codes"}
            </button>
          </div>
        )}
      </div>

      {tips.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-mute">
          This board is unlocked. Waiting for next batch from admin.
        </p>
      ) : isVip && boardGroups ? (
        <div className="divide-y divide-line/60">
          {boardGroups.map((group) => (
            <div key={group.productId} className="p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-md bg-fire/15 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-fire ring-1 ring-fire/20">
                    {group.label}
                  </span>
                  <span className="text-xs text-mute font-medium">({group.tips.length} games)</span>
                </div>
                {group.bookingCode && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-mute">Code:</span>
                    <span className="rounded-lg bg-paper px-2.5 py-1 font-mono text-xs font-extrabold text-star ring-1 ring-line">
                      {group.bookingCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(group.bookingCode)}
                      className="rounded bg-surface px-2 py-1 text-xs font-bold text-mute hover:text-cream"
                    >
                      {copiedCode === group.bookingCode ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {group.tips.map((tip) => (
                  <div
                    key={tip.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line/40 bg-surface/50 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="text-[11px] font-medium text-mute">{tip.league}</p>
                      <p className="font-bold text-cream">
                        {tip.homeTeam} <span className="font-normal text-mute">vs</span> {tip.awayTeam}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-star">{tip.prediction}</p>
                      <p className="font-mono text-xs text-mute">@{tip.odds}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {tips.map((tip) => (
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
          ))}

          {allCodes.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper/90 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-mute">SportyBet / BetPawa:</span>
                <div className="flex flex-wrap gap-2">
                  {allCodes.map((c) => (
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
                onClick={() => handleCopy(allCodes.join(", "))}
                className="rounded-lg bg-surface px-3 py-1.5 text-xs font-bold text-cream ring-1 ring-line transition hover:border-fire hover:bg-fire/10 hover:text-fire"
              >
                {copiedCode ? "✓ Copied to clipboard!" : "Copy Booking Code"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
