import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getOrCreateStats } from "../models/Stats.js";
import { Tip } from "../models/Tip.js";
import { User } from "../models/User.js";
import {
  PRODUCTS,
  SLIP_PRODUCT_IDS,
  VIP_PRODUCT,
  getProducts,
  loadProductPrices,
  updateProductPrices,
} from "../products.js";
import { config } from "../config.js";
import { Payment } from "../models/Payment.js";
import { Payout } from "../models/Payout.js";
import { fulfillVipPayment } from "../services/vip.js";
import { HttpError } from "../utils/httpError.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

function serializeAdminTip(tip: {
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
    bookingCode: tip.bookingCode || "",
  };
}

const tipSchema = z.object({
  kickoffAt: z.string().datetime({ offset: true }).or(z.string().min(8)),
  league: z.string().trim().min(2).max(80),
  homeTeam: z.string().trim().min(1).max(80),
  awayTeam: z.string().trim().min(1).max(80),
  prediction: z.string().trim().min(1).max(80),
  odds: z.coerce.number().min(1).max(1000),
  status: z.enum(["pending", "won", "lost"]).optional(),
  product: z.enum(SLIP_PRODUCT_IDS).optional(),
  isVip: z.boolean().optional(),
  bookingCode: z.string().trim().max(80).optional(),
});

const tipPatchSchema = tipSchema.partial();

function utcDayRange(date: Date): { from: Date; to: Date } {
  const from = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
  );
  const to = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
  return { from, to };
}

adminRouter.get("/tips", async (_req, res, next) => {
  try {
    const [tips, products] = await Promise.all([
      Tip.find().sort({ kickoffAt: -1 }).limit(300),
      loadProductPrices(),
    ]);
    res.json({
      products,
      tips: tips.map(serializeAdminTip),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/tips", async (req, res, next) => {
  try {
    const body = tipSchema.parse(req.body);
    const kickoffAt = new Date(body.kickoffAt);
    const product = body.product ?? "odds10";
    const { from, to } = utcDayRange(kickoffAt);
    const sibling = await Tip.findOne({
      product,
      kickoffAt: { $gte: from, $lte: to },
      bookingCode: { $nin: ["", null] },
    }).sort({ kickoffAt: 1 });
    const tip = await Tip.create({
      ...body,
      kickoffAt,
      status: body.status ?? "pending",
      product,
      isVip: body.isVip ?? true,
      bookingCode: body.bookingCode || sibling?.bookingCode || "",
    });
    res.status(201).json({ id: tip._id.toString(), product: tip.product });
  } catch (err) {
    next(err);
  }
});

const bulkTipsSchema = z.object({
  tips: z.array(tipSchema).min(1).max(200),
  bookingCode: z.string().trim().max(80).optional(),
});

adminRouter.post("/tips/bulk", async (req, res, next) => {
  try {
    const { tips: rawTips, bookingCode } = bulkTipsSchema.parse(req.body);
    const docs = rawTips.map((item) => {
      const kickoffAt = new Date(item.kickoffAt);
      const product = item.product ?? "odds10";
      return {
        ...item,
        kickoffAt,
        status: item.status ?? "pending",
        product,
        isVip: item.isVip ?? true,
        bookingCode: item.bookingCode || bookingCode || "",
      };
    });

    const created = await Tip.insertMany(docs);

    if (bookingCode && docs.length > 0) {
      const first = docs[0];
      const { from, to } = utcDayRange(first.kickoffAt);
      await Tip.updateMany(
        { product: first.product, kickoffAt: { $gte: from, $lte: to } },
        { $set: { bookingCode } }
      );
    }

    res.status(201).json({
      count: created.length,
      tips: created.map(serializeAdminTip),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/boards/booking", async (req, res, next) => {
  try {
    const body = z
      .object({
        product: z.enum(SLIP_PRODUCT_IDS),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        bookingCode: z.string().trim().max(80),
      })
      .parse(req.body);
    const { from, to } = utcDayRange(new Date(`${body.date}T12:00:00.000Z`));
    const result = await Tip.updateMany(
      { product: body.product, kickoffAt: { $gte: from, $lte: to } },
      { $set: { bookingCode: body.bookingCode } }
    );
    res.json({ updated: result.modifiedCount, bookingCode: body.bookingCode });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/tips/:id", async (req, res, next) => {
  try {
    const body = tipPatchSchema.parse(req.body);
    const update: Record<string, unknown> = { ...body };
    if (body.kickoffAt) update.kickoffAt = new Date(body.kickoffAt);
    const tip = await Tip.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!tip) throw new HttpError(404, "Tip not found");
    res.json(serializeAdminTip(tip));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/tips", async (req, res, next) => {
  try {
    const product = req.query.product ? String(req.query.product) : undefined;
    const filter = product && product !== "all" ? { product } : {};
    const result = await Tip.deleteMany(filter);
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/tips/:id", async (req, res, next) => {
  try {
    const tip = await Tip.findByIdAndDelete(req.params.id);
    if (!tip) throw new HttpError(404, "Tip not found");
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/users", async (req: AuthedRequest, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const filter = q
      ? {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
          ],
        }
      : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({
      users: users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isVip: user.isVip,
        entitlements: user.entitlements ?? [],
        vipExpiresAt: user.vipExpiresAt,
        createdAt: user.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const vipSchema = z.object({
  grant: z.boolean(),
  days: z.number().int().min(1).max(365).optional(),
});

adminRouter.patch("/users/:id/vip", async (req, res, next) => {
  try {
    const { grant } = vipSchema.parse(req.body);
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, "User not found");
    if (user.role === "admin") {
      throw new HttpError(400, "Admin accounts already have full access");
    }

    if (grant) {
      user.isVip = true;
      user.vipExpiresAt = null;
    } else {
      user.isVip = false;
      user.vipExpiresAt = null;
    }
    await user.save();
    res.json({
      id: user._id.toString(),
      isVip: user.isVip,
      vipExpiresAt: user.vipExpiresAt,
    });
  } catch (err) {
    next(err);
  }
});

const statsSchema = z.object({
  winRate: z.number().min(0).max(100).optional(),
  monthlyTips: z.number().int().min(0).optional(),
  vipMembers: z.number().int().min(0).optional(),
  telegramCount: z.number().int().min(0).optional(),
  telegramUrl: z.string().url().optional(),
  vipPriceGhs: z.number().min(1).optional(),
});

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const stats = await getOrCreateStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/stats", async (req, res, next) => {
  try {
    const body = statsSchema.parse(req.body);
    const stats = await getOrCreateStats();
    Object.assign(stats, body);
    if (typeof body.vipPriceGhs === "number") {
      await updateProductPrices([{ id: "vip", priceGhs: body.vipPriceGhs }]);
    }
    await stats.save();
    const products = await loadProductPrices();
    const vip = products.find((p) => p.id === "vip");
    res.json({
      winRate: stats.winRate,
      monthlyTips: stats.monthlyTips,
      vipMembers: stats.vipMembers,
      telegramCount: stats.telegramCount,
      telegramUrl: stats.telegramUrl,
      vipPriceGhs: vip?.priceGhs ?? stats.vipPriceGhs,
    });
  } catch (err) {
    next(err);
  }
});

const pricesSchema = z.object({
  prices: z.array(
    z.object({
      id: z.string(),
      priceGhs: z.number().min(1),
      priceNgn: z.number().min(1),
      label: z.string().optional(),
    })
  ),
});

adminRouter.get("/prices", async (_req, res, next) => {
  try {
    const products = await loadProductPrices();
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/prices", async (req, res, next) => {
  try {
    const { prices } = pricesSchema.parse(req.body);
    const updated = await updateProductPrices(prices);
    res.json({ products: updated });
  } catch (err) {
    next(err);
  }
});

function computeRevenueBucket(
  payments: Array<{ amount: number; currency?: string }>,
  ghsToNgn: number
) {
  let grossGhs = 0;
  let grossNgn = 0;
  for (const p of payments) {
    if ((p.currency || "GHS").toUpperCase() === "NGN") {
      grossNgn += p.amount;
    } else {
      grossGhs += p.amount;
    }
  }

  // 60% His Split (Admin / Tipster), 40% My Split (Developer / Partner)
  const hisGhs = Math.round(grossGhs * 0.6 * 100) / 100;
  const myGhs = Math.round(grossGhs * 0.4 * 100) / 100;
  const hisNgn = Math.round(grossNgn * 0.6 * 100) / 100;
  const myNgn = Math.round(grossNgn * 0.4 * 100) / 100;

  const combinedGhs =
    Math.round((grossGhs + grossNgn / (ghsToNgn || 114)) * 100) / 100;
  const combinedHisGhs = Math.round(combinedGhs * 0.6 * 100) / 100;
  const combinedMyGhs = Math.round(combinedGhs * 0.4 * 100) / 100;

  return {
    grossGhs: Math.round(grossGhs * 100) / 100,
    grossNgn: Math.round(grossNgn * 100) / 100,
    combinedGhs,
    hisGhs,
    myGhs,
    hisNgn,
    myNgn,
    combinedHisGhs,
    combinedMyGhs,
    count: payments.length,
  };
}

adminRouter.get("/payments/analytics", async (_req, res, next) => {
  try {
    const ghsToNgn = config.ghsToNgn || 114;
    const now = new Date();

    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const startOfWeek = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + diffToMonday,
      0,
      0,
      0,
      0
    );
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0
    );

    const [allPaid, statusCounts, allProducts] = await Promise.all([
      Payment.find({ status: "paid" }),
      Payment.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalGhs: {
              $sum: {
                $cond: [{ $eq: ["$currency", "GHS"] }, "$amount", 0],
              },
            },
            totalNgn: {
              $sum: {
                $cond: [{ $eq: ["$currency", "NGN"] }, "$amount", 0],
              },
            },
          },
        },
      ]),
      loadProductPrices(),
    ]);

    const dayPaid = allPaid.filter(
      (p) => p.createdAt && new Date(p.createdAt) >= startOfDay
    );
    const weekPaid = allPaid.filter(
      (p) => p.createdAt && new Date(p.createdAt) >= startOfWeek
    );
    const monthPaid = allPaid.filter(
      (p) => p.createdAt && new Date(p.createdAt) >= startOfMonth
    );

    const day = computeRevenueBucket(dayPaid, ghsToNgn);
    const week = computeRevenueBucket(weekPaid, ghsToNgn);
    const month = computeRevenueBucket(monthPaid, ghsToNgn);
    const allTime = computeRevenueBucket(allPaid, ghsToNgn);

    let paidCount = 0;
    let pendingCount = 0;
    let proofSubmittedCount = 0;
    let failedCount = 0;
    let totalCount = 0;
    for (const s of statusCounts) {
      if (s._id === "paid") paidCount = s.count;
      else if (s._id === "pending") pendingCount = s.count;
      else if (s._id === "proof_submitted") proofSubmittedCount = s.count;
      else if (s._id === "failed") failedCount = s.count;
      totalCount += s.count;
    }
    const successRate =
      totalCount > 0 ? Math.round((paidCount / totalCount) * 1000) / 10 : 0;

    const productMap = new Map<
      string,
      { grossGhs: number; grossNgn: number; count: number }
    >();
    for (const p of allPaid) {
      const prod = p.product || "vip";
      const existing = productMap.get(prod) || {
        grossGhs: 0,
        grossNgn: 0,
        count: 0,
      };
      if ((p.currency || "GHS").toUpperCase() === "NGN") {
        existing.grossNgn += p.amount;
      } else {
        existing.grossGhs += p.amount;
      }
      existing.count += 1;
      productMap.set(prod, existing);
    }

    const byProduct = allProducts.map((p) => {
      const data = productMap.get(p.id) || {
        grossGhs: 0,
        grossNgn: 0,
        count: 0,
      };
      const hisGhs = Math.round(data.grossGhs * 0.6 * 100) / 100;
      const myGhs = Math.round(data.grossGhs * 0.4 * 100) / 100;
      const hisNgn = Math.round(data.grossNgn * 0.6 * 100) / 100;
      const myNgn = Math.round(data.grossNgn * 0.4 * 100) / 100;
      return {
        id: p.id,
        label: p.label,
        priceGhs: p.priceGhs,
        priceNgn: p.priceNgn,
        count: data.count,
        grossGhs: data.grossGhs,
        grossNgn: data.grossNgn,
        hisGhs,
        myGhs,
        hisNgn,
        myNgn,
      };
    });

    const recentTrend: Array<{
      date: string;
      label: string;
      grossGhs: number;
      grossNgn: number;
      hisGhs: number;
      myGhs: number;
      count: number;
    }> = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - i,
        0,
        0,
        0,
        0
      );
      const endD = new Date(d);
      endD.setHours(23, 59, 59, 999);
      const inDay = allPaid.filter((p) => {
        if (!p.createdAt) return false;
        const pt = new Date(p.createdAt).getTime();
        return pt >= d.getTime() && pt <= endD.getTime();
      });
      const bucket = computeRevenueBucket(inDay, ghsToNgn);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      recentTrend.push({
        date: dateStr,
        label,
        grossGhs: bucket.grossGhs,
        grossNgn: bucket.grossNgn,
        hisGhs: bucket.hisGhs,
        myGhs: bucket.myGhs,
        count: bucket.count,
      });
    }

    res.json({
      analytics: {
        split: { hisPercent: 60, myPercent: 40 },
        ghsToNgn,
        day,
        week,
        month,
        allTime,
        statusCounts: {
          paid: paidCount,
          pending: pendingCount,
          proofSubmitted: proofSubmittedCount,
          failed: failedCount,
          total: totalCount,
          successRate,
        },
        byProduct,
        recentTrend,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/payments", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20)
    );
    const status = String(req.query.status || "all");
    const product = String(req.query.product || "all");
    const currency = String(req.query.currency || "all");
    const search = String(req.query.search || "").trim();

    const query: Record<string, unknown> = {};
    if (status !== "all") query.status = status;
    if (product !== "all") query.product = product;
    if (currency !== "all") query.currency = currency;

    if (search) {
      const matchedUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ],
      }).select("_id");
      const userIds = matchedUsers.map((u) => u._id);

      query.$or = [
        { externalRef: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { userId: { $in: userIds } },
      ];
    }

    const [total, payments] = await Promise.all([
      Payment.countDocuments(query),
      Payment.find(query)
        .populate("userId", "name email phone")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    const serialized = payments.map((p) => {
      const userDoc = p.userId as unknown as {
        _id?: unknown;
        name?: string;
        email?: string;
        phone?: string;
      } | null;
      const amount = p.amount || 0;
      return {
        id: p._id.toString(),
        externalRef: p.externalRef,
        product: p.product || "vip",
        amount,
        currency: p.currency || "GHS",
        provider: p.provider || "moolre",
        status: p.status,
        phone: p.phone,
        proofImage: p.proofImage || "",
        proofNote: p.proofNote || "",
        proofSubmittedAt: p.proofSubmittedAt || null,
        revealCode: p.revealCode || "",
        smsSent: p.smsSent,
        slipViewed: p.slipViewed,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        hisShare: Math.round(amount * 0.6 * 100) / 100,
        myShare: Math.round(amount * 0.4 * 100) / 100,
        customer: userDoc
          ? {
              id: userDoc._id?.toString() || "",
              name: userDoc.name || "",
              email: userDoc.email || "",
              phone: userDoc.phone || p.phone || "",
            }
          : {
              id: "",
              name: "Buyer",
              email: "",
              phone: p.phone || "",
            },
      };
    });

    res.json({
      payments: serialized,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/payments/:id/mark-paid", async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw new HttpError(404, "Payment not found");
    if (payment.status === "paid") {
      return res.json({
        payment,
        message: "Payment was already marked as paid",
      });
    }

    const fulfilled = await fulfillVipPayment(payment.externalRef);
    const updated = await Payment.findById(payment._id).populate(
      "userId",
      "name email phone"
    );
    res.json({
      payment: updated,
      fulfilled,
      message: "Payment approved, access granted, and odds SMS dispatched.",
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/payments/:id/approve", async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw new HttpError(404, "Payment not found");
    if (payment.status === "paid") {
      return res.json({
        payment,
        message: "Payment was already approved and paid",
      });
    }

    const fulfilled = await fulfillVipPayment(payment.externalRef);
    const updated = await Payment.findById(payment._id).populate(
      "userId",
      "name email phone"
    );
    res.json({
      payment: updated,
      fulfilled,
      message: "Payment approved, odds activated, and SMS sent to user.",
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/payments/:id/reject", async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw new HttpError(404, "Payment not found");
    payment.status = "failed";
    await payment.save();
    const updated = await Payment.findById(payment._id).populate(
      "userId",
      "name email phone"
    );
    res.json({
      payment: updated,
      message: "Payment rejected and marked as failed.",
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/payments/:id", async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw new HttpError(404, "Payment not found");
    if (payment.status === "paid") {
      throw new HttpError(
        400,
        "Cannot delete a paid transaction. Only pending or awaiting approval transactions can be deleted."
      );
    }

    await Payment.findByIdAndDelete(payment._id);
    res.json({
      message: "Transaction deleted successfully.",
      deletedId: req.params.id,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/payments", async (_req, res, next) => {
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
});

// ==========================================
// ADMIN SPLIT PAYOUTS & DISBURSEMENTS
// ==========================================

const payoutRequestSchema = z.object({
  recipient: z.enum(["Forson", "Asamoah"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  currency: z.enum(["GHS", "NGN"]).default("GHS"),
  method: z.enum(["mobile_money", "bank"]),
  network: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  accountName: z.string().trim().min(2, "Account holder name is required"),
  branch: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

adminRouter.get("/payouts", async (_req, res, next) => {
  try {
    // 1. Compute all-time split earnings from settled paid payments
    const paidPayments = await Payment.find({ status: "paid" }).select("amount currency");
    let grossGhs = 0;
    let grossNgn = 0;
    for (const p of paidPayments) {
      if ((p.currency || "GHS").toUpperCase() === "NGN") {
        grossNgn += p.amount || 0;
      } else {
        grossGhs += p.amount || 0;
      }
    }
    const forsonTotalEarnedGhs = Math.round(grossGhs * 0.6 * 100) / 100;
    const forsonTotalEarnedNgn = Math.round(grossNgn * 0.6 * 100) / 100;
    const asamoahTotalEarnedGhs = Math.round(grossGhs * 0.4 * 100) / 100;
    const asamoahTotalEarnedNgn = Math.round(grossNgn * 0.4 * 100) / 100;

    // 2. Fetch all payout records
    const payouts = await Payout.find().sort({ createdAt: -1 });

    // 3. Compute paid & pending sums for each split admin
    let forsonPaidGhs = 0, forsonPaidNgn = 0;
    let forsonPendingGhs = 0, forsonPendingNgn = 0;
    let asamoahPaidGhs = 0, asamoahPaidNgn = 0;
    let asamoahPendingGhs = 0, asamoahPendingNgn = 0;

    for (const po of payouts) {
      const isForson = po.recipient === "Forson";
      const isNgn = (po.currency || "GHS").toUpperCase() === "NGN";
      const amt = po.amount || 0;

      if (po.status === "paid") {
        if (isForson) {
          if (isNgn) forsonPaidNgn += amt;
          else forsonPaidGhs += amt;
        } else {
          if (isNgn) asamoahPaidNgn += amt;
          else asamoahPaidGhs += amt;
        }
      } else if (po.status === "pending") {
        if (isForson) {
          if (isNgn) forsonPendingNgn += amt;
          else forsonPendingGhs += amt;
        } else {
          if (isNgn) asamoahPendingNgn += amt;
          else asamoahPendingGhs += amt;
        }
      }
    }

    const round = (val: number) => Math.round(val * 100) / 100;

    const summary = {
      forson: {
        earnedGhs: round(forsonTotalEarnedGhs),
        earnedNgn: round(forsonTotalEarnedNgn),
        paidGhs: round(forsonPaidGhs),
        paidNgn: round(forsonPaidNgn),
        pendingGhs: round(forsonPendingGhs),
        pendingNgn: round(forsonPendingNgn),
        availableGhs: round(Math.max(0, forsonTotalEarnedGhs - forsonPaidGhs - forsonPendingGhs)),
        availableNgn: round(Math.max(0, forsonTotalEarnedNgn - forsonPaidNgn - forsonPendingNgn)),
      },
      asamoah: {
        earnedGhs: round(asamoahTotalEarnedGhs),
        earnedNgn: round(asamoahTotalEarnedNgn),
        paidGhs: round(asamoahPaidGhs),
        paidNgn: round(asamoahPaidNgn),
        pendingGhs: round(asamoahPendingGhs),
        pendingNgn: round(asamoahPendingNgn),
        availableGhs: round(Math.max(0, asamoahTotalEarnedGhs - asamoahPaidGhs - asamoahPendingGhs)),
        availableNgn: round(Math.max(0, asamoahTotalEarnedNgn - asamoahPaidNgn - asamoahPendingNgn)),
      },
    };

    const serialized = payouts.map((p) => ({
      id: p._id.toString(),
      recipient: p.recipient,
      splitPercentage: p.splitPercentage,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      network: p.network || "",
      phone: p.phone || "",
      bankName: p.bankName || "",
      accountNumber: p.accountNumber || "",
      accountName: p.accountName || "",
      branch: p.branch || "",
      notes: p.notes || "",
      status: p.status,
      requestedBy: p.requestedBy || "",
      paidAt: p.paidAt || null,
      paidBy: p.paidBy || "",
      paidReference: p.paidReference || "",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    res.json({
      payouts: serialized,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/payouts", async (req: AuthedRequest, res, next) => {
  try {
    const body = payoutRequestSchema.parse(req.body);

    if (body.method === "mobile_money") {
      if (!body.phone || body.phone.length < 8) {
        throw new HttpError(400, "Mobile Money phone number is required (min 8 digits)");
      }
      if (!body.network) {
        throw new HttpError(400, "Mobile Money network provider is required");
      }
    } else if (body.method === "bank") {
      if (!body.bankName) {
        throw new HttpError(400, "Bank name is required");
      }
      if (!body.accountNumber || body.accountNumber.length < 6) {
        throw new HttpError(400, "Bank account number is required (min 6 digits)");
      }
    }

    const splitPercentage = body.recipient === "Forson" ? 60 : 40;
    const requestedBy = req.user?.name || req.user?.email || body.recipient;

    const payout = await Payout.create({
      recipient: body.recipient,
      splitPercentage,
      amount: Math.round(body.amount * 100) / 100,
      currency: body.currency,
      method: body.method,
      network: body.network || "",
      phone: body.phone || "",
      bankName: body.bankName || "",
      accountNumber: body.accountNumber || "",
      accountName: body.accountName,
      branch: body.branch || "",
      notes: body.notes || "",
      status: "pending",
      requestedBy,
    });

    res.status(201).json({
      payout: {
        id: payout._id.toString(),
        recipient: payout.recipient,
        splitPercentage: payout.splitPercentage,
        amount: payout.amount,
        currency: payout.currency,
        method: payout.method,
        network: payout.network,
        phone: payout.phone,
        bankName: payout.bankName,
        accountNumber: payout.accountNumber,
        accountName: payout.accountName,
        branch: payout.branch,
        notes: payout.notes,
        status: payout.status,
        requestedBy: payout.requestedBy,
        createdAt: payout.createdAt,
      },
      message: `Payout request of ${payout.currency} ${payout.amount.toFixed(2)} for ${payout.recipient} (${splitPercentage}%) submitted successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/payouts/:id/mark-paid", async (req: AuthedRequest, res, next) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) throw new HttpError(404, "Payout request not found");
    if (payout.status === "paid") {
      return res.json({
        payout,
        message: "Payout is already marked as paid.",
      });
    }

    payout.status = "paid";
    payout.paidAt = new Date();
    payout.paidBy = req.user?.name || req.user?.email || "Admin";
    if (req.body.paidReference) {
      payout.paidReference = String(req.body.paidReference).trim();
    }
    await payout.save();

    res.json({
      payout: {
        id: payout._id.toString(),
        recipient: payout.recipient,
        splitPercentage: payout.splitPercentage,
        amount: payout.amount,
        currency: payout.currency,
        method: payout.method,
        network: payout.network,
        phone: payout.phone,
        bankName: payout.bankName,
        accountNumber: payout.accountNumber,
        accountName: payout.accountName,
        status: payout.status,
        paidAt: payout.paidAt,
        paidBy: payout.paidBy,
        paidReference: payout.paidReference,
      },
      message: `Payout of ${payout.currency} ${payout.amount.toFixed(2)} to ${payout.recipient} (${payout.splitPercentage}%) marked as paid successfully!`,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/payouts/:id/reject", async (_req, res, next) => {
  try {
    const payout = await Payout.findById(_req.params.id);
    if (!payout) throw new HttpError(404, "Payout request not found");

    payout.status = "rejected";
    if (_req.body.reason) {
      payout.notes = (payout.notes ? payout.notes + " | " : "") + "Rejected: " + String(_req.body.reason).trim();
    }
    await payout.save();

    res.json({
      payout,
      message: "Payout marked as rejected.",
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/payouts/:id", async (req, res, next) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) throw new HttpError(404, "Payout request not found");

    await Payout.findByIdAndDelete(payout._id);
    res.json({
      message: "Payout request deleted successfully.",
      deletedId: req.params.id,
    });
  } catch (err) {
    next(err);
  }
});


