import type { ProductItem, SlipProductId } from "./products";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  isVip: boolean;
  entitlements: string[];
  phone?: string;
  vipExpiresAt: string | null;
  vipActive: boolean;
};

export type SiteStats = {
  winRate: number;
  monthlyTips: number;
  vipMembers: number;
  telegramCount: number;
  telegramUrl: string;
  vipPriceGhs: number;
  products?: ProductItem[];
};

export type Tip = {
  id: string;
  kickoffAt: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  odds: number | null;
  product: SlipProductId;
  status: "pending" | "won" | "lost";
  isVip: boolean;
  locked: boolean;
  bookingCode: string;
};

export type TipsResponse = {
  tab: "yesterday" | "today";
  board: SlipProductId;
  vipAccess: boolean;
  boardAccess: boolean;
  entitlements: string[];
  tips: Tip[];
};

export type AdminTip = {
  id: string;
  kickoffAt: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  odds: number;
  product: SlipProductId;
  status: "pending" | "won" | "lost";
  isVip: boolean;
  bookingCode: string;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  isVip: boolean;
  entitlements: string[];
  vipExpiresAt: string | null;
  createdAt: string;
};

export type RevenueBucket = {
  grossGhs: number;
  grossNgn: number;
  combinedGhs: number;
  hisGhs: number;
  myGhs: number;
  hisNgn: number;
  myNgn: number;
  combinedHisGhs: number;
  combinedMyGhs: number;
  count: number;
};

export type ProductRevenue = {
  id: string;
  label: string;
  priceGhs: number;
  priceNgn: number;
  count: number;
  grossGhs: number;
  grossNgn: number;
  hisGhs: number;
  myGhs: number;
  hisNgn: number;
  myNgn: number;
};

export type DayRevenueTrend = {
  date: string;
  label: string;
  grossGhs: number;
  grossNgn: number;
  hisGhs: number;
  myGhs: number;
  count: number;
};

export type PaymentAnalyticsData = {
  split: { hisPercent: number; myPercent: number };
  ghsToNgn: number;
  day: RevenueBucket;
  week: RevenueBucket;
  month: RevenueBucket;
  allTime: RevenueBucket;
  statusCounts: {
    paid: number;
    pending: number;
    proofSubmitted?: number;
    failed: number;
    total: number;
    successRate: number;
  };
  byProduct: ProductRevenue[];
  recentTrend: DayRevenueTrend[];
};

export type AdminPaymentItem = {
  id: string;
  externalRef: string;
  product: string;
  amount: number;
  currency: string;
  provider: string;
  status: "paid" | "pending" | "failed" | "proof_submitted";
  phone: string;
  proofImage?: string;
  proofNote?: string;
  proofSubmittedAt?: string | null;
  revealCode?: string;
  smsSent: boolean;
  slipViewed: boolean;
  createdAt: string;
  updatedAt: string;
  hisShare: number;
  myShare: number;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
};

export type AdminPayoutItem = {
  id: string;
  recipient: "Forson" | "Asamoah";
  splitPercentage: number;
  amount: number;
  currency: "GHS" | "NGN";
  method: "mobile_money" | "bank";
  network?: string;
  phone?: string;
  bankName?: string;
  accountNumber?: string;
  accountName: string;
  branch?: string;
  notes?: string;
  status: "pending" | "paid" | "rejected";
  requestedBy?: string;
  paidAt?: string | null;
  paidBy?: string;
  paidReference?: string;
  createdAt: string;
  updatedAt: string;
};

export type PayoutAdminSummary = {
  earnedGhs: number;
  earnedNgn: number;
  paidGhs: number;
  paidNgn: number;
  pendingGhs: number;
  pendingNgn: number;
  availableGhs: number;
  availableNgn: number;
};

export type PayoutsResponse = {
  payouts: AdminPayoutItem[];
  summary: {
    forson: PayoutAdminSummary;
    asamoah: PayoutAdminSummary;
  };
};

