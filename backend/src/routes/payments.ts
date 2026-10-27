import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router, type Request } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { config, hasMoolreCredentials, hasPaystackCredentials } from "../config.js";
import {
  optionalAuth,
  requireAdmin,
  requireAuth,
  toAuthUser,
  type AuthedRequest,
} from "../middleware/auth.js";
import { Payment } from "../models/Payment.js";
import { User } from "../models/User.js";
import {
  PRODUCT_IDS,
  amountForProduct,
  currencyForCountry,
  getProduct,
  loadProductPrices,
  type PayCountry,
} from "../products.js";
import { signToken } from "./auth.js";
import {
  amountsMatch,
  createPaymentLink,
  verifyPaymentStatus,
} from "../services/moolre.js";
import {
  createPaystackLink,
  koboAmountsMatch,
  verifyPaystackPayment,
  verifyPaystackSignature,
} from "../services/paystack.js";
import {
  detectPayCountry,
  formatPhoneForMoolre,
  looksLikePayPhone,
} from "../services/sms.js";
import { fulfillVipPayment, loadPaidTips } from "../services/vip.js";
import { HttpError } from "../utils/httpError.js";

export const paymentsRouter = Router();

const initiateSchema = z.object({
  product: z.enum(PRODUCT_IDS).default("vip"),
  email: z.string().trim().email().toLowerCase().optional(),
  phone: z.string().trim().min(9).max(20),
  country: z.enum(["GH", "NG"]).optional(),
  returnOrigin: z.string().url().optional(),
});

function resolvePayCountry(phone: string, requested?: PayCountry): PayCountry {
  const detected = detectPayCountry(phone);
  if (requested && looksLikePayPhone(phone, requested)) return requested;
  if (detected) return detected;
  throw new HttpError(
    400,
    "Enter a valid Ghana or Nigeria Mobile Money number"
  );
}

function originFromValue(value?: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function resolveReturnOrigin(req: AuthedRequest, requested?: string): string {
  const fallback = config.frontendUrl.replace(/\/$/, "");
  const allowed = new Set([
    fallback,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const candidates = [requested, req.headers.origin, fallback];
  for (const item of candidates) {
    const origin = originFromValue(item);
    if (!origin) continue;
    if (allowed.has(origin) || (config.isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
      return origin;
    }
  }
  return fallback;
}

function formatMoolreUrl(targetUrl: string, fallbackBase: string): string {
  try {
    const parsed = new URL(targetUrl);
    if (
      parsed.protocol === "https:" &&
      !parsed.port &&
      !parsed.hostname.includes("localhost") &&
      !parsed.hostname.includes("127.0.0.1")
    ) {
      return targetUrl;
    }
    const pathAndQuery = parsed.pathname + parsed.search;
    return `${fallbackBase.replace(/\/$/, "")}${pathAndQuery}`;
  } catch {
    return fallbackBase;
  }
}

function moolreAccountForCurrency(currency?: string): string {
  if (currency === "NGN" && config.moolre.ngnAccountNumber) {
    return config.moolre.ngnAccountNumber;
  }
  return config.moolre.accountNumber;
}

function isKnownMoolreAccount(accountNumber: string): boolean {
  if (!accountNumber) return true;
  return (
    accountNumber === config.moolre.accountNumber ||
    Boolean(
      config.moolre.ngnAccountNumber &&
        accountNumber === config.moolre.ngnAccountNumber
    )
  );
}

async function paymentSnapshot(
  payment: {
    externalRef: string;
    product?: string;
    status: string;
    smsSent?: boolean;
    slipViewed?: boolean;
    amount: number;
    currency?: string;
    provider?: string;
    createdAt?: Date;
    revealCode?: string | null;
    codeType?: string | null;
    unlockCount?: number | null;
    maxUnlocks?: number | null;
    vipExpiresAt?: Date | null;
    proofImage?: string | null;
    proofNote?: string | null;
    proofSubmittedAt?: Date | null;
  },
  options?: { quick?: boolean }
) {
  if (payment.status === "paid") {
    const viewed = Boolean(payment.slipViewed);
    return {
      status: "paid" as const,
      reference: payment.externalRef,
      product: payment.product,
      smsSent: payment.smsSent,
      slipViewed: viewed,
      revealCode: payment.revealCode,
      codeType: payment.codeType,
      unlockCount: payment.unlockCount ?? 0,
      maxUnlocks: payment.maxUnlocks ?? 2,
      vipExpiresAt: payment.vipExpiresAt,
      createdAt: payment.createdAt,
      tips: await loadPaidTips(payment.product || "vip"),
    };
  }

  const provider = payment.provider || "moolre";

  if (provider === "opay" || provider === "manual" || payment.status === "proof_submitted") {
    return {
      status: payment.status,
      reference: payment.externalRef,
      product: payment.product,
      amount: payment.amount,
      currency: payment.currency || "NGN",
      provider,
      proofSubmitted: Boolean(payment.proofImage),
      proofSubmittedAt: payment.proofSubmittedAt,
      createdAt: payment.createdAt,
    };
  }

  if (provider === "paystack") {
    if (!hasPaystackCredentials()) {
      return {
        status: payment.status,
        reference: payment.externalRef,
        product: payment.product,
        createdAt: payment.createdAt,
      };
    }
    const verified = await verifyPaystackPayment(payment.externalRef);
    if (
      verified.paid &&
      verified.externalRef === payment.externalRef &&
      verified.currency === "NGN" &&
      koboAmountsMatch(payment.amount, verified.amountKobo)
    ) {
      const fulfilled = await fulfillVipPayment(payment.externalRef, {
        moolreTxId: verified.transactionId,
        phone: verified.phone,
        rawStatus: verified.raw,
      });
      const tips = await loadPaidTips(fulfilled.product);
      return {
        status: "paid" as const,
        reference: payment.externalRef,
        product: fulfilled.product,
        smsSent: fulfilled.smsSent,
        slipViewed: false,
        revealCode: fulfilled.revealCode,
        codeType: fulfilled.product === "vip" ? "vip" : "single",
        unlockCount: 0,
        maxUnlocks: fulfilled.product === "vip" ? 999999 : 2,
        vipExpiresAt: fulfilled.vipExpiresAt,
        createdAt: payment.createdAt,
        tips,
      };
    }
    return {
      status: payment.status,
      reference: payment.externalRef,
      product: payment.product,
      createdAt: payment.createdAt,
    };
  }

  if (!hasMoolreCredentials()) {
    return {
      status: payment.status,
      reference: payment.externalRef,
      product: payment.product,
      createdAt: payment.createdAt,
    };
  }

  const verified = await verifyPaymentStatus(payment.externalRef, {
    retries: options?.quick ? [0] : undefined,
    accountNumber: moolreAccountForCurrency(payment.currency),
  });
  if (
    verified.paid &&
    verified.externalRef === payment.externalRef &&
    amountsMatch(payment.amount, verified.amount)
  ) {
    const fulfilled = await fulfillVipPayment(payment.externalRef, {
      moolreTxId: verified.transactionId,
      phone: verified.phone,
      rawStatus: verified.raw,
    });
    const tips = await loadPaidTips(fulfilled.product);
    return {
      status: "paid" as const,
      reference: payment.externalRef,
      product: fulfilled.product,
      smsSent: fulfilled.smsSent,
      slipViewed: false,
      revealCode: fulfilled.revealCode,
      codeType: fulfilled.product === "vip" ? "vip" : "single",
      unlockCount: 0,
      maxUnlocks: fulfilled.product === "vip" ? 999999 : 2,
      vipExpiresAt: fulfilled.vipExpiresAt,
      createdAt: payment.createdAt,
      tips,
    };
  }

  return {
    status: payment.status,
    reference: payment.externalRef,
    product: payment.product,
    createdAt: payment.createdAt,
  };
}

paymentsRouter.post(
  "/initiate",
  optionalAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      const body = initiateSchema.parse(req.body ?? {});
      const country = resolvePayCountry(body.phone, body.country);
      const phone = formatPhoneForMoolre(body.phone);
      await loadProductPrices();
      const product = getProduct(body.product);
      if (!product) {
        throw new HttpError(400, "Unknown product");
      }

      let userId = req.user?.id;
      let email = req.user?.email;
      let session: { token: string; user: ReturnType<typeof toAuthUser> } | null =
        null;

      if (!userId) {
        const guestEmail =
          body.email ?? `guest.${randomUUID().replace(/-/g, "").slice(0, 12)}@pay.oddnext.app`;
        let account = body.email
          ? await User.findOne({ email: body.email })
          : null;
        if (!account) {
          account = await User.create({
            name: "Guest",
            email: guestEmail,
            phone,
            password: await bcrypt.hash(randomUUID(), 12),
          });
        } else if (phone && !account.phone) {
          account.phone = phone;
          await account.save();
        }
        if (account.role === "admin") {
          throw new HttpError(400, "Admin accounts pay from the desk");
        }
        userId = account._id.toString();
        email = account.email;
        session = {
          token: signToken(userId),
          user: toAuthUser(account),
        };
      } else if (phone) {
        const account = await User.findById(userId);
        if (account && !account.phone) {
          account.phone = phone;
          await account.save();
        }
      }

      if (country === "NG") {
        const amount = amountForProduct(product, country, config.ghsToNgn);
        const externalRef = `ng_${randomUUID().replace(/-/g, "")}`;
        const provider = "opay";

        await Payment.create({
          userId,
          product: product.id,
          externalRef,
          amount,
          currency: "NGN",
          provider,
          status: "pending",
          phone,
        });

        res.json({
          provider: "opay",
          reference: externalRef,
          amount,
          currency: "NGN",
          product: product.id,
          instructions: {
            bankName: "Opay",
            accountNumber: "7082511762",
            accountName: "Peculiar Nmerisinachi Calistus",
          },
          ...session,
        });
        return;
      }

      const amount = amountForProduct(product, country, config.ghsToNgn);
      const currency = currencyForCountry(country);
      const provider = "moolre";
      const externalRef = `se_${randomUUID().replace(/-/g, "")}`;

      await Payment.create({
        userId,
        product: product.id,
        externalRef,
        amount,
        currency,
        provider,
        status: "pending",
        phone,
      });

      const returnOrigin = resolveReturnOrigin(req, body.returnOrigin);
      const redirect = `${returnOrigin}/payment/return?reference=${externalRef}&embed=1`;

      const publicBackend =
        process.env.PUBLIC_BACKEND_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        "https://oddnext.onrender.com";
      const publicFrontend =
        process.env.PUBLIC_FRONTEND_URL ||
        (config.frontendUrl.startsWith("https://") && !config.frontendUrl.includes("localhost")
          ? config.frontendUrl
          : "https://oddnext.onrender.com");

      const callbackBase = process.env.CALLBACK_URL || publicBackend;
      const callback = callbackBase.includes("/api/payments/webhook")
        ? callbackBase
        : formatMoolreUrl(
            `${req.protocol}://${req.get("host")}/api/payments/webhook`,
            callbackBase
          );
      const moolreRedirect = formatMoolreUrl(redirect, publicFrontend);

      if (!hasMoolreCredentials()) {
        if (!config.isDev) {
          throw new HttpError(503, "Payments are not configured yet");
        }
        res.json({
          authorization_url: `${redirect}&simulate=1`,
          reference: externalRef,
          simulated: true,
          amount,
          currency,
          provider,
          product: product.id,
          ...session,
        });
        return;
      }

      const authorizationUrl = await createPaymentLink({
        amount,
        email: email!,
        externalRef,
        callback,
        redirect: moolreRedirect,
        phone,
        currency,
        metadata: {
          product: product.id,
          userId,
          phone,
          country,
          source: "oddnext",
        },
      });

      res.json({
        authorization_url: authorizationUrl,
        reference: externalRef,
        simulated: false,
        amount,
        currency,
        provider,
        product: product.id,
        ...session,
      });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.post("/webhook", async (req, res, next) => {
  try {
    const payload = req.body as {
      secret?: string;
      externalref?: string;
      txstatus?: number;
      transactionid?: string | number;
      data?: {
        txstatus?: number;
        externalref?: string;
        transactionid?: string | number;
        amount?: string | number;
        secret?: string;
        webhookSecret?: string;
      };
    };
    const data = payload.data ?? {};
    const externalRef = String(data.externalref ?? payload.externalref ?? "");
    const incomingSecret = String(
      data.secret ??
        data.webhookSecret ??
        payload.secret ??
        req.headers["x-moolre-secret"] ??
        req.headers["x-moolre-webhook-secret"] ??
        ""
    );

    if (config.moolre.webhookSecret && incomingSecret !== config.moolre.webhookSecret) {
      throw new HttpError(401, "Invalid webhook secret");
    }

    const payment = await Payment.findOne({ externalRef });
    if (!payment) {
      res.status(200).json({ received: true, ignored: "unknown reference" });
      return;
    }

    payment.rawCallback = payload;
    await payment.save();

    if (hasMoolreCredentials()) {
      const verified = await verifyPaymentStatus(externalRef, {
        accountNumber: moolreAccountForCurrency(payment.currency),
      });
      if (
        !verified.paid ||
        verified.externalRef !== externalRef ||
        !amountsMatch(payment.amount, verified.amount) ||
        !isKnownMoolreAccount(verified.accountNumber)
      ) {
        payment.status = "failed";
        await payment.save();
        res.status(200).json({ received: true, fulfilled: false });
        return;
      }
      await fulfillVipPayment(externalRef, {
        moolreTxId: verified.transactionId,
        phone: verified.phone,
        rawCallback: payload,
        rawStatus: verified.raw,
      });
    } else if (Number(data.txstatus) === 1 && config.isDev) {
      await fulfillVipPayment(externalRef, {
        moolreTxId: String(data.transactionid ?? ""),
        rawCallback: payload,
      });
    }

    res.status(200).json({ received: true, fulfilled: true });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post("/paystack/webhook", async (req, res, next) => {
  try {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = req.headers["x-paystack-signature"];
    if (
      !verifyPaystackSignature(raw ?? JSON.stringify(req.body), signature)
    ) {
      throw new HttpError(401, "Invalid Paystack signature");
    }

    const payload = req.body as {
      event?: string;
      data?: {
        reference?: string;
        status?: string;
        id?: number;
        customer?: { phone?: string };
      };
    };

    if (payload.event !== "charge.success") {
      res.status(200).json({ received: true, ignored: payload.event ?? "unknown" });
      return;
    }

    const externalRef = String(payload.data?.reference ?? "");
    const payment = await Payment.findOne({ externalRef });
    if (!payment) {
      res.status(200).json({ received: true, ignored: "unknown reference" });
      return;
    }

    payment.rawCallback = payload;
    await payment.save();

    if (hasPaystackCredentials()) {
      const verified = await verifyPaystackPayment(externalRef);
      if (
        !verified.paid ||
        verified.externalRef !== externalRef ||
        verified.currency !== "NGN" ||
        !koboAmountsMatch(payment.amount, verified.amountKobo)
      ) {
        payment.status = "failed";
        await payment.save();
        res.status(200).json({ received: true, fulfilled: false });
        return;
      }
      await fulfillVipPayment(externalRef, {
        moolreTxId: verified.transactionId,
        phone: verified.phone || payment.phone,
        rawCallback: payload,
        rawStatus: verified.raw,
      });
    } else if (payload.data?.status === "success" && config.isDev) {
      await fulfillVipPayment(externalRef, {
        moolreTxId: String(payload.data.id ?? ""),
        rawCallback: payload,
      });
    }

    res.status(200).json({ received: true, fulfilled: true });
  } catch (err) {
    next(err);
  }
});

const proofSchema = z.object({
  reference: z.string().min(4),
  proofImage: z.string().min(10, "Please upload a photo of your payment receipt"),
  senderName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

paymentsRouter.post(
  "/proof",
  optionalAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      const body = proofSchema.parse(req.body ?? {});
      const payment = await Payment.findOne({ externalRef: body.reference });
      if (!payment) {
        throw new HttpError(404, "Payment record not found");
      }
      if (
        req.user &&
        payment.userId.toString() !== req.user.id &&
        req.user.role !== "admin"
      ) {
        throw new HttpError(403, "Not authorized to update this payment");
      }
      payment.proofImage = body.proofImage;
      if (body.senderName) {
        payment.proofNote = body.senderName;
      }
      if (body.phone) {
        payment.phone = body.phone;
      }
      payment.status = "proof_submitted";
      payment.proofSubmittedAt = new Date();
      await payment.save();

      res.json({
        success: true,
        reference: payment.externalRef,
        status: payment.status,
        message: "Payment proof received. Awaiting admin approval.",
      });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.post(
  "/ack/:ref",
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      const externalRef = String(req.params.ref);
      const payment = await Payment.findOne({ externalRef });
      if (!payment) {
        throw new HttpError(404, "Payment not found");
      }
      if (payment.userId.toString() !== req.user!.id && req.user!.role !== "admin") {
        throw new HttpError(403, "You cannot close this slip");
      }
      if (payment.status === "paid" && !payment.slipViewed) {
        payment.slipViewed = true;
        await payment.save();
      }
      res.json({ status: "paid", reference: externalRef, slipViewed: true, tips: [] });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.get(
  "/latest",
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      const payment = await Payment.findOne({ userId: req.user!.id }).sort({
        createdAt: -1,
      });
      if (!payment) {
        res.json({ status: "none" });
        return;
      }
      res.json(await paymentSnapshot(payment));
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.get(
  "/verify/:ref",
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      const externalRef = String(req.params.ref);
      const payment = await Payment.findOne({ externalRef });
      if (!payment) {
        throw new HttpError(404, "Payment not found");
      }
      if (payment.userId.toString() !== req.user!.id && req.user!.role !== "admin") {
        throw new HttpError(403, "You cannot verify this payment");
      }

      res.json(
        await paymentSnapshot(payment, { quick: req.query.poll === "1" })
      );
    } catch (err) {
      next(err);
    }
  }
);

const simulateSchema = z.object({
  reference: z.string().min(4),
});

paymentsRouter.post(
  "/simulate",
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      if (!config.isDev) {
        throw new HttpError(404, "Not found");
      }
      const { reference } = simulateSchema.parse(req.body);
      const payment = await Payment.findOne({ externalRef: reference });
      if (!payment) {
        throw new HttpError(404, "Payment not found");
      }
      if (payment.userId.toString() !== req.user!.id && req.user!.role !== "admin") {
        throw new HttpError(403, "You cannot simulate this payment");
      }
      const result = await fulfillVipPayment(reference, {
        moolreTxId: "simulated",
        rawCallback: { simulated: true },
      });
      const tips = await loadPaidTips(result.product);
      res.json({ status: "paid", reference, tips, ...result });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.delete(
  "/",
  requireAuth,
  requireAdmin,
  async (_req: AuthedRequest, res, next) => {
    try {
      const result = await Payment.deleteMany({});
      const usersResult = await User.deleteMany({ role: { $ne: "admin" } });
      res.json({
        message: "All mock and test payments have been cleared.",
        deletedPayments: result.deletedCount,
        deletedGuestUsers: usersResult.deletedCount,
      });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthedRequest, res, next) => {
    try {
      const rawId = String(req.params.id || "").trim();
      if (!rawId) throw new HttpError(400, "Transaction ID is required");

      let payment = null;
      if (mongoose.isValidObjectId(rawId)) {
        payment = await Payment.findById(rawId);
      }
      if (!payment) {
        const escaped = rawId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        payment = await Payment.findOne({
          $or: [
            { externalRef: rawId },
            { revealCode: rawId },
            { externalRef: new RegExp(`^${escaped}$`, "i") },
          ],
        });
      }
      if (!payment) {
        throw new HttpError(404, "Transaction not found");
      }

      await Payment.findByIdAndDelete(payment._id);
      res.json({
        message: "Transaction deleted successfully.",
        deletedId: payment._id.toString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.post(
  "/seed-test",
  requireAuth,
  requireAdmin,
  async (_req: AuthedRequest, res, next) => {
    try {
      const adminUser = await User.findOne({ role: "admin" });
      if (!adminUser) throw new HttpError(400, "Admin user not found");

      const now = Date.now();
      const samplePayments = [
        {
          userId: adminUser._id,
          externalRef: `TEST-VIP-${now}-1`,
          product: "vip",
          amount: 52,
          currency: "GHS",
          provider: "moolre",
          status: "paid",
          phone: "0244123456",
          revealCode: `VIP-${Math.floor(100000 + Math.random() * 900000)}`,
          codeType: "vip",
          createdAt: new Date(),
        },
        {
          userId: adminUser._id,
          externalRef: `TEST-ODDS10-${now}-2`,
          product: "odds10",
          amount: 25,
          currency: "GHS",
          provider: "moolre",
          status: "paid",
          phone: "0555987654",
          revealCode: `OD10-${Math.floor(100000 + Math.random() * 900000)}`,
          codeType: "single",
          createdAt: new Date(now - 3600 * 1000 * 2),
        },
        {
          userId: adminUser._id,
          externalRef: `TEST-ODDS50-${now}-3`,
          product: "odds50",
          amount: 75,
          currency: "GHS",
          provider: "moolre",
          status: "paid",
          phone: "0201122334",
          revealCode: `OD50-${Math.floor(100000 + Math.random() * 900000)}`,
          codeType: "single",
          createdAt: new Date(now - 3600 * 1000 * 4),
        },
        {
          userId: adminUser._id,
          externalRef: `TEST-PROOF-${now}-4`,
          product: "odds100",
          amount: 100,
          currency: "GHS",
          provider: "manual",
          status: "proof_submitted",
          phone: "0277334455",
          proofImage: "https://placehold.co/400x600/png?text=Payment+Receipt",
          proofSubmittedAt: new Date(),
          createdAt: new Date(now - 3600 * 1000),
        },
        {
          userId: adminUser._id,
          externalRef: `TEST-PENDING-${now}-5`,
          product: "odds10",
          amount: 25,
          currency: "GHS",
          provider: "moolre",
          status: "pending",
          phone: "0544556677",
          createdAt: new Date(),
        },
      ];

      await Payment.insertMany(samplePayments);
      res.json({
        message: "Generated 5 demo transactions successfully.",
        count: samplePayments.length,
      });
    } catch (err) {
      next(err);
    }
  }
);


