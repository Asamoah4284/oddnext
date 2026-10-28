import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev: (process.env.NODE_ENV ?? "development") !== "production",
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/oddnext"),
  jwtSecret: required("JWT_SECRET", "dev-only-change-me"),
  jwtExpiresIn: "7d" as const,
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  vipPriceGhs: Number(process.env.VIP_PRICE_GHS ?? 1500),
  vipDurationDays: Number(process.env.VIP_DURATION_DAYS ?? 30),
  ghsToNgn: Number(process.env.GHS_TO_NGN ?? 114),
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@system.com",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin1234",
  publicBackendUrl:
    process.env.PUBLIC_BACKEND_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://oddnext.onrender.com",
  callbackUrl:
    process.env.CALLBACK_URL ||
    "https://oddnext.onrender.com/api/payments/webhook",
  moolre: {
    apiUser: (process.env.MOOLRE_API_USER || process.env.MOOLRE_USERNAME || "").replace(
      /\s/g,
      ""
    ),
    publicKey: (process.env.MOOLRE_PUBLIC_KEY || "").replace(/\s/g, ""),
    accountNumber: (process.env.MOOLRE_ACCOUNT_NUMBER || "").replace(/\s/g, ""),
    ngnAccountNumber: (process.env.MOOLRE_NGN_ACCOUNT_NUMBER || "").replace(
      /\s/g,
      ""
    ),
    webhookSecret: process.env.MOOLRE_WEBHOOK_SECRET ?? "",
    apiKey: process.env.MOOLRE_API_KEY ?? "",
    senderId: (process.env.MOOLRE_SENDER_ID || "Oddnext").replace(
      /^["']|["']$/g,
      ""
    ),
    baseUrl: (
      process.env.MOOLRE_BASE_URL ?? "https://api.moolre.com"
    ).replace(/\/$/, ""),
  },
  paystack: {
    secretKey: (process.env.PAYSTACK_SECRET_KEY || "").replace(/\s/g, ""),
    publicKey: (process.env.PAYSTACK_PUBLIC_KEY || "").replace(/\s/g, ""),
  },
};

export function hasMoolreCredentials(): boolean {
  return Boolean(
    config.moolre.apiUser &&
      config.moolre.publicKey &&
      config.moolre.accountNumber
  );
}

export function hasPaystackCredentials(): boolean {
  return Boolean(config.paystack.secretKey);
}
