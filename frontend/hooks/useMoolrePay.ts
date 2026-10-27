"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { CheckoutSession } from "@/components/MoolreCheckout";
import { apiFetch } from "@/lib/api";
import {
  ackSlip,
  clearPayRef,
  storePayRef,
  type PaymentVerify,
} from "@/lib/payments";
import {
  detectPayCountry,
  looksLikePayPhone,
  readSavedCountry,
  readSavedPhone,
  saveCountry,
  savePhone,
} from "@/lib/phone";
import type { PayCountry, ProductId } from "@/lib/products";
import type { AuthUser } from "@/lib/types";

export type OpayCheckoutSession = {
  reference: string;
  amount: number;
  currency: string;
  product: ProductId;
  phone: string;
  instructions: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  token: string | null;
};

export function useMoolrePay() {
  const { token, user, applySession, refresh } = useAuth();
  const [busy, setBusy] = useState<ProductId | "">("");
  const [error, setError] = useState("");
  const [phone, setPhoneValue] = useState("");
  const [country, setCountryValue] = useState<PayCountry>("GH");
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const [opayCheckout, setOpayCheckout] = useState<OpayCheckoutSession | null>(null);
  const [paid, setPaid] = useState<PaymentVerify | null>(null);

  useEffect(() => {
    const saved = readSavedPhone();
    const savedCountry = readSavedCountry();
    if (saved) {
      setPhoneValue(saved);
      setCountryValue(detectPayCountry(saved) ?? savedCountry);
      return;
    }
    setCountryValue(savedCountry);
    if (user?.phone) {
      setPhoneValue(user.phone);
      const detected = detectPayCountry(user.phone);
      if (detected) setCountryValue(detected);
    }
  }, [user?.phone]);

  const setPhone = useCallback((value: string) => {
    setPhoneValue(value);
    const detected = detectPayCountry(value);
    if (detected) {
      setCountryValue(detected);
      saveCountry(detected);
    }
  }, []);

  const setCountry = useCallback((next: PayCountry) => {
    setCountryValue(next);
    saveCountry(next);
  }, []);

  useEffect(() => {
    return () => {
      setPaid(null);
      clearPayRef();
    };
  }, []);

  const startPay = useCallback(
    async (product: ProductId) => {
      if (!looksLikePayPhone(phone, country)) {
        setError(
          country === "NG"
            ? "Enter a valid Nigerian phone number."
            : "Enter a valid Ghana Mobile Money number."
        );
        return;
      }
      setBusy(product);
      setError("");
      setPaid(null);
      savePhone(phone);
      saveCountry(country);
      try {
        const data = await apiFetch<{
          authorization_url?: string;
          reference: string;
          amount?: number;
          currency?: string;
          product?: string;
          provider?: "moolre" | "paystack" | "opay" | "manual";
          instructions?: {
            bankName: string;
            accountNumber: string;
            accountName: string;
          };
          token?: string;
          user?: AuthUser;
        }>("/api/payments/initiate", {
          method: "POST",
          token,
          body: JSON.stringify({
            product,
            phone,
            country,
            returnOrigin: window.location.origin,
          }),
        });
        const nextToken = data.token ?? token;
        if (data.token && data.user) {
          applySession(data.token, data.user);
        }

        if (data.provider === "opay" || data.instructions) {
          if (!data.reference) {
            throw new Error("Could not initialize Opay transfer reference.");
          }
          storePayRef(data.reference);
          setOpayCheckout({
            reference: data.reference,
            amount: data.amount ?? 0,
            currency: data.currency || "NGN",
            product: (data.product as ProductId) || product,
            phone,
            instructions: data.instructions || {
              bankName: "Opay",
              accountNumber: "7082511762",
              accountName: "Peculiar Nmerisinachi Calistus",
            },
            token: nextToken ?? null,
          });
          return;
        }

        if (!data.authorization_url || !data.reference) {
          throw new Error("Checkout did not return a payment link.");
        }
        storePayRef(data.reference);

        let safeAuthUrl = data.authorization_url;
        if (
          typeof window !== "undefined" &&
          !window.location.hostname.includes("localhost") &&
          !window.location.hostname.includes("127.0.0.1")
        ) {
          safeAuthUrl = safeAuthUrl.replace(
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i,
            window.location.origin
          );
        }

        if (data.provider === "paystack") {
          window.location.assign(safeAuthUrl);
          return;
        }
        setCheckout({
          authorizationUrl: safeAuthUrl,
          reference: data.reference,
          token: nextToken ?? null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start payment");
      } finally {
        setBusy("");
      }
    },
    [token, applySession, phone, country]
  );

  const handlePaid = useCallback(
    async (result: PaymentVerify) => {
      clearPayRef();
      if (result.slipViewed || !result.tips?.length) {
        setPaid(null);
        setCheckout(null);
        setOpayCheckout(null);
        return;
      }
      setPaid(result);
      setCheckout(null);
      setOpayCheckout(null);
      await ackSlip(result.reference ?? "", token);
      await refresh();
    },
    [refresh, token]
  );

  const dismissPaid = useCallback(() => {
    setPaid(null);
    clearPayRef();
  }, []);

  const closeCheckout = useCallback(() => {
    setCheckout(null);
  }, []);

  const closeOpayCheckout = useCallback(() => {
    setOpayCheckout(null);
  }, []);

  return {
    busy,
    error,
    phone,
    setPhone,
    country,
    setCountry,
    checkout,
    opayCheckout,
    setOpayCheckout,
    paid,
    startPay,
    handlePaid,
    dismissPaid,
    closeCheckout,
    closeOpayCheckout,
  };
}
