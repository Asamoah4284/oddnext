import { SLIP_PRODUCT_IDS, isSlipProductId } from "../products.js";
import { Payment } from "../models/Payment.js";
import { Tip } from "../models/Tip.js";
import { User } from "../models/User.js";
import { dayRange } from "../utils/dates.js";
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

export async function loadPaidTips(product: string): Promise<PaidSlipTip[]> {
  if (product === "vip") {
    // For VIP, fetch active games across each board so user gets full access
    const results: PaidSlipTip[] = [];
    for (const board of SLIP_PRODUCT_IDS) {
      const boardTips = await loadPaidTips(board);
      results.push(...boardTips);
    }
    return results;
  }

  const { from, to } = dayRange(0);
  const filter: Record<string, unknown> = {
    product,
    kickoffAt: { $gte: from, $lte: to },
  };
  let tips = await Tip.find(filter).sort({ kickoffAt: 1, league: 1 });

  // Fallback: If no tips found for today's strict day window, fetch active pending tips or recent within 48h
  if (tips.length === 0) {
    const fallbackFilter: Record<string, unknown> = {
      product,
      $or: [
        { status: "pending" },
        { kickoffAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
      ],
    };
    tips = await Tip.find(fallbackFilter).sort({ kickoffAt: 1, league: 1 }).limit(100);

    // If still 0, grab the most recent tips in the system
    if (tips.length === 0) {
      tips = await Tip.find({ product }).sort({ kickoffAt: -1, league: 1 }).limit(100);
    }
  }

  return tips.map((tip) => ({
    id: tip._id.toString(),
    kickoffAt: tip.kickoffAt,
    league: tip.league,
    homeTeam: tip.homeTeam,
    awayTeam: tip.awayTeam,
    prediction: tip.prediction,
    odds: tip.odds,
    bookingCode: tip.bookingCode || "",
    product: tip.product || product,
  }));
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
    if (!payment.smsSent) {
      const tips = await loadPaidTips(product);
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

  const tips = await loadPaidTips(product);
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
