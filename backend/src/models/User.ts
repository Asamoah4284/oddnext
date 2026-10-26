import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isVip: { type: Boolean, default: false },
    entitlements: { type: [String], default: [] },
    phone: { type: String, trim: true, default: "" },
    vipExpiresAt: { type: Date, default: null },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function hasActiveVip(user: {
  role?: string;
  isVip?: boolean;
  vipExpiresAt?: Date | null;
}): boolean {
  if (user.role === "admin") return true;
  if (!user.isVip) return false;
  if (user.vipExpiresAt) {
    return new Date(user.vipExpiresAt).getTime() > Date.now();
  }
  return true;
}

export const User: Model<UserDoc> =
  mongoose.models.User ?? mongoose.model<UserDoc>("User", userSchema);
