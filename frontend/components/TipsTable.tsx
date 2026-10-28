"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { MoolreCheckout } from "@/components/MoolreCheckout";
import { NigeriaPaymentModal } from "@/components/NigeriaPaymentModal";
import { PaidSlip } from "@/components/PaidSlip";
import { PhoneField } from "@/components/PhoneField";
import { fetchTips } from "@/lib/api";
import { useMoolrePay } from "@/hooks/useMoolrePay";
import type { PaymentVerify } from "@/lib/payments";
import { formatKickoff } from "@/lib/format";
import { canAccessBoard, formatProductPrice } from "@/lib/products";
import { useProducts } from "@/components/ProductsProvider";
import type { SlipProductId } from "@/lib/products";
import type { Tip, TipsResponse } from "@/lib/types";
import {
  revealCode,
  lookupCodesByPhone,
  type RevealResponse,
  type LookupCodeItem,
  type LookupPendingItem,
} from "@/lib/codes";

const days = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
] as const;

function ResultChip({ status }: { status: Tip["status"] }) {
  if (status === "won") {
    return (
      <span className="rounded-full bg-won/15 px-2.5 py-1 text-xs font-semibold text-won">
        Won
      </span>
    );
  }
  if (status === "lost") {
    return (
      <span className="rounded-full bg-lost/15 px-2.5 py-1 text-xs font-semibold text-lost">
        Lost
      </span>
    );
  }
  return null;
}

export function TipsTable({ initial }: { initial: TipsResponse }) {
  const { token, user, ready } = useAuth();
  const { slipProducts, vipProduct } = useProducts();
  const {
    busy,
    error,
    phone,
    setPhone,
    country,
    setCountry,
    checkout,
    opayCheckout,
    paid,
    startPay,
    handlePaid,
    dismissPaid,
    closeCheckout,
    closeOpayCheckout,
  } = useMoolrePay();
  const [tab, setTab] = useState<TipsResponse["tab"]>(initial.tab);
  const [board, setBoard] = useState<SlipProductId>(initial.board || "odds10");
  const onPaid = useCallback(
    (result: PaymentVerify) => {
      if (result.product && result.product !== "vip") {
        setBoard(result.product as SlipProductId);
      }
      void handlePaid(result);
    },
    [handlePaid]
  );
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  const [revealedSlip, setRevealedSlip] = useState<RevealResponse | null>(null);
  const [revealInput, setRevealInput] = useState("");
  const [revealBusy, setRevealBusy] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("oddnext_reveal_code");
      if (saved) {
        setActiveCode(saved);
      }
    }
  }, []);

  const [showLookupModal, setShowLookupModal] = useState(false);
  const [lookupPhoneInput, setLookupPhoneInput] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundCodes, setFoundCodes] = useState<LookupCodeItem[] | null>(null);
  const [foundPending, setFoundPending] = useState<LookupPendingItem[] | null>(null);
  const [copiedClusterCode, setCopiedClusterCode] = useState<string | null>(null);

  // Listen for header "Reveal code" button click and ?reveal=1 query param
  useEffect(() => {
    const handleOpen = () => {
      setShowLookupModal(true);
      setLookupError(null);
      const revealEl = document.getElementById("reveal-code");
      if (revealEl) {
        revealEl.scrollIntoView({ behavior: "smooth", block: "center" });
        const input = revealEl.querySelector("input");
        if (input) input.focus();
      }
    };

    window.addEventListener("oddnext:open-reveal-modal", handleOpen);

    if (typeof window !== "undefined" && window.location.search.includes("reveal=1")) {
      handleOpen();
    }

    return () => {
      window.removeEventListener("oddnext:open-reveal-modal", handleOpen);
    };
  }, []);

  const handleReveal = async (codeToUse?: string) => {
    const target = (codeToUse || revealInput).trim();
    if (!target) {
      setRevealError("Please enter your phone number or reveal code");
      return;
    }
    setRevealBusy(true);
    setRevealError(null);
    try {
      const res = await revealCode(target);
      setRevealedSlip(res);
      const codeKey = res.code || target;
      if (typeof window !== "undefined") {
        localStorage.setItem("oddnext_reveal_code", codeKey);
      }
      setActiveCode(codeKey);
      if (res.product && res.product !== "vip") {
        setBoard(res.product as SlipProductId);
      }
      setShowLookupModal(false);
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : "Failed to reveal odds");
    } finally {
      setRevealBusy(false);
    }
  };

  const clearActiveCode = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("oddnext_reveal_code");
    }
    setActiveCode(null);
    setRevealedSlip(null);
  };

  const handleLookup = async () => {
    const input = lookupPhoneInput.trim();
    if (!input) {
      setLookupError("Enter your phone number or reveal code");
      return;
    }
    setLookupBusy(true);
    setLookupError(null);
    setFoundCodes(null);
    setFoundPending(null);

    // If input contains letters or starts with typical code prefixes, reveal directly
    const hasLetters = /[a-zA-Z]/.test(input);
    if (hasLetters || input.toUpperCase().startsWith("VIP") || input.toUpperCase().startsWith("ODD")) {
      try {
        const res = await revealCode(input);
        setRevealedSlip(res);
        const codeKey = res.code || input;
        if (typeof window !== "undefined") {
          localStorage.setItem("oddnext_reveal_code", codeKey);
        }
        setActiveCode(codeKey);
        if (res.product && res.product !== "vip") {
          setBoard(res.product as SlipProductId);
        }
        setShowLookupModal(false);
        return;
      } catch (err) {
        setLookupError(err instanceof Error ? err.message : "Code not found");
        setLookupBusy(false);
        return;
      }
    }

    try {
      const res = await lookupCodesByPhone(input);
      setFoundCodes(res.codes);
      setFoundPending(res.pending || null);
      if (res.codes.length === 0 && (!res.pending || res.pending.length === 0)) {
        // Fallback: try direct reveal by phone number
        try {
          const direct = await revealCode(input);
          if (direct && direct.tips && direct.tips.length > 0) {
            setRevealedSlip(direct);
            const codeKey = direct.code || input;
            if (typeof window !== "undefined") {
              localStorage.setItem("oddnext_reveal_code", codeKey);
            }
            setActiveCode(codeKey);
            setShowLookupModal(false);
            return;
          }
        } catch {
          // ignore fallback error
        }
        setLookupError("No active paid odds found for this phone number or code");
      }
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupBusy(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    fetchTips(tab, token, board, activeCode)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            tab,
            board,
            vipAccess: false,
            boardAccess: false,
            entitlements: [],
            tips: [],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, board, token, ready, user?.vipActive, user?.entitlements, activeCode]);

  const clusters = useMemo(() => {
    const groups: { code: string; tips: Tip[] }[] = [];
    const index = new Map<string, number>();
    for (const tip of data.tips) {
      const code = tip.bookingCode || "";
      if (!code) {
        groups.push({ code: "", tips: [tip] });
        continue;
      }
      const existing = index.get(code);
      if (existing === undefined) {
        index.set(code, groups.length);
        groups.push({ code, tips: [tip] });
      } else {
        groups[existing].tips.push(tip);
      }
    }
    return groups;
  }, [data.tips]);

  const selected = slipProducts.find((item) => item.id === board) ?? slipProducts[0] ?? {
    id: board,
    label: "10 odds",
    priceGhs: 30,
    priceNgn: 100,
  };
  const unlocked = data.boardAccess || canAccessBoard(user, board);

  return (
    <section id="tips" className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-6">
        <p className="text-sm font-medium text-fire">Live boards</p>
        <h2 className="font-sans text-3xl font-extrabold tracking-tight md:text-4xl">
          Today’s games
        </h2>
        <p className="mt-2 text-sm text-mute">
          Pick a board. Pay that price, or join VIP for {formatProductPrice(vipProduct, country)} and open all.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {slipProducts.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setBoard(item.id)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 active:scale-95 ${
              board === item.id
                ? "bg-gradient-to-r from-fire to-emerald-400 text-pitch-dark shadow-[0_0_20px_rgba(34,197,94,0.35)]"
                : "border border-line bg-surface/80 text-mute hover:border-fire/40 hover:text-cream"
            }`}
          >
            {item.label}
            <span
              className={`ml-2 text-xs font-semibold ${
                board === item.id ? "text-pitch-dark/80" : "text-star"
              }`}
            >
              {formatProductPrice(item, country)}
            </span>
          </button>
        ))}
      </div>

      {activeCode && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fire/30 bg-fire/10 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-fire animate-pulse" />
            <span className="text-mute">
              Active VIP / Reveal Pass: <strong className="font-mono text-cream font-bold">{activeCode}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={clearActiveCode}
            className="text-xs font-semibold text-mute hover:text-fire underline"
          >
            Clear / Switch Code
          </button>
        </div>
      )}

      <div className="mb-4 flex w-full rounded-full bg-surface p-1 ring-1 ring-line md:w-fit">
        {days.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold md:flex-none md:px-4 ${
              tab === item.id ? "bg-fire text-pitch-dark" : "text-mute"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {revealedSlip && (
        <div className="mb-6">
          <PaidSlip
            tips={revealedSlip.tips}
            product={revealedSlip.product}
            revealCode={revealedSlip.code}
            remainingUnlocks={revealedSlip.remainingUnlocks}
            daysRemaining={revealedSlip.daysRemaining}
            dailyRemainingUnlocks={revealedSlip.dailyRemainingUnlocks}
            maxDailyUnlocks={revealedSlip.maxDailyUnlocks}
            graceMinutes={revealedSlip.graceMinutesRemaining}
          />
          <button
            type="button"
            onClick={() => setRevealedSlip(null)}
            className="btn-outline mt-3 text-xs"
          >
            Close revealed slip
          </button>
        </div>
      )}

      {paid?.status === "paid" && (paid.tips?.length ?? 0) > 0 && !revealedSlip && (
        <div className="mb-6">
          <PaidSlip
            tips={paid.tips ?? []}
            product={paid.product}
            smsSent={paid.smsSent}
            revealCode={paid.revealCode}
          />
          <button
            type="button"
            onClick={dismissPaid}
            className="btn-outline mt-3 text-xs"
          >
            Done · slip stays on SMS only
          </button>
        </div>
      )}

      {!unlocked && !revealedSlip ? (
        <div className="card relative overflow-hidden p-6 text-center sm:p-10">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-fire/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-star/10 blur-3xl" />

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-fire/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-fire ring-1 ring-fire/30">
              🔒 {selected.label} Banker Vault
            </span>
            <h3 className="mt-3 font-sans text-2xl font-black tracking-tight text-white sm:text-4xl">
              Pay {formatProductPrice(selected, country)} to unlock this board.
            </h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-mute sm:text-base">
              SportyBet and BetPawa codes, handicap bankers, and kickoff picks stay hidden until you pay — or unlock every board for 7 days with VIP for {formatProductPrice(vipProduct, country)}.
            </p>

            <div className="mx-auto mt-6 max-w-sm text-left">
              <p className="mb-1.5 text-xs font-semibold text-mute">Your Mobile Money Number</p>
              <PhoneField
                value={phone}
                onChange={setPhone}
                country={country}
                onCountryChange={setCountry}
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void startPay(selected.id)}
                disabled={Boolean(busy)}
                className="btn-primary min-w-[200px]"
              >
                {busy === selected.id
                  ? "Opening checkout…"
                  : `Unlock ${selected.label} · ${formatProductPrice(selected, country)}`}
              </button>
              <button
                type="button"
                onClick={() => void startPay("vip")}
                disabled={Boolean(busy)}
                className="btn-vip min-w-[200px]"
              >
                {busy === "vip"
                  ? "Opening checkout…"
                  : `7-Day VIP · ${formatProductPrice(vipProduct, country)} 👑`}
              </button>
            </div>
            {error && <p className="mt-4 text-sm text-lost">{error}</p>}

            {/* Reveal Code Section */}
            <div className="relative my-8 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line/80" />
              </div>
              <span className="relative rounded-full border border-line bg-surface px-4 py-1 text-xs font-bold uppercase tracking-wider text-mute">
                Already paid? Unlock with phone or code
              </span>
            </div>

            <div id="reveal-code" className="mx-auto max-w-sm rounded-2xl border border-fire/30 bg-paper/90 p-5 text-left shadow-lg ring-1 ring-fire/20">
              <label htmlFor="reveal-input" className="flex items-center gap-1.5 text-xs font-bold text-cream">
                <span>🔑</span> Enter Phone Number or Reveal Code
              </label>
              <p className="mt-1 text-[11px] text-mute">
                Paid in Nigeria or Ghana? Enter the phone number you paid with to see your odds.
              </p>
              <div className="mt-2.5 flex gap-2">
                <input
                  id="reveal-input"
                  type="text"
                  value={revealInput}
                  onChange={(e) => {
                    setRevealInput(e.target.value.toUpperCase());
                    setRevealError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void handleReveal();
                    }
                  }}
                  placeholder="e.g. 07082511762 or VIP-12345"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 font-mono text-sm uppercase tracking-wider text-cream focus:border-fire focus:ring-1 focus:ring-fire/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleReveal()}
                  disabled={revealBusy || !revealInput.trim()}
                  className="btn-primary whitespace-nowrap px-4 py-2.5 text-xs font-bold"
                >
                  {revealBusy ? "Checking…" : "View Odds"}
                </button>
              </div>
              {revealError && (
                <p className="mt-2 text-xs font-medium text-lost">{revealError}</p>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-xs text-mute">
                <span>Checking payment status?</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowLookupModal(true);
                    setLookupError(null);
                    setFoundCodes(null);
                    if (phone) setLookupPhoneInput(phone);
                  }}
                  className="font-bold text-fire hover:underline"
                >
                  Check by phone number →
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="hidden grid-cols-[1fr_1.4fr_0.9fr_0.5fr_0.6fr_0.7fr] px-4 py-3 text-xs text-mute md:grid">
            <span>League</span>
            <span>Fixture</span>
            <span>Pick</span>
            <span>Odds</span>
            <span>KO</span>
            <span>Result</span>
          </div>
          {loading && <p className="px-4 py-6 text-sm text-mute">Updating…</p>}
          {!loading && data.tips.length === 0 && (
            <p className="px-4 py-8 text-sm text-mute">
              Nothing on this board yet. Check back after midday.
            </p>
          )}
          {clusters.map((cluster, i) => (
            <div key={`${cluster.code}-${i}`} className="border-t border-line">
              {cluster.tips.map((tip) => (
                <div
                  key={tip.id}
                  className="grid gap-2 px-4 py-4 md:grid-cols-[1fr_1.4fr_0.9fr_0.5fr_0.6fr_0.7fr] md:items-center"
                >
                  <div className="flex items-center justify-between gap-2 md:block">
                    <p className="text-xs text-mute">{tip.league}</p>
                    <span className="md:hidden">
                      <ResultChip status={tip.status} />
                    </span>
                  </div>
                  <p className="text-sm font-semibold">
                    {tip.homeTeam} <span className="font-normal text-mute">vs</span>{" "}
                    {tip.awayTeam}
                  </p>
                  <div className="flex items-center justify-between gap-3 text-sm md:contents">
                    <p className="text-star">{tip.prediction}</p>
                    <p className="font-mono">{tip.odds ? tip.odds.toFixed(2) : "—"}</p>
                    <p className="text-mute md:text-ink">{formatKickoff(tip.kickoffAt)}</p>
                  </div>
                  <div className="hidden md:block">
                    <ResultChip status={tip.status} />
                  </div>
                </div>
              ))}
              {cluster.code && (
                <div className="flex items-center justify-between bg-paper/80 px-4 py-2.5">
                  <span className="text-xs text-mute">Booking code</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-fire/10 px-2 py-1 font-mono text-sm font-semibold text-star">
                      {cluster.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(cluster.code);
                        setCopiedClusterCode(cluster.code);
                        setTimeout(() => setCopiedClusterCode(null), 2000);
                      }}
                      className="rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-mute hover:border-fire/40 hover:text-cream"
                    >
                      {copiedClusterCode === cluster.code ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {checkout && (
        <MoolreCheckout
          session={checkout}
          onClose={closeCheckout}
          onPaid={onPaid}
        />
      )}
      {opayCheckout && (
        <NigeriaPaymentModal
          session={opayCheckout}
          onClose={closeOpayCheckout}
          onPaid={onPaid}
        />
      )}

      {/* Phone Lookup Modal */}
      {showLookupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-line bg-paper p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-fire">
                  Instant Unlock
                </p>
                <h3 className="mt-1 font-sans text-xl font-extrabold text-cream">
                  Reveal Odds or Check Code
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLookupModal(false)}
                className="rounded-full p-2 text-mute hover:bg-surface hover:text-cream"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-mute">
              Enter your Reveal Code (e.g. <span className="font-mono text-star font-bold">VIP-12345</span>) or the phone number you paid with to see your predictions.
            </p>

            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={lookupPhoneInput}
                onChange={(e) => {
                  setLookupPhoneInput(e.target.value);
                  setLookupError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleLookup();
                  }
                }}
                placeholder="e.g. VIP-12345 or 07082511762"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-cream focus:border-fire focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleLookup()}
                disabled={lookupBusy || !lookupPhoneInput.trim()}
                className="btn-primary whitespace-nowrap px-4 py-2 text-xs"
              >
                {lookupBusy ? "Checking…" : "Unlock / Check"}
              </button>
            </div>

            {lookupError && (
              <p className="mt-3 text-xs text-lost">{lookupError}</p>
            )}

            {foundPending && foundPending.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <span>⏳</span>
                  <span>Payment Under Admin Review</span>
                </div>
                {foundPending.map((p) => (
                  <div key={p.reference} className="text-[11px] text-cream/90 font-mono bg-surface/60 rounded-xl p-2.5 border border-line">
                    <p className="font-bold text-cream">
                      {p.product.toUpperCase()} Transfer ({p.currency} {Number(p.amount).toLocaleString()})
                    </p>
                    <p className="text-mute text-[10px] mt-0.5">
                      Ref: {p.reference} · {p.proofSubmitted ? "Proof received" : "Awaiting proof"}
                    </p>
                    <p className="text-amber-400 text-[10px] mt-1">
                      Our admin is verifying your Opay transfer. Once approved, your odds SMS and reveal code will be activated!
                    </p>
                  </div>
                ))}
              </div>
            )}

            {foundCodes && foundCodes.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-xs font-semibold text-cream">Active codes found:</p>
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {foundCodes.map((c) => (
                    <div
                      key={c.code}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 p-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-black tracking-wide text-star">
                            {c.code}
                          </span>
                          <span className="rounded bg-fire/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-fire">
                            {c.type === "vip" ? "VIP" : c.product}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-mute">
                          {c.type === "vip"
                            ? `${c.daysRemaining} days left · ${c.dailyRemainingUnlocks ?? 3}/${c.maxDailyUnlocks ?? 3} unlocks left today`
                            : `${c.remainingUnlocks} use${c.remainingUnlocks === 1 ? "" : "s"} left`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleReveal(c.code)}
                        className="rounded-xl bg-fire/20 px-3 py-1.5 text-xs font-bold text-fire hover:bg-fire hover:text-pitch-dark"
                      >
                        Use Code
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowLookupModal(false)}
                className="btn-outline text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
