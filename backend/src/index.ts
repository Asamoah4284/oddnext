import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { paymentsRouter } from "./routes/payments.js";
import { statsRouter } from "./routes/stats.js";
import { tipsRouter } from "./routes/tips.js";
import { codesRouter } from "./routes/codes.js";
import { ensureAdmin, seedIfEmpty } from "./scripts/seed.js";
import { getProducts, loadProductPrices } from "./products.js";

const app = express();

const frontendOrigin = config.frontendUrl.replace(/\/$/, "");

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return callback(null, true);
      }
      if (/^https:\/\/([a-z0-9-]+\.)?vercel\.app$/i.test(origin) || origin.includes("oddnext")) {
        return callback(null, true);
      }
      if (frontendOrigin && origin === frontendOrigin) {
        return callback(null, true);
      }
      callback(null, true);
    },
    credentials: true,
  })
);
app.use(
  express.json({
    limit: "15mb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ limit: "15mb", extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});


app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "oddnext-api" });
});

app.get("/api/products", async (_req, res, next) => {
  try {
    const products = await loadProductPrices();
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/tips", tipsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/payments", paymentLimiter, paymentsRouter);
app.use("/api/codes", codesRouter);
app.use("/api/admin", adminRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use(errorHandler);

async function start(): Promise<void> {
  await connectDb();
  await loadProductPrices();
  if (config.isDev) {
    await seedIfEmpty();
  }
  await ensureAdmin();
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Oddnext API listening on ${config.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
