"use client";

import { useEffect, useRef, useState } from "react";
import {
  isPaymentMessage,
  verifyCheckout,
  type PaymentVerify,
} from "@/lib/payments";

export type CheckoutSession = {
  authorizationUrl: string;
  reference: string;
  token: string | null;
};

export function MoolreCheckout({
  session,
  onClose,
  onPaid,
}: {
  session: CheckoutSession;
  onClose: () => void;
  onPaid: (result: PaymentVerify) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const done = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    done.current = false;
    setConfirming(false);

    async function check(poll = true) {
      if (done.current || inFlight.current) return;
      inFlight.current = true;
      try {
        const result = await verifyCheckout(
          session.reference,
          session.token,
          poll
        );
        if (result.status === "paid") {
          done.current = true;
          setConfirming(true);
          onPaid(result);
        }
      } catch {
        // Keep polling; a single failed check should not close checkout.
      } finally {
        inFlight.current = false;
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isPaymentMessage(event.data)) return;
      if (event.data.reference !== session.reference) return;
      setConfirming(true);
      void check(false);
    }

    window.addEventListener("message", onMessage);
    const started = Date.now();
    const timer = window.setInterval(() => {
      // Poll for up to 5 minutes to accommodate MoMo approval delays
      if (Date.now() - started > 300_000) {
        window.clearInterval(timer);
        return;
      }
      void check(true);
    }, 3000);
    void check(true);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(timer);
    };
  }, [session.reference, session.token, onPaid]);

  const handleManualCheck = async () => {
    setConfirming(true);
    try {
      const result = await verifyCheckout(session.reference, session.token, false);
      if (result.status === "paid") {
        done.current = true;
        onPaid(result);
        return;
      }
      // If not yet confirmed, brief pause then hide overlay
      setTimeout(() => setConfirming(false), 2000);
    } catch {
      setTimeout(() => setConfirming(false), 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b1220]">
      {/* Top control bar */}
      <div className="flex items-center justify-between border-b border-line/40 bg-pitch-dark px-4 py-2.5 text-xs text-mute">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Awaiting Mobile Money prompt on your phone…
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualCheck}
            className="rounded-lg bg-fire/20 px-3 py-1 font-semibold text-fire border border-fire/30 hover:bg-fire/30 transition"
          >
            I have paid / Check status
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-base text-white hover:bg-white/20 transition"
          >
            ×
          </button>
        </div>
      </div>

      <div className="relative flex-1 bg-white">
        <iframe
          title="Moolre checkout"
          src={session.authorizationUrl}
          className="h-full w-full border-0"
          allow="payment *; publickey-credentials-get *"
        />
        {confirming && (
          <div className="absolute inset-0 grid place-items-center bg-[#0b1220]/90">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-fire border-t-transparent mb-3" />
              <p className="text-sm font-semibold text-cream">Confirming payment with Mobile Money…</p>
              <p className="text-xs text-mute mt-1">Unlocking your slip right now…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
