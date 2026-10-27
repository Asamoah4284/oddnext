"use client";

import type { PayCountry } from "@/lib/products";

export function PhoneField({
  value,
  onChange,
  country,
  onCountryChange,
}: {
  value: string;
  onChange: (value: string) => void;
  country: PayCountry;
  onCountryChange: (country: PayCountry) => void;
}) {
  const nigeria = country === "NG";

  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-mute">
        {nigeria ? "Phone number" : "Mobile Money number"}
      </span>
      <div className="mt-2 flex rounded-full bg-paper p-1 ring-1 ring-line">
        <button
          type="button"
          onClick={() => onCountryChange("GH")}
          className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
            !nigeria ? "bg-fire text-pitch-dark" : "text-mute"
          }`}
        >
          Ghana
        </button>
        <button
          type="button"
          onClick={() => onCountryChange("NG")}
          className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
            nigeria ? "bg-fire text-pitch-dark" : "text-mute"
          }`}
        >
          Nigeria
        </button>
      </div>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={nigeria ? "0803 000 0000" : "024 000 0000"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field mt-2"
      />
      <span className="mt-1.5 block text-xs text-mute">
        {nigeria
          ? "Nigeria pays with Opay direct transfer (7082511762). Upload proof for instant activation. Slip SMS goes here."
          : "Ghana numbers pay in cedis. The slip SMS goes to this number."}
      </span>
    </label>
  );
}
