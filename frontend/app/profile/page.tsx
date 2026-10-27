"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MoolreCheckout } from "@/components/MoolreCheckout";
import { NigeriaPaymentModal } from "@/components/NigeriaPaymentModal";
import { PaidSlip } from "@/components/PaidSlip";
import { PhoneField } from "@/components/PhoneField";
import { useMoolrePay } from "@/hooks/useMoolrePay";
import { fallbackStats } from "@/lib/api";
import { formatProductPrice } from "@/lib/products";
import { useProducts } from "@/components/ProductsProvider";

export default function ProfilePage() {
  const { user } = useAuth();
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

  const allAccess = user?.role === "admin" || Boolean(user?.vipActive);

  return (
    <>
      <Header
        telegramCount={fallbackStats.telegramCount}
        telegramUrl={fallbackStats.telegramUrl}
      />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-fire">Boards</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-cream sm:text-5xl">
            {allAccess ? "VIP · all boards" : "Pay first. Then you see the odds."}
          </h1>
          <p className="mt-3 text-sm leading-6 text-mute sm:text-base">
            {allAccess
              ? "Every odds board is open."
              : "Ghana pays with Mobile Money. Nigeria pays via Opay direct transfer (7082511762). After payment confirms, the slip opens here and is sent by SMS."}
          </p>
        </div>

        {paid?.status === "paid" && (paid.tips?.length ?? 0) > 0 && (
          <div className="mt-8">
            <PaidSlip
              tips={paid.tips ?? []}
              product={paid.product}
              smsSent={paid.smsSent}
            />
            <button type="button" onClick={dismissPaid} className="btn-outline mt-4">
              Done · slip stays on SMS only
            </button>
          </div>
        )}

        {!allAccess && (
          <div className="card mt-8 max-w-md p-5">
            <PhoneField
              value={phone}
              onChange={setPhone}
              country={country}
              onCountryChange={setCountry}
            />
          </div>
        )}

        {allAccess ? (
          <div className="card mt-8 p-6">
            <Link href="/#tips" className="btn-primary">
              Open today’s boards
            </Link>
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface">
            {slipProducts.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 border-t border-line px-4 py-4 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="text-base font-bold text-cream">{item.label}</p>
                  <p className="mt-0.5 text-sm font-extrabold text-star">
                    {formatProductPrice(item, country)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void startPay(item.id)}
                  disabled={Boolean(busy)}
                  className="btn-outline shrink-0 px-4 py-2 text-sm"
                >
                  {busy === item.id ? "…" : "Pay"}
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-star/15 px-4 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-extrabold text-white">{vipProduct?.label || "VIP all access"}</p>
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-pitch-dark">
                    7 Days
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-star/80">Every board + SportyBet codes + 2 devices</p>
                <p className="mt-1 text-sm font-black text-amber-300">
                  {formatProductPrice(vipProduct, country)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void startPay("vip")}
                disabled={Boolean(busy)}
                className="btn-vip shrink-0 px-5 py-2 text-sm"
              >
                {busy === "vip" ? "…" : "Get VIP 👑"}
              </button>
            </div>
          </div>
        )}
        <div className="mt-4 text-center">
          <Link
            href="/#reveal-code"
            className="text-xs font-semibold text-mute hover:text-fire"
          >
            Already bought odds? Enter your reveal code on the home screen →
          </Link>
        </div>
        {error && (
          <p className="mt-5 rounded-2xl border border-lost/30 bg-lost/10 px-4 py-3 text-sm text-lost">
            {error}
          </p>
        )}
      </main>
      <Footer />
      {checkout && (
        <MoolreCheckout
          session={checkout}
          onClose={closeCheckout}
          onPaid={handlePaid}
        />
      )}
      {opayCheckout && (
        <NigeriaPaymentModal
          session={opayCheckout}
          onClose={closeOpayCheckout}
          onPaid={handlePaid}
        />
      )}
    </>
  );
}
