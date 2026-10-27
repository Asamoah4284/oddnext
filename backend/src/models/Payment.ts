import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    externalRef: { type: String, required: true, unique: true },
    product: { type: String, default: "vip", index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "GHS" },
    provider: {
      type: String,
      enum: ["moolre", "paystack", "opay", "manual"],
      default: "moolre",
    },
    status: {
      type: String,
      enum: ["pending", "proof_submitted", "paid", "failed"],
      default: "pending",
    },
    phone: { type: String, trim: true, default: "" },
    proofImage: { type: String, default: "" },
    proofNote: { type: String, default: "" },
    proofSubmittedAt: { type: Date, default: null },
    smsSent: { type: Boolean, default: false },
    slipViewed: { type: Boolean, default: false },
    revealCode: { type: String, sparse: true, unique: true, index: true, trim: true },
    codeType: { type: String, enum: ["single", "vip"], default: "single" },
    unlockCount: { type: Number, default: 0 },
    maxUnlocks: { type: Number, default: 2 },
    vipExpiresAt: { type: Date, default: null },
    deviceIds: { type: [String], default: [] },
    activeSessionDeviceId: { type: String, default: "" },
    activeSessionExpiresAt: { type: Date, default: null },
    lastUnlockedAt: { type: Date, default: null },
    dailyUnlockDate: { type: String, default: "" }, // Format: YYYY-MM-DD
    dailyUnlockCount: { type: Number, default: 0 },
    maxDailyUnlocks: { type: Number, default: 3 },
    moolreTxId: { type: String, default: "" },
    rawCallback: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Payment: Model<PaymentDoc> =
  mongoose.models.Payment ?? mongoose.model<PaymentDoc>("Payment", paymentSchema);
