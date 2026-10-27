import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const payoutSchema = new Schema(
  {
    recipient: {
      type: String,
      required: true,
      enum: ["Forson", "Asamoah"],
      trim: true,
      index: true,
    },
    splitPercentage: {
      type: Number,
      required: true,
      default: 60,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      enum: ["GHS", "NGN"],
      default: "GHS",
    },
    method: {
      type: String,
      enum: ["mobile_money", "bank"],
      required: true,
      index: true,
    },
    // Mobile Money details
    network: {
      type: String,
      trim: true,
      default: "", // e.g. "MTN Mobile Money", "Telecel Cash", "AirtelTigo Money", "OPay", "PalmPay"
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    // Bank Transfer details
    bankName: {
      type: String,
      trim: true,
      default: "",
    },
    accountNumber: {
      type: String,
      trim: true,
      default: "",
    },
    accountName: {
      type: String,
      trim: true,
      required: true,
    },
    branch: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "paid", "rejected"],
      default: "pending",
      index: true,
    },
    requestedBy: {
      type: String,
      trim: true,
      default: "",
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paidBy: {
      type: String,
      trim: true,
      default: "",
    },
    paidReference: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

export type PayoutDoc = InferSchemaType<typeof payoutSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Payout: Model<PayoutDoc> =
  mongoose.models.Payout ?? mongoose.model<PayoutDoc>("Payout", payoutSchema);
