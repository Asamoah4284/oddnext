"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PaidSlip } from "@/components/PaidSlip";
import { apiFetch, fallbackStats } from "@/lib/api";
import {
  PAYMENT_EVENT,
  ackSlip,
  clearPayRef,
  verifyCheckout,
} from "@/lib/payments";

function PaymentReturnInner() {
  const params = useSearchParams();
  const reference =
    params.get("reference") ??
    params.get("trxref") ??
    params.get("externalref") ??
    "";
  const simulate = params.get("simulate") === "1";
  const embed = params.get("embed") === "1";
  const { token, ready, refresh } = useAuth();
  const [status, setStatus] = useState<"checking" | "paid" | "pending" | "error">(
    "checking"
  );
  const [message, setMessage] = useState("Confirming your payment…");
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState<{
    tips: NonNullable<Awaited<ReturnType<typeof verifyCheckout>>["tips"]>;
    product?: string;
    smsSent?: boolean;
    revealCode?: string;
    codeType?: string;
    remainingUnlocks?: number | null;
    daysRemaining?: number | null;
    vipExpiresAt?: string | null;
  } | null>(null);

  const inFrame = embed || (typeof window !== "undefined" && window.parent !== window);

  useEffect(() => {
    if (!reference || typeof window === "undefined") return;
    if (window.parent === window) return;
    window.parent.postMessage(
      { type: PAYMENT_EVENT, reference },
      window.location.origin
    );
  }, [reference]);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setStatus("error");
      setMessage("Open this page from the same browser you paid in.");
      return;
    }
    if (!reference) {
      setStatus("error");
      setMessage("Missing payment reference.");
      return;
    }

    let cancelled = false;
    const settled = { current: false };

    async function confirm(poll = false) {
      if (settled.current) return true;
      try {
        if (simulate && !poll) {
          await apiFetch("/api/payments/simulate", {
            method: "POST",
            token,
            body: JSON.stringify({ reference }),
          });
        }
        const result = await verifyCheckout(reference, token, poll);
        if (cancelled) return;
        if (result.status === "paid") {
          settled.current = true;
          clearPayRef();

          const isVip = result.product === "vip" || result.codeType === "vip";
          let daysLeft: number | null = null;
          if (result.vipExpiresAt) {
            const ms = new Date(result.vipExpiresAt).getTime() - Date.now();
            daysLeft = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
          } else if (isVip) {
            daysLeft = 7;
          }

          const remainingUnlocks = isVip
            ? null
            : Math.max(0, (result.maxUnlocks ?? 2) - (result.unlockCount ?? 0));

          setStatus("paid");
          setPaid({
            tips: result.tips ?? [],
            product: result.product,
            smsSent: result.smsSent,
            revealCode: result.revealCode,
            codeType: isVip ? "vip" : "single",
            remainingUnlocks,
            daysRemaining: daysLeft,
            vipExpiresAt: result.vipExpiresAt,
          });

          setMessage(
            isVip
              ? "Your 7-day VIP access is active on up to 2 devices. Save your code below!"
              : "Payment confirmed. You can use your reveal code twice to check this slip on any device."
          );

          await refresh();
          return true;
        }
        if (result.status === "proof_submitted") {
          setStatus("pending");
          setMessage("Payment proof received! ⏳ Our admin is reviewing your Opay transfer. Once approved, your odds will unlock immediately.");
          return false;
        }
        setStatus("pending");
        setMessage("Waiting for payment to confirm…");
        return false;
      } catch (err) {
        if (cancelled) return false;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Could not verify payment");
        return false;
      }
    }

    void confirm();
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 90_000) {
        window.clearInterval(timer);
        return;
      }
      void confirm(true);
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ready, token, reference, simulate, refresh]);

  const body = (
    <div className={inFrame ? "p-6" : "card p-8"}>
      <p className="text-sm font-medium text-fire">Payment Confirmed</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
        {status === "paid"
          ? paid?.codeType === "vip"
            ? "VIP Access Unlocked"
            : "Read your slip now"
          : "Payment status"}
      </h1>
      <p className="mt-3 text-sm text-mute">{message}</p>

      {status === "paid" && paid?.revealCode && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-fire/35 bg-fire/5 p-5 text-left">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-fire">
                Your Unique Reveal Code
              </p>
              <p className="mt-1 font-mono text-3xl font-black tracking-widest text-cream">
                {paid.revealCode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(paid.revealCode || "");
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }}
              className="rounded-xl bg-fire px-4 py-2 text-xs font-extrabold text-pitch-dark transition hover:bg-fire/90"
            >
              {copied ? "Copied to clipboard!" : "Copy Code"}
            </button>
          </div>
          <div className="mt-4 border-t border-line/60 pt-3 text-xs text-mute">
            {paid.codeType === "vip" ? (
              <p>
                👑 <strong>VIP 7-Day Access:</strong> Usable on up to 2 devices for 7 days.
                You can also retrieve your code anytime on the home screen using your phone number.
              </p>
            ) : (
              <p>
                🔒 <strong>Single Board Code:</strong> Can be used <strong>2 times total</strong> to reveal these odds on any device (refreshes within 30 min are free). You can also look up your code anytime with your phone number on the home page.
              </p>
            )}
          </div>
        </div>
      )}

      {status === "paid" && paid && (
        <div className="mt-6">
          <PaidSlip
            tips={paid.tips}
            product={paid.product}
            smsSent={paid.smsSent}
            revealCode={paid.revealCode}
            remainingUnlocks={paid.remainingUnlocks}
            daysRemaining={paid.daysRemaining}
          />
        </div>
      )}

      {!inFrame && (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn-primary">
            Back home
          </Link>
          <Link href="/profile" className="btn-outline">
            Buy another board
          </Link>
        </div>
      )}
    </div>
  );

  if (inFrame) {
    return <main className="min-h-screen bg-paper">{body}</main>;
  }

  return (
    <>
      <Header
        telegramCount={fallbackStats.telegramCount}
        telegramUrl={fallbackStats.telegramUrl}
      />
      <main className="mx-auto max-w-2xl px-4 py-16">{body}</main>
      <Footer />
    </>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center text-mute">
          Checking payment…
        </main>
      }
    >
      <PaymentReturnInner />
    </Suspense>
  );
}
