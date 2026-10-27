"use client";

import { useEffect, useRef, useState } from "react";
import { submitPaymentProof, verifyCheckout, type PaymentVerify } from "@/lib/payments";
import { productLabel } from "@/lib/products";
import type { OpayCheckoutSession } from "@/hooks/useMoolrePay";

interface NigeriaPaymentModalProps {
  session: OpayCheckoutSession;
  onClose: () => void;
  onPaid: (result: PaymentVerify) => void;
}

export function NigeriaPaymentModal({
  session,
  onClose,
  onPaid,
}: NigeriaPaymentModalProps) {
  const [copied, setCopied] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [phoneInput, setPhoneInput] = useState(session.phone || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "submitted" | "approved">("pending");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDone = useRef(false);

  const bankName = session.instructions?.bankName || "Opay";
  const accountNumber = session.instructions?.accountNumber || "7082511762";
  const accountName = session.instructions?.accountName || "Peculiar Nmerisinachi Calistus";
  const formattedAmount = session.amount
    ? `₦${Number(session.amount).toLocaleString("en-US")}`
    : "₦--";

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Poll for admin approval if submitted or pending
  useEffect(() => {
    isDone.current = false;

    async function checkApproval() {
      if (isDone.current) return;
      try {
        const result = await verifyCheckout(session.reference, session.token, true);
        if (result.status === "paid") {
          isDone.current = true;
          setStatus("approved");
          setTimeout(() => {
            onPaid(result);
          }, 800);
        } else if (result.status === "proof_submitted") {
          setStatus("submitted");
        }
      } catch {
        // Keep polling
      }
    }

    const interval = window.setInterval(checkApproval, 4000);
    void checkApproval();

    return () => {
      window.clearInterval(interval);
    };
  }, [session.reference, session.token, onPaid]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback
    }
  };

  const compressAndSetImage = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (PNG, JPG, or screenshot)");
      return;
    }
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);
          setPhotoPreview(compressedDataUrl);
          setPhotoBase64(compressedDataUrl);
        } else {
          setPhotoPreview(src);
          setPhotoBase64(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressAndSetImage(file);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoBase64) {
      setError("Please select and upload a photo of your payment receipt or debit alert.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await submitPaymentProof(
        session.reference,
        photoBase64,
        senderName.trim() || undefined,
        phoneInput.trim() || undefined,
        session.token
      );
      setStatus("submitted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload proof. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface/95 p-5 sm:p-7 shadow-2xl text-cream my-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-surface-raised text-mute hover:text-cream hover:bg-line transition"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 font-bold text-lg border border-emerald-500/20">
            🇳🇬
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-cream">
              Nigeria Bank Transfer ({bankName})
            </h2>
            <p className="text-xs text-mute">
              Pay for <strong className="text-fire">{productLabel(session.product)}</strong>
            </p>
          </div>
        </div>

        {/* Status: Approved */}
        {status === "approved" && (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 text-2xl">
              ✓
            </div>
            <h3 className="mt-3 text-base font-bold text-emerald-300">
              Payment Approved!
            </h3>
            <p className="mt-1 text-xs text-cream/90">
              Your odds slip has been unlocked. Revealing now…
            </p>
          </div>
        )}

        {/* Status: Submitted & Awaiting Approval */}
        {status === "submitted" && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-500/20 text-amber-400 text-2xl animate-pulse">
                ⏳
              </div>
              <h3 className="mt-3 text-base font-bold text-amber-300">
                Proof Received — Awaiting Admin Approval
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-cream/80">
                Our team is reviewing your transfer now (typically confirmed within <strong>2–10 minutes</strong>).
              </p>
              <div className="mt-3 inline-block rounded-lg bg-surface px-3 py-1 text-[11px] font-mono text-mute border border-line">
                Ref: {session.reference}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-raised/60 p-4 text-xs space-y-2 text-mute">
              <p className="flex items-center gap-2 text-cream font-medium">
                <span className="text-emerald-400">●</span> Live verification in progress…
              </p>
              <p>
                Keep this window open or come back anytime. Once approved:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-cream/90 text-[11px]">
                <li>Today’s odds slip & booking codes will automatically unlock here.</li>
                <li>
                  You can also type your phone number (<strong>{phoneInput || session.phone}</strong>) on the homepage anytime to see your paid odds!
                </li>
              </ul>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-surface-raised px-4 py-2.5 text-xs font-semibold text-cream hover:bg-line transition"
              >
                Close & Check Back Soon
              </button>
            </div>
          </div>
        )}

        {/* Status: Pending Proof Upload */}
        {status === "pending" && (
          <form onSubmit={handleSubmitProof} className="mt-5 space-y-4">
            {/* Amount Banner */}
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface-raised/80 px-4 py-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-mute">
                  Total Amount to Send
                </p>
                <p className="text-2xl font-black text-fire font-mono">
                  {formattedAmount}
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
                Direct Transfer
              </span>
            </div>

            {/* Bank Account Details Card */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                1. Transfer to this Opay Account
              </p>

              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center py-1 border-b border-emerald-500/10">
                  <span className="text-mute">Bank:</span>
                  <span className="font-bold text-cream text-sm">{bankName}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-emerald-500/10">
                  <span className="text-mute">Account Number:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-amber-300 text-base tracking-widest">
                      {accountNumber}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500 hover:text-black transition"
                    >
                      {copied ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-mute">Account Name:</span>
                  <span className="font-semibold text-cream text-right">
                    {accountName}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 2: Upload Proof */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-cream">
                2. Upload Proof of Payment (Photo / Screenshot) <span className="text-fire">*</span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {!photoPreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-surface-raised/40 p-5 text-center cursor-pointer hover:border-fire/60 hover:bg-surface-raised/80 transition"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-line text-mute group-hover:text-fire group-hover:bg-fire/10 transition">
                    📸
                  </div>
                  <p className="mt-2 text-xs font-bold text-cream">
                    Tap to upload transfer receipt or debit alert
                  </p>
                  <p className="text-[10px] text-mute mt-0.5">
                    Supports PNG, JPG, or mobile screenshot
                  </p>
                </div>
              ) : (
                <div className="relative rounded-xl border border-line bg-surface-raised p-2 flex items-center gap-3">
                  <img
                    src={photoPreview}
                    alt="Receipt preview"
                    className="h-16 w-16 object-cover rounded-lg border border-line"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-cream truncate">
                      {fileName || "receipt.jpg"}
                    </p>
                    <p className="text-[10px] text-emerald-400 mt-0.5">
                      ✓ Photo ready to submit
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPreview(null);
                      setPhotoBase64("");
                      setFileName("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="rounded-lg p-2 text-mute hover:text-lost hover:bg-lost/10 transition text-xs"
                    title="Remove image"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Optional Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-mute mb-1">
                  Sender Name / Bank (Optional)
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Chinedu / GTBank"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-cream focus:border-fire focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-mute mb-1">
                  Your Phone Number (To View Odds)
                </label>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="e.g. 07082511762"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-cream focus:border-fire focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-lost/10 border border-lost/30 p-2 text-center text-xs text-lost">
                {error}
              </p>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-3 text-sm font-bold shadow-lg shadow-fire/20"
            >
              {submitting ? "Uploading Proof…" : "Submit Payment Proof"}
            </button>

            <p className="text-center text-[10px] text-mute">
              Once approved, entering this phone number unlocks your odds anytime.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
