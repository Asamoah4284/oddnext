import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { Payment } from "../models/Payment.js";
import { getProduct, loadProductPrices } from "../products.js";
import {
  codeExpiry,
  extractCorePhoneDigits,
  generateUniqueRevealCode,
  isNigerianPayment,
  maskPhone,
  normalizeRevealCode,
  takeDisplayableCode,
} from "../services/codes.js";
import { sendMoolreSms } from "../services/sms.js";
import { loadPaidTips } from "../services/vip.js";
import { HttpError } from "../utils/httpError.js";

export const codesRouter = Router();

// Unlock codes are delivered by SMS only. The website never returns a code,
// except a Nigerian payer's own code once right after approval (no SMS support).

const SESSION_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;

const revealSchema = z.object({
  code: z.string().min(3),
  deviceId: z.string().optional().default(""),
});

const lookupSchema = z.object({
  phone: z.string().min(7),
});

function startSession(
  payment: { activeSessionExpiresAt?: Date | null; activeSessionDeviceId?: string; activeSessionToken?: string },
  deviceId: string,
  now: Date
) {
  payment.activeSessionExpiresAt = new Date(now.getTime() + SESSION_MS);
  payment.activeSessionDeviceId = deviceId || "device_" + Math.random().toString(36).substring(2, 8);
  payment.activeSessionToken = randomUUID();
}

codesRouter.post("/reveal", async (req, res, next) => {
  try {
    const { code, deviceId } = revealSchema.parse(req.body);
    const trimmed = code.trim().toUpperCase();
    const normalized = normalizeRevealCode(code);

    // Only the unlock code itself works here: no phone numbers, no payment references.
    const payment = await Payment.findOne({
      revealCode: { $in: [normalized, trimmed] },
      status: "paid",
    });

    if (!payment) {
      throw new HttpError(
        404,
        "That unlock code wasn't found. Check the code in your SMS, or use \"Resend my code\" with your phone number."
      );
    }

    const now = new Date();
    const isVip = payment.codeType === "vip" || payment.product === "vip";
    const expiresAt = codeExpiry(payment);

    if (expiresAt <= now) {
      throw new HttpError(
        403,
        isVip
          ? `This VIP subscription code expired on ${expiresAt.toLocaleDateString()}.`
          : "This code has expired. Codes are valid for 48 hours after payment."
      );
    }

    const isGracePeriod = Boolean(
      payment.activeSessionExpiresAt &&
        payment.activeSessionExpiresAt > now &&
        payment.activeSessionDeviceId &&
        deviceId &&
        payment.activeSessionDeviceId === deviceId &&
        payment.activeSessionToken
    );

    if (isVip) {
      if (deviceId) {
        payment.deviceIds = payment.deviceIds ?? [];
        if (!payment.deviceIds.includes(deviceId)) {
          if (payment.deviceIds.length >= 2) {
            throw new HttpError(
              403,
              "This VIP code has already been registered on 2 devices. Sharing is restricted."
            );
          }
          payment.deviceIds.push(deviceId);
        }
      }

      // Daily unlock limit: at most 3 times a day for 7 days
      const todayKey = now.toISOString().split("T")[0];
      if (payment.dailyUnlockDate !== todayKey) {
        payment.dailyUnlockDate = todayKey;
        payment.dailyUnlockCount = 0;
      }

      const maxDaily = payment.maxDailyUnlocks || 3;
      const daysRemaining = Math.max(
        1,
        Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );

      if (!isGracePeriod) {
        if ((payment.dailyUnlockCount ?? 0) >= maxDaily) {
          throw new HttpError(
            403,
            `You have reached your daily limit of ${maxDaily} unlocks for today. Your VIP pass resets tomorrow (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining).`
          );
        }
        payment.dailyUnlockCount = (payment.dailyUnlockCount ?? 0) + 1;
        payment.unlockCount = (payment.unlockCount ?? 0) + 1;
        payment.lastUnlockedAt = now;
        startSession(payment, deviceId, now);
      }
      await payment.save();

      const tips = await loadPaidTips("vip");
      const sessionLeft = payment.activeSessionExpiresAt
        ? payment.activeSessionExpiresAt.getTime() - now.getTime()
        : 0;

      res.json({
        status: "ok",
        type: "vip",
        product: "vip",
        sessionToken: payment.activeSessionToken,
        vipExpiresAt: expiresAt,
        daysRemaining,
        dailyUnlockCount: payment.dailyUnlockCount,
        maxDailyUnlocks: maxDaily,
        dailyRemainingUnlocks: Math.max(0, maxDaily - (payment.dailyUnlockCount ?? 0)),
        graceMinutesRemaining: Math.max(0, Math.ceil(sessionLeft / 60000)),
        devicesCount: (payment.deviceIds ?? []).length,
        maxDevices: 2,
        tips,
      });
      return;
    }

    // Single slip
    const max = payment.maxUnlocks || 2;
    if (!isGracePeriod) {
      if ((payment.unlockCount ?? 0) >= max) {
        throw new HttpError(403, "This code has already been used twice and is now expired.");
      }
      payment.unlockCount = (payment.unlockCount ?? 0) + 1;
      payment.lastUnlockedAt = now;
      startSession(payment, deviceId, now);
      await payment.save();
    }

    const tips = await loadPaidTips(payment.product || "odds10");
    const msLeft = payment.activeSessionExpiresAt
      ? payment.activeSessionExpiresAt.getTime() - now.getTime()
      : 0;

    res.json({
      status: "ok",
      type: "single",
      product: payment.product,
      sessionToken: payment.activeSessionToken,
      unlockCount: payment.unlockCount,
      maxUnlocks: max,
      remainingUnlocks: Math.max(0, max - (payment.unlockCount ?? 0)),
      graceMinutesRemaining: Math.max(0, Math.ceil(msLeft / 60000)),
      tips,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * "Resend my code": sends the customer's active unlock code(s) by SMS to the
 * phone number on the payment. Never returns codes in the response (except a
 * Nigerian payer's code that has never been displayed yet).
 */
codesRouter.post("/lookup", async (req, res, next) => {
  try {
    const { phone } = lookupSchema.parse(req.body);
    const coreDigits = extractCorePhoneDigits(phone);

    if (coreDigits.length < 7) {
      throw new HttpError(400, "Enter a valid phone number.");
    }

    await loadProductPrices();
    const regex = new RegExp(`${coreDigits}$`);
    const now = new Date();
    const payments = await Payment.find({ status: "paid", phone: regex }).sort({ createdAt: -1 });

    const active = payments.filter((p) => {
      if (codeExpiry(p) <= now) return false;
      if (p.codeType === "vip" || p.product === "vip") return true;
      return (p.unlockCount ?? 0) < (p.maxUnlocks || 2);
    });

    const items: Array<{
      product: string;
      label: string;
      type: "vip" | "single";
      delivery: "sms" | "shown" | "recently_sent" | "unavailable";
      code?: string;
    }> = [];

    for (const p of active) {
      if (!p.revealCode) {
        p.revealCode = await generateUniqueRevealCode(p.product || "odds10");
      }
      const product = p.product || "odds10";
      const label = getProduct(product)?.label ?? product;
      const type = p.codeType === "vip" || product === "vip" ? "vip" : "single";

      if (isNigerianPayment(p)) {
        const code = takeDisplayableCode(p, now);
        await p.save();
        items.push({ product, label, type, delivery: code ? "shown" : "unavailable", ...(code ? { code } : {}) });
        continue;
      }

      if (p.lastCodeSmsAt && now.getTime() - new Date(p.lastCodeSmsAt).getTime() < RESEND_COOLDOWN_MS) {
        await p.save();
        items.push({ product, label, type, delivery: "recently_sent" });
        continue;
      }

      const sent = await sendMoolreSms(
        p.phone || phone,
        `Oddnext: your ${label} unlock code is ${p.revealCode}. Enter it on the site to view your games. Do not share this code.`
      ).catch(() => false);
      if (sent) p.lastCodeSmsAt = now;
      await p.save();
      items.push({ product, label, type, delivery: sent ? "sms" : "unavailable" });
    }

    const pendingTransfers = await Payment.find({
      phone: regex,
      status: { $in: ["proof_submitted", "pending"] },
      provider: { $in: ["opay", "manual"] },
    }).sort({ createdAt: -1 });

    res.json({
      ok: true,
      maskedPhone: maskPhone(active[0]?.phone || phone),
      count: items.length,
      items,
      pending: pendingTransfers.map((p) => ({
        product: p.product,
        amount: p.amount,
        currency: p.currency || "NGN",
        status: p.status,
        proofSubmitted: Boolean(p.proofImage),
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});
