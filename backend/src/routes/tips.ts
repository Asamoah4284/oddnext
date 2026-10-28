import { Router } from "express";
import { z } from "zod";
import { optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { Tip } from "../models/Tip.js";
import {
  SLIP_PRODUCT_IDS,
  canAccessBoard,
  type SlipProductId,
} from "../products.js";
import { addDays, dayRange, endOfDay, startOfDay } from "../utils/dates.js";


export const tipsRouter = Router();

const tabSchema = z.enum(["yesterday", "today"]).default("today");
const boardSchema = z.enum(SLIP_PRODUCT_IDS).default("odds10");

function serializeTip(
  tip: {
    _id: { toString(): string };
    kickoffAt: Date;
    league: string;
    homeTeam: string;
    awayTeam: string;
    prediction: string;
    odds: number;
    status: string;
    product?: string;
    isVip: boolean;
    bookingCode?: string;
  },
  unlocked: boolean
) {
  return {
    id: tip._id.toString(),
    kickoffAt: tip.kickoffAt,
    league: tip.league,
    homeTeam: tip.homeTeam,
    awayTeam: tip.awayTeam,
    prediction: unlocked ? tip.prediction : "Locked",
    odds: unlocked ? tip.odds : null,
    status: tip.status,
    product: tip.product || "odds10",
    isVip: tip.isVip,
    locked: !unlocked,
    bookingCode: unlocked ? tip.bookingCode || "" : "",
  };
}

import { Payment } from "../models/Payment.js";
import { normalizeRevealCode } from "../services/codes.js";

tipsRouter.get("/", optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const tab = tabSchema.parse(req.query.tab ?? "today");
    const board = boardSchema.parse(req.query.board ?? "odds10") as SlipProductId;
    res.setHeader("Cache-Control", "private, no-store");

    const revealCodeHeader =
      (req.headers["x-reveal-code"] as string) ||
      (req.query.code as string);

    let codeVipAccess = false;
    let codeBoardAccess = false;

    if (revealCodeHeader) {
      const normalized = normalizeRevealCode(revealCodeHeader);
      const payment = await Payment.findOne({
        revealCode: normalized,
        status: "paid",
      });
      if (payment) {
        const now = new Date();
        const isVip = payment.codeType === "vip" || payment.product === "vip";
        if (isVip && (!payment.vipExpiresAt || payment.vipExpiresAt > now)) {
          const todayKey = now.toISOString().split("T")[0];
          const isToday = payment.dailyUnlockDate === todayKey;
          const dailyCount = isToday ? (payment.dailyUnlockCount ?? 0) : 0;
          const maxDaily = payment.maxDailyUnlocks || 3;
          const inActiveSession = Boolean(
            payment.activeSessionExpiresAt && payment.activeSessionExpiresAt > now
          );
          // Grant access if within daily limit or within active session window
          if (dailyCount < maxDaily || inActiveSession) {
            codeVipAccess = true;
            codeBoardAccess = true;
          }
        } else if (payment.product === board) {
          const max = payment.maxUnlocks || 2;
          const isGrace = Boolean(
            payment.activeSessionExpiresAt &&
              payment.activeSessionExpiresAt > now
          );
          if ((payment.unlockCount ?? 0) <= max || isGrace) {
            codeBoardAccess = true;
          }
        }
      }
    }

    const vipAccess = Boolean(req.user?.vipActive) || codeVipAccess;
    const boardAccess = canAccessBoard(req.user, board) || codeBoardAccess;

    let dateFilter: Record<string, unknown> = {};
    if (tab === "yesterday") {
      const { from, to } = dayRange(-1);
      dateFilter = { kickoffAt: { $gte: from, $lte: to } };
    } else {
      const now = new Date();
      const from = startOfDay(now);
      const to = endOfDay(addDays(now, 1));
      dateFilter = { kickoffAt: { $gte: from, $lte: to } };
    }


    if (!boardAccess) {
      res.json({
        tab,
        board,
        vipAccess,
        boardAccess: false,
        entitlements: req.user?.entitlements ?? [],
        tips: [],
      });
      return;
    }

    let tips = await Tip.find({
      ...dateFilter,
      product: board,
    }).sort({ kickoffAt: 1, league: 1 });

    // Fallback: If today has no tips for this board, load pending or recent active tips
    if (tab === "today" && tips.length === 0) {
      tips = await Tip.find({
        product: board,
        $or: [
          { status: "pending" },
          { kickoffAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
        ],
      })
        .sort({ kickoffAt: 1, league: 1 })
        .limit(100);

      if (tips.length === 0) {
        tips = await Tip.find({ product: board })
          .sort({ kickoffAt: -1, league: 1 })
          .limit(100);
      }
    }

    res.json({
      tab,
      board,
      vipAccess,
      boardAccess: true,
      entitlements: req.user?.entitlements ?? [],
      tips: tips.map((tip) => serializeTip(tip, true)),
    });
  } catch (err) {
    next(err);
  }
});
