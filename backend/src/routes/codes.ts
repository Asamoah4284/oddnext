import { Router } from "express";
import { z } from "zod";
import { Payment } from "../models/Payment.js";
import { extractCorePhoneDigits, normalizeRevealCode } from "../services/codes.js";
import { loadPaidTips } from "../services/vip.js";
import { HttpError } from "../utils/httpError.js";

export const codesRouter = Router();

const revealSchema = z.object({
  code: z.string().min(3),
  deviceId: z.string().optional().default(""),
});

const lookupSchema = z.object({
  phone: z.string().min(7),
});

codesRouter.post("/reveal", async (req, res, next) => {
  try {
    const { code, deviceId } = revealSchema.parse(req.body);
    const normalized = normalizeRevealCode(code);

    const payment = await Payment.findOne({
      revealCode: normalized,
      status: "paid",
    });

    if (!payment) {
      throw new HttpError(
        404,
        "Code not found or payment not completed. Please check your code or search by phone."
      );
    }

    const now = new Date();
    const isVip = payment.codeType === "vip" || payment.product === "vip";

    if (isVip) {
      if (payment.vipExpiresAt && payment.vipExpiresAt < now) {
        throw new HttpError(
          403,
          `This VIP subscription code expired on ${payment.vipExpiresAt.toLocaleDateString()}.`
        );
      }

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
          await payment.save();
        }
      }

      const tips = await loadPaidTips("vip");
      const msLeft = payment.vipExpiresAt ? payment.vipExpiresAt.getTime() - now.getTime() : 0;
      const daysRemaining = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

      res.json({
        status: "ok",
        type: "vip",
        product: "vip",
        code: payment.revealCode,
        vipExpiresAt: payment.vipExpiresAt,
        daysRemaining,
        devicesCount: (payment.deviceIds ?? []).length,
        maxDevices: 2,
        tips,
      });
      return;
    }

    // Single Slip Logic
    const isGracePeriod = Boolean(
      payment.activeSessionExpiresAt &&
        payment.activeSessionExpiresAt > now &&
        payment.activeSessionDeviceId &&
        deviceId &&
        payment.activeSessionDeviceId === deviceId
    );

    const max = payment.maxUnlocks || 2;

    if (!isGracePeriod) {
      if ((payment.unlockCount ?? 0) >= max) {
        throw new HttpError(
          403,
          "This code has already been used twice and is now expired."
        );
      }
      payment.unlockCount = (payment.unlockCount ?? 0) + 1;
      payment.lastUnlockedAt = now;
      payment.activeSessionExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30-min window
      payment.activeSessionDeviceId = deviceId || "device_" + Math.random().toString(36).substring(2, 8);
      await payment.save();
    }

    const tips = await loadPaidTips(payment.product || "odds10");
    const msLeft = payment.activeSessionExpiresAt
      ? payment.activeSessionExpiresAt.getTime() - now.getTime()
      : 0;
    const graceMinutes = Math.max(0, Math.ceil(msLeft / 60000));

    res.json({
      status: "ok",
      type: "single",
      product: payment.product,
      code: payment.revealCode,
      unlockCount: payment.unlockCount,
      maxUnlocks: max,
      remainingUnlocks: Math.max(0, max - (payment.unlockCount ?? 0)),
      graceMinutesRemaining: graceMinutes,
      tips,
    });
  } catch (err) {
    next(err);
  }
});

codesRouter.post("/lookup", async (req, res, next) => {
  try {
    const { phone } = lookupSchema.parse(req.body);
    const coreDigits = extractCorePhoneDigits(phone);

    if (coreDigits.length < 7) {
      throw new HttpError(400, "Enter a valid phone number to search.");
    }

    const regex = new RegExp(`${coreDigits}$`);
    const payments = await Payment.find({
      status: "paid",
      phone: regex,
      revealCode: { $exists: true, $ne: "" },
    }).sort({ createdAt: -1 });

    const now = new Date();
    const activeCodes = payments
      .filter((p) => {
        if (p.codeType === "vip" || p.product === "vip") {
          return !p.vipExpiresAt || p.vipExpiresAt > now;
        }
        return (p.unlockCount ?? 0) < (p.maxUnlocks || 2);
      })
      .map((p) => {
        const isVip = p.codeType === "vip" || p.product === "vip";
        const msLeft = p.vipExpiresAt ? p.vipExpiresAt.getTime() - now.getTime() : 0;
        const daysRemaining = isVip
          ? Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
          : null;
        const remainingUnlocks = isVip
          ? null
          : Math.max(0, (p.maxUnlocks || 2) - (p.unlockCount ?? 0));

        return {
          code: p.revealCode,
          product: p.product,
          type: isVip ? "vip" : "single",
          createdAt: p.createdAt,
          remainingUnlocks,
          daysRemaining,
        };
      });

    res.json({
      ok: true,
      count: activeCodes.length,
      codes: activeCodes,
    });
  } catch (err) {
    next(err);
  }
});
