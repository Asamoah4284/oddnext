import { SLIP_PRODUCT_IDS, isSlipProductId } from "../products.js";
import { Payment } from "../models/Payment.js";
import { Tip } from "../models/Tip.js";
import { User } from "../models/User.js";
import { addDays, endOfDay, startOfDay } from "../utils/dates.js";

import { generateUniqueRevealCode } from "./codes.js";
import {
  buildOddsMessage,
  extractPayerPhone,
  sendMoolreSms,
  type SlipLine,
} from "./sms.js";

export type PaidSlipTip = {
  id: string;
  kickoffAt: Date;
  league: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  odds: number;
  bookingCode: string;
  product: string;
};

type TipLike = {
  _id: { toString(): string };
  kickoffAt: Date;
  league: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  odds: number;
  bookingCode?: string | null;
  product?: string | null;
};

function toPaidTip(tip: TipLike, product: string): PaidSlipTip {
  return {
    id: tip._id.toString(),
    kickoffAt: tip.kickoffAt,
    league: tip.league,
    homeTeam: tip.homeTeam,
    awayTeam: tip.awayTeam,
    prediction: tip.prediction,
    odds: tip.odds,
    bookingCode: tip.bookingCode || "",
    product: tip.product || product,
  };
}

/**
 * A single-slip purchase covers the slip that was on sale on the day it was
 * paid: tips for that board posted by the end of the purchase day, kicking off
 * from the purchase day through the following day. Nothing posted later.
 */
export function slipWindow(paidAt: Date): { from: Date; to: Date; postedBy: Date } {
  return {
    from: startOfDay(paidAt),
    to: endOfDay(addDays(paidAt, 1)),
    postedBy: endOfDay(paidAt),
  };
}

export function isSlipExpired(paidAt: Date, now = new Date()): boolean {
  return slipWindow(paidAt).to.getTime() < now.getTime();
}

export function paymentPaidAt(payment: {
  paidAt?: Date | null;
  createdAt?: Date | null;
}): Date {
  return payment.paidAt ?? payment.createdAt ?? new Date();
}

export async function findSlipTipDocs(product: string, paidAt: Date) {
  const { from, to, postedBy } = slipWindow(paidAt);
  return Tip.find({
    product,
    kickoffAt: { $gte: from, $lte: to },
    createdAt: { $lte: postedBy },
  }).sort({ kickoffAt: 1, league: 1 });
}

/**
 * Tips a paid customer is entitled to see.
 * - Single slip: the slip on sale on the day it was paid (see slipWindow).
 * - VIP: today's and tomorrow's games on every board.
 */
export async function loadPaidTips(
  product: string,
  paidAt: Date = new Date()
): Promise<PaidSlipTip[]> {
  if (product === "vip") {
    const now = new Date();
    const tips = await Tip.find({
      product: { $in: SLIP_PRODUCT_IDS },
      kickoffAt: { $gte: startOfDay(now), $lte: endOfDay(addDays(now, 1)) },
    }).sort({ product: 1, kickoffAt: 1, league: 1 });
    return tips.map((tip) => toPaidTip(tip, tip.product || "odds10"));
  }

  if (!isSlipProductId(product)) return [];
  const tips = await findSlipTipDocs(product, paidAt);
  return tips.map((tip) => toPaidTip(tip, product));
}

/** Tips for a specific payment, or [] once its access has lapsed. */
export async function tipsForPayment(payment: {
  product?: string | null;
  paidAt?: Date | null;
  createdAt?: Date | null;
  vipExpiresAt?: Date | null;
}): Promise<PaidSlipTip[]> {
  const product = payment.product || "odds10";
  if (product === "vip") {
    if (payment.vipExpiresAt && payment.vipExpiresAt.getTime() < Date.now()) {
      return [];
    }
    return loadPaidTips("vip");
  }
  const paidAt = paymentPaidAt(payment);
  if (isSlipExpired(paidAt)) return [];
  return loadPaidTips(product, paidAt);
}

async function deliverOddsSms(
  phone: string,
  product: string,
  tips: PaidSlipTip[],
  revealCode?: string
): Promise<boolean> {
  if (!phone) return false;
  const lines: SlipLine[] = tips.map((tip) => ({
    homeTeam: tip.homeTeam,
    awayTeam: tip.awayTeam,
    prediction: tip.prediction,
    odds: tip.odds,
    bookingCode: tip.bookingCode,
  }));
  try {
    return await sendMoolreSms(phone, buildOddsMessage(product, lines, revealCode));
  } catch (err) {
    console.error("Odds SMS failed", err);
    return false;
  }
}

function resolvePayerPhone(
  payment: { phone?: string; rawCallback?: unknown },
  userPhone: string,
  extras?: { phone?: string; rawCallback?: unknown; rawStatus?: unknown }
): string {
  return (
    extras?.phone ||
    payment.phone ||
    userPhone ||
    extractPayerPhone(
      extras?.rawStatus,
      extras?.rawCallback,
      payment.rawCallback
    )
  );
}

export async function fulfillVipPayment(
  externalRef: string,
  extras?: {
    moolreTxId?: string;
    rawCallback?: unknown;
    rawStatus?: unknown;
    phone?: string;
  }
): Promise<{
  alreadyPaid: boolean;
  product: string;
  smsSent: boolean;
  revealCode?: string;
  vipExpiresAt?: Date | null;
}> {
  const payment = await Payment.findOne({ externalRef });
  if (!payment) {
    throw new Error("Payment not found");
  }

  const product = payment.product || "vip";
  const user = await User.findById(payment.userId);
  if (!user) {
    throw new Error("User not found for payment");
  }

  const phone = resolvePayerPhone(payment, user.phone || "", extras);
  if (phone && payment.phone !== phone) {
    payment.phone = phone;
  }
  const assignedUserPhone = Boolean(phone && !user.phone);
  if (assignedUserPhone) {
    user.phone = phone;
  }

  if (!payment.revealCode) {
    payment.revealCode = await generateUniqueRevealCode(product);
  }
  if (product === "vip") {
    payment.codeType = "vip";
    payment.maxUnlocks = 21; // at most 3 times a day for 7 days
    payment.maxDailyUnlocks = 3;
    if (!payment.vipExpiresAt) {
      payment.vipExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  } else {
    payment.codeType = "single";
    payment.maxUnlocks = 2;
  }

  if (payment.status === "paid") {
    if (!payment.paidAt) {
      payment.paidAt = payment.createdAt ?? new Date();
    }
    if (!payment.smsSent) {
      const tips = await tipsForPayment(payment);
      const sent = await deliverOddsSms(phone, product, tips, payment.revealCode || undefined);
      if (sent) {
        payment.smsSent = true;
      }
    }
    await payment.save();
    if (assignedUserPhone) await user.save();
    return {
      alreadyPaid: true,
      product,
      smsSent: payment.smsSent,
      revealCode: payment.revealCode || undefined,
      vipExpiresAt: payment.vipExpiresAt,
    };
  }

  payment.status = "paid";
  payment.paidAt = new Date();
  if (extras?.moolreTxId) payment.moolreTxId = extras.moolreTxId;
  if (extras?.rawCallback) payment.rawCallback = extras.rawCallback;
  await payment.save();

  if (product === "vip") {
    user.isVip = true;
    user.vipExpiresAt = payment.vipExpiresAt;
    await user.save();
  } else if (assignedUserPhone) {
    await user.save();
  }

  const tips = await tipsForPayment(payment);
  const smsSent = await deliverOddsSms(phone, product, tips, payment.revealCode || undefined);
  if (smsSent) {
    payment.smsSent = true;
    await payment.save();
  }

  return {
    alreadyPaid: false,
    product,
    smsSent,
    revealCode: payment.revealCode || undefined,
    vipExpiresAt: payment.vipExpiresAt,
  };
}
