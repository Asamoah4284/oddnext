import { Router } from "express";
import { z } from "zod";
import { optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { Payment } from "../models/Payment.js";
import { Tip } from "../models/Tip.js";
import {
  SLIP_PRODUCT_IDS,
  canAccessBoard,
  type SlipProductId,
} from "../products.js";
import { codeExpiry } from "../services/codes.js";
import { findSlipTipDocs, paymentPaidAt } from "../services/vip.js";
import { addDays, dayRange, endOfDay, startOfDay } from "../utils/dates.js";

export const tipsRouter = Router();

const tabSchema = z.enum(["yesterday", "today"]).default("today");
const boardSchema = z.enum(SLIP_PRODUCT_IDS).default("odds10");

function serializeTip(tip: {
  _id: { toString(): string };
  kickoffAt: Date;
  league: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  odds: number;
  status: string;
  product?: string | null;
  isVip: boolean;
  bookingCode?: string | null;
}) {
  return {
    id: tip._id.toString(),
    kickoffAt: tip.kickoffAt,
    league: tip.league,
    homeTeam: tip.homeTeam,
    awayTeam: tip.awayTeam,
    prediction: tip.prediction,
    odds: tip.odds,
    status: tip.status,
    product: tip.product || "odds10",
    isVip: tip.isVip,
    locked: false,
    bookingCode: tip.bookingCode || "",
  };
}

/**
 * The browser holds an opaque session token from POST /api/codes/reveal — never
 * the unlock code itself (codes are delivered by SMS only). The token only grants
 * access while that 30-minute session is live, on the device that opened it, and
 * while the code hasn't expired. Every new viewing has to go through /reveal,
 * which enforces the unlock limits.
 */
async function findActiveSessionPayment(sessionToken: string, deviceId: string) {
  if (!sessionToken) return null;
  const payment = await Payment.findOne({
    activeSessionToken: sessionToken,
    status: "paid",
  });
  if (!payment) return null;

  const now = new Date();
  const sessionLive = Boolean(
    payment.activeSessionExpiresAt && payment.activeSessionExpiresAt > now
  );
  const sameDevice = Boolean(
    deviceId &&
      payment.activeSessionDeviceId &&
      payment.activeSessionDeviceId === deviceId
  );
  if (!sessionLive || !sameDevice) return null;
  if (codeExpiry(payment) <= now) return null;

  const isVip = payment.codeType === "vip" || payment.product === "vip";
  return { payment, isVip };
}

tipsRouter.get("/", optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const tab = tabSchema.parse(req.query.tab ?? "today");
    const board = boardSchema.parse(req.query.board ?? "odds10") as SlipProductId;
    res.setHeader("Cache-Control", "private, no-store");

    const rawToken = req.headers["x-unlock-session"];
    const sessionToken = typeof rawToken === "string" ? rawToken.trim() : "";
    const deviceId = String(req.headers["x-device-id"] ?? "").trim();
    const codeAccess = sessionToken
      ? await findActiveSessionPayment(sessionToken, deviceId)
      : null;

    const userAccess = canAccessBoard(req.user, board);
    const codeVipAccess = Boolean(codeAccess?.isVip);
    const codeSlipPayment =
      codeAccess && !codeAccess.isVip && codeAccess.payment.product === board
        ? codeAccess.payment
        : null;

    const vipAccess = Boolean(req.user?.vipActive) || codeVipAccess;
    const fullBoardAccess = userAccess || codeVipAccess;
    const boardAccess = fullBoardAccess || Boolean(codeSlipPayment);

    const locked = {
      tab,
      board,
      vipAccess,
      boardAccess: false,
      entitlements: req.user?.entitlements ?? [],
      tips: [],
    };

    if (!boardAccess) {
      res.json(locked);
      return;
    }

    // Single-slip code: only the slip that was purchased, never other days.
    if (!fullBoardAccess && codeSlipPayment) {
      if (tab !== "today") {
        res.json(locked);
        return;
      }
      const tips = await findSlipTipDocs(board, paymentPaidAt(codeSlipPayment));
      res.json({
        tab,
        board,
        vipAccess,
        boardAccess: true,
        entitlements: req.user?.entitlements ?? [],
        tips: tips.map(serializeTip),
      });
      return;
    }

    let dateFilter: Record<string, unknown>;
    if (tab === "yesterday") {
      const { from, to } = dayRange(-1);
      dateFilter = { kickoffAt: { $gte: from, $lte: to } };
    } else {
      const now = new Date();
      dateFilter = {
        kickoffAt: { $gte: startOfDay(now), $lte: endOfDay(addDays(now, 1)) },
      };
    }

    const tips = await Tip.find({ ...dateFilter, product: board }).sort({
      kickoffAt: 1,
      league: 1,
    });

    res.json({
      tab,
      board,
      vipAccess,
      boardAccess: true,
      entitlements: req.user?.entitlements ?? [],
      tips: tips.map(serializeTip),
    });
  } catch (err) {
    next(err);
  }
});
