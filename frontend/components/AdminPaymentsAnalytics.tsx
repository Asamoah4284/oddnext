"use client";

import { useEffect, useState, useMemo } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { productLabel } from "@/lib/products";
import type {
  PaymentAnalyticsData,
  AdminPaymentItem,
  RevenueBucket,
  AdminPayoutItem,
  PayoutsResponse,
  PayoutAdminSummary,
} from "@/lib/types";
import {
  IconCrown,
  IconBriefcase,
  IconCreditCard,
  IconCamera,
  IconPieChart,
  IconRefresh,
  IconCheck,
  IconX,
  IconClipboard,
  IconActivity,
  IconWhatsApp,
  IconBarChart,
  IconTable,
  IconBell,
  IconBuilding,
  IconSmartphone,
  IconSend,
  IconReceipt,
  IconClock,
  IconSearch,
} from "@/components/Icons";

interface AdminPaymentsAnalyticsProps {
  token: string | null;
}

function DustbinIcon({
  className = "w-3.5 h-3.5",
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g
        className={
          animated
            ? "transition-transform duration-200 ease-out group-hover/del:-translate-y-0.5 group-hover/del:-rotate-12 group-hover/clear:-translate-y-0.5 group-hover/clear:-rotate-12"
            : ""
        }
        style={{ transformOrigin: "4px 6px" }}
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </g>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function getWhatsAppUrl(
  rawPhone: string | undefined | null,
  currency?: string,
  message?: string
): string | null {
  if (!rawPhone) return null;
  let digits = rawPhone.replace(/\D/g, "");
  if (!digits) return null;

  // Normalise 0-prefixed local numbers to international format (234 for NGN, 233 for GHS)
  if (digits.startsWith("0")) {
    const prefix = currency === "NGN" ? "234" : "233";
    digits = prefix + digits.slice(1);
  } else if (!digits.startsWith("234") && !digits.startsWith("233")) {
    if (currency === "NGN") {
      digits = "234" + digits;
    } else if (currency === "GHS" || digits.length <= 10) {
      digits = "233" + digits;
    }
  }

  if (digits.length < 9) return null;

  const base = `https://wa.me/${digits}`;
  if (message && message.trim()) {
    return `${base}?text=${encodeURIComponent(message.trim())}`;
  }
  return base;
}

const PRODUCT_THEMES: Record<
  string,
  {
    color: string;
    bgDot: string;
    bgLight: string;
    border: string;
    text: string;
    gradient: string;
  }
> = {
  odds10: {
    color: "#10B981",
    bgDot: "bg-emerald-500",
    bgLight: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    gradient: "from-emerald-500 to-teal-500",
  },
  odds50: {
    color: "#3B82F6",
    bgDot: "bg-blue-500",
    bgLight: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    gradient: "from-blue-500 to-indigo-500",
  },
  odds100: {
    color: "#8B5CF6",
    bgDot: "bg-violet-500",
    bgLight: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
    gradient: "from-violet-500 to-purple-600",
  },
  draw: {
    color: "#F59E0B",
    bgDot: "bg-amber-500",
    bgLight: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    gradient: "from-amber-500 to-orange-500",
  },
  correctScore: {
    color: "#EC4899",
    bgDot: "bg-pink-500",
    bgLight: "bg-pink-50",
    border: "border-pink-200",
    text: "text-pink-700",
    gradient: "from-pink-500 to-rose-500",
  },
  vip: {
    color: "#06B6D4",
    bgDot: "bg-cyan-500",
    bgLight: "bg-cyan-50",
    border: "border-cyan-200",
    text: "text-cyan-700",
    gradient: "from-cyan-500 to-teal-600",
  },
};

function getProductTheme(id: string, index = 0) {
  if (PRODUCT_THEMES[id]) return PRODUCT_THEMES[id];
  const list = Object.values(PRODUCT_THEMES);
  return list[index % list.length];
}

export function AdminPaymentsAnalytics({ token }: AdminPaymentsAnalyticsProps) {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "allTime">("day");
  const [analytics, setAnalytics] = useState<PaymentAnalyticsData | null>(null);
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  // Payment filters & pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPaymentsCount, setTotalPaymentsCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [previewProof, setPreviewProof] = useState<AdminPaymentItem | null>(null);

  // Product Graphs & Breakdown state
  const [productViewMode, setProductViewMode] = useState<"graphs" | "table">("graphs");
  const [hoveredProdId, setHoveredProdId] = useState<string | null>(null);

  // Split Admin Payouts State
  const [payouts, setPayouts] = useState<AdminPayoutItem[]>([]);
  const [payoutSummary, setPayoutSummary] = useState<{
    forson: PayoutAdminSummary;
    asamoah: PayoutAdminSummary;
  } | null>(null);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [payoutFilter, setPayoutFilter] = useState<"all" | "pending" | "paid" | "Forson" | "Asamoah">("all");
  const [payoutSearch, setPayoutSearch] = useState("");
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [markingPayoutId, setMarkingPayoutId] = useState<string | null>(null);
  const [deletingPayoutId, setDeletingPayoutId] = useState<string | null>(null);
  const [markPaidModalPayout, setMarkPaidModalPayout] = useState<AdminPayoutItem | null>(null);
  const [markPaidReference, setMarkPaidReference] = useState("");

  // Payout Request Form State
  const [payoutRecipient, setPayoutRecipient] = useState<"Forson" | "Asamoah">("Forson");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutCurrency, setPayoutCurrency] = useState<"GHS" | "NGN">("GHS");
  const [payoutMethod, setPayoutMethod] = useState<"mobile_money" | "bank">("mobile_money");
  const [payoutNetwork, setPayoutNetwork] = useState("MTN Mobile Money");
  const [payoutPhone, setPayoutPhone] = useState("");
  const [payoutBankName, setPayoutBankName] = useState("GCB Bank");
  const [payoutAccountNumber, setPayoutAccountNumber] = useState("");
  const [payoutAccountName, setPayoutAccountName] = useState("");
  const [payoutBranch, setPayoutBranch] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [payoutModalError, setPayoutModalError] = useState("");
  const [payoutModalSuccess, setPayoutModalSuccess] = useState("");

  const productTotals = useMemo(() => {
    const list = analytics?.byProduct || [];
    const totalGhs = list.reduce((acc, p) => acc + (p.grossGhs || 0), 0);
    const totalNgn = list.reduce((acc, p) => acc + (p.grossNgn || 0), 0);
    const totalOrders = list.reduce((acc, p) => acc + (p.count || 0), 0);
    const maxGhs = Math.max(...list.map((p) => p.grossGhs || 0), 1);
    const maxOrders = Math.max(...list.map((p) => p.count || 0), 1);
    return { totalGhs, totalNgn, totalOrders, maxGhs, maxOrders };
  }, [analytics?.byProduct]);

  const donutSlices = useMemo(() => {
    const list = analytics?.byProduct || [];
    const C = 2 * Math.PI * 52;
    const totalVal = productTotals.totalGhs;

    if (totalVal <= 0) return [];

    let accumulatedLength = 0;
    return list
      .filter((p) => p.grossGhs > 0)
      .map((p, idx) => {
        const ratio = p.grossGhs / totalVal;
        const strokeLength = ratio * C;
        const offset = -accumulatedLength;
        accumulatedLength += strokeLength;
        const theme = getProductTheme(p.id, idx);
        return {
          id: p.id,
          label: p.label,
          val: p.grossGhs,
          pct: (ratio * 100).toFixed(1),
          strokeDasharray: `${Math.max(0, strokeLength - (list.length > 1 ? 1.5 : 0))} ${C}`,
          strokeDashoffset: offset,
          color: theme.color,
        };
      });
  }, [analytics?.byProduct, productTotals.totalGhs]);

  const hoveredProduct = useMemo(() => {
    if (!hoveredProdId || !analytics?.byProduct) return null;
    return analytics.byProduct.find((p) => p.id === hoveredProdId) || null;
  }, [hoveredProdId, analytics?.byProduct]);

  const filteredPayouts = useMemo(() => {
    return payouts.filter((po) => {
      if (payoutFilter === "pending" && po.status !== "pending") return false;
      if (payoutFilter === "paid" && po.status !== "paid") return false;
      if (payoutFilter === "Forson" && po.recipient !== "Forson") return false;
      if (payoutFilter === "Asamoah" && po.recipient !== "Asamoah") return false;

      if (payoutSearch.trim()) {
        const q = payoutSearch.toLowerCase();
        const matchRecip = po.recipient.toLowerCase().includes(q);
        const matchName = po.accountName.toLowerCase().includes(q);
        const matchPhone = (po.phone || "").toLowerCase().includes(q);
        const matchBank = (po.bankName || "").toLowerCase().includes(q);
        const matchAcc = (po.accountNumber || "").toLowerCase().includes(q);
        const matchRef = (po.paidReference || "").toLowerCase().includes(q);
        if (!matchRecip && !matchName && !matchPhone && !matchBank && !matchAcc && !matchRef) {
          return false;
        }
      }
      return true;
    });
  }, [payouts, payoutFilter, payoutSearch]);

  async function loadAnalytics() {
    if (!token) return;
    try {
      setLoadingAnalytics(true);
      setError("");
      const res = await apiFetch<{ analytics: PaymentAnalyticsData }>(
        "/api/admin/payments/analytics",
        { token }
      );
      setAnalytics(res.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoadingAnalytics(false);
    }
  }

  async function loadPayouts() {
    if (!token) return;
    try {
      setLoadingPayouts(true);
      const res = await apiFetch<PayoutsResponse>("/api/admin/payouts", { token });
      setPayouts(res.payouts || []);
      setPayoutSummary(res.summary || null);
    } catch (err) {
      console.warn("Payouts endpoint response:", err);
      setPayouts([]);
      setPayoutSummary({
        forson: { earnedGhs: 0, earnedNgn: 0, availableGhs: 0, availableNgn: 0, paidGhs: 0, paidNgn: 0, pendingGhs: 0, pendingNgn: 0 },
        asamoah: { earnedGhs: 0, earnedNgn: 0, availableGhs: 0, availableNgn: 0, paidGhs: 0, paidNgn: 0, pendingGhs: 0, pendingNgn: 0 },
      });
    } finally {
      setLoadingPayouts(false);
    }
  }

  function openPayoutModalFor(admin: "Forson" | "Asamoah") {
    setPayoutRecipient(admin);
    setPayoutCurrency("GHS");
    const avail = admin === "Forson"
      ? (payoutSummary?.forson?.availableGhs ?? 0)
      : (payoutSummary?.asamoah?.availableGhs ?? 0);
    setPayoutAmount(avail > 0 ? avail.toFixed(2) : "");
    setPayoutAccountName(admin === "Forson" ? "Forson Kwarteng" : "Asamoah");
    setPayoutModalError("");
    setPayoutModalSuccess("");
    setPayoutModalOpen(true);
  }

  async function handleSubmitPayout(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const num = parseFloat(payoutAmount);
    if (!num || num <= 0) {
      setPayoutModalError("Enter a valid payout amount greater than 0");
      return;
    }
    if (!payoutAccountName.trim()) {
      setPayoutModalError("Account holder name is required");
      return;
    }
    if (payoutMethod === "mobile_money" && (!payoutPhone.trim() || payoutPhone.trim().length < 8)) {
      setPayoutModalError("Enter a valid Mobile Money number (min 8 digits)");
      return;
    }
    if (payoutMethod === "bank" && (!payoutAccountNumber.trim() || payoutAccountNumber.trim().length < 6)) {
      setPayoutModalError("Enter a valid bank account number (min 6 digits)");
      return;
    }

    try {
      setPayoutSubmitting(true);
      setPayoutModalError("");
      await apiFetch("/api/admin/payouts", {
        method: "POST",
        token,
        body: JSON.stringify({
          recipient: payoutRecipient,
          amount: num,
          currency: payoutCurrency,
          method: payoutMethod,
          network: payoutMethod === "mobile_money" ? payoutNetwork : undefined,
          phone: payoutMethod === "mobile_money" ? payoutPhone.trim() : undefined,
          bankName: payoutMethod === "bank" ? payoutBankName : undefined,
          accountNumber: payoutMethod === "bank" ? payoutAccountNumber.trim() : undefined,
          accountName: payoutAccountName.trim(),
          branch: payoutBranch.trim() || undefined,
          notes: payoutNotes.trim() || undefined,
        }),
      });
      setPayoutModalSuccess(`✓ Payout request for ${payoutRecipient} submitted successfully!`);
      await loadPayouts();
      setTimeout(() => {
        setPayoutModalOpen(false);
        setPayoutModalSuccess("");
        setPayoutAmount("");
        setPayoutPhone("");
        setPayoutAccountNumber("");
        setPayoutNotes("");
      }, 1000);
    } catch (err) {
      setPayoutModalError(err instanceof Error ? err.message : "Failed to submit payout request");
    } finally {
      setPayoutSubmitting(false);
    }
  }

  async function handleMarkPayoutPaid(payoutId: string, reference?: string) {
    if (!token) return;
    try {
      setMarkingPayoutId(payoutId);
      await apiFetch(`/api/admin/payouts/${payoutId}/mark-paid`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ paidReference: reference || "" }),
      });
      setActionMessage("✓ Payout marked as paid successfully.");
      setMarkPaidModalPayout(null);
      setMarkPaidReference("");
      await loadPayouts();
      setTimeout(() => setActionMessage(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark payout as paid");
    } finally {
      setMarkingPayoutId(null);
    }
  }

  async function handleDeletePayout(payoutId: string) {
    if (!token) return;
    if (!window.confirm("Are you sure you want to delete this pending payout request?")) return;
    try {
      setDeletingPayoutId(payoutId);
      await apiFetch(`/api/admin/payouts/${payoutId}`, {
        method: "DELETE",
        token,
      });
      setActionMessage("✓ Payout request deleted.");
      await loadPayouts();
      setTimeout(() => setActionMessage(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete payout");
    } finally {
      setDeletingPayoutId(null);
    }
  }

  async function loadPayments(targetPage = page) {
    if (!token) return;
    try {
      setLoadingPayments(true);
      setError("");
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("limit", "15");
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (productFilter !== "all") params.set("product", productFilter);
      if (currencyFilter !== "all") params.set("currency", currencyFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await apiFetch<{
        payments: AdminPaymentItem[];
        pagination: { page: number; pages: number; total: number };
      }>(`/api/admin/payments?${params.toString()}`, { token });

      setPayments(res.payments);
      setPage(res.pagination.page);
      setTotalPages(res.pagination.pages);
      setTotalPaymentsCount(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoadingPayments(false);
    }
  }

  useEffect(() => {
    void loadAnalytics();
    void loadPayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    void loadPayments(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter, productFilter, currencyFilter, searchQuery]);

  async function handleMarkPaid(id: string) {
    if (!token) return;
    if (!window.confirm("Confirm marking this payment as PAID and granting user access?")) {
      return;
    }
    try {
      setMarkingId(id);
      setActionMessage("");
      await apiFetch(`/api/admin/payments/${id}/mark-paid`, {
        method: "PATCH",
        token,
      });
      setActionMessage("✓ Payment marked as paid successfully.");
      await Promise.all([loadAnalytics(), loadPayments(page)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payment");
    } finally {
      setMarkingId(null);
    }
  }

  async function handleApprove(id: string) {
    if (!token) return;
    if (
      !window.confirm(
        "Approve this payment? User access will be activated and their odds SMS will be dispatched."
      )
    ) {
      return;
    }
    try {
      setMarkingId(id);
      setActionMessage("");
      setError("");
      const res = await apiFetch<{ message: string }>(`/api/admin/payments/${id}/approve`, {
        method: "PATCH",
        token,
      });
      setActionMessage(res.message || "✓ Payment approved and odds SMS sent!");
      if (previewProof?.id === id) {
        setPreviewProof(null);
      }
      await Promise.all([loadAnalytics(), loadPayments(page)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve payment");
    } finally {
      setMarkingId(null);
    }
  }

  async function handleReject(id: string) {
    if (!token) return;
    if (!window.confirm("Are you sure you want to REJECT this payment proof?")) {
      return;
    }
    try {
      setMarkingId(id);
      setActionMessage("");
      setError("");
      const res = await apiFetch<{ message: string }>(`/api/admin/payments/${id}/reject`, {
        method: "PATCH",
        token,
      });
      setActionMessage(res.message || "Payment marked as rejected.");
      if (previewProof?.id === id) {
        setPreviewProof(null);
      }
      await Promise.all([loadAnalytics(), loadPayments(page)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject payment");
    } finally {
      setMarkingId(null);
    }
  }

  async function handleDeletePayment(id: string) {
    if (!token) return;
    if (
      !window.confirm(
        "Are you sure you want to delete this transaction? This action cannot be undone."
      )
    ) {
      return;
    }
    try {
      setMarkingId(id);
      setActionMessage("");
      setError("");
      const cleanId = encodeURIComponent(String(id).trim());
      let res: { message: string };
      try {
        res = await apiFetch<{ message: string }>(`/api/admin/payments/${cleanId}`, {
          method: "DELETE",
          token,
        });
      } catch (adminErr) {
        if (adminErr instanceof ApiError && adminErr.status === 404) {
          res = await apiFetch<{ message: string }>(`/api/payments/${cleanId}`, {
            method: "DELETE",
            token,
          });
        } else {
          throw adminErr;
        }
      }
      setActionMessage(res.message || "✓ Transaction deleted successfully.");
      if (previewProof?.id === id) {
        setPreviewProof(null);
      }
      await Promise.all([loadAnalytics(), loadPayments(page)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete transaction");
    } finally {
      setMarkingId(null);
    }
  }

  async function handleClearPayments() {
    if (!token) return;
    if (
      !window.confirm(
        "Are you sure you want to clear all mock/test payments? This action cannot be undone."
      )
    ) {
      return;
    }
    try {
      setActionMessage("");
      setError("");
      let res: { message: string };
      try {
        res = await apiFetch<{ message: string }>("/api/admin/payments", {
          method: "DELETE",
          token,
        });
      } catch (adminErr) {
        if (adminErr instanceof ApiError && adminErr.status === 404) {
          res = await apiFetch<{ message: string }>("/api/payments", {
            method: "DELETE",
            token,
          });
        } else {
          throw adminErr;
        }
      }
      setActionMessage(res.message || "All payments have been cleared.");
      await Promise.all([loadAnalytics(), loadPayments(1)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear payments");
    }
  }

  async function handleSeedDemoPayments() {
    if (!token) return;
    try {
      setActionMessage("");
      setError("");
      let res: { message: string };
      try {
        res = await apiFetch<{ message: string }>("/api/admin/payments/seed-test", {
          method: "POST",
          token,
        });
      } catch (adminErr) {
        if (adminErr instanceof ApiError && adminErr.status === 404) {
          res = await apiFetch<{ message: string }>("/api/payments/seed-test", {
            method: "POST",
            token,
          });
        } else {
          throw adminErr;
        }
      }
      setActionMessage(res.message || "✓ 5 demo transactions generated.");
      await Promise.all([loadAnalytics(), loadPayments(1), loadPayouts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate demo transactions");
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchDraft);
  }

  const activeBucket: RevenueBucket = useMemo(() => {
    if (!analytics) {
      return {
        grossGhs: 0,
        grossNgn: 0,
        combinedGhs: 0,
        hisGhs: 0,
        myGhs: 0,
        hisNgn: 0,
        myNgn: 0,
        combinedHisGhs: 0,
        combinedMyGhs: 0,
        count: 0,
      };
    }
    return analytics[period] || analytics.day;
  }, [analytics, period]);

  const periodLabel = {
    day: "Today (24h)",
    week: "This Week",
    month: "This Month",
    allTime: "All Time",
  }[period];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-xs">
              <IconCreditCard className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight sm:text-xl">
              Payment & Revenue Analytics
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Real-time transaction tracking with automatic <strong className="text-slate-700">60% / 40%</strong> partner profit split.
          </p>
        </div>

        {/* Split Badges & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 border border-amber-200/80 shadow-2xs">
            <IconCrown className="w-3.5 h-3.5 text-amber-600" />
            <span>Forson: <strong className="font-bold text-amber-950">60%</strong></span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 border border-indigo-200/80 shadow-2xs">
            <IconBriefcase className="w-3.5 h-3.5 text-indigo-600" />
            <span>Asamoah: <strong className="font-bold text-indigo-950">40%</strong></span>
          </span>
          <button
            type="button"
            onClick={() => {
              void loadAnalytics();
              void loadPayments(page);
            }}
            disabled={loadingAnalytics || loadingPayments}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs disabled:opacity-50"
            title="Refresh analytics data"
          >
            <IconRefresh
              className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-500 ${
                loadingAnalytics || loadingPayments ? "animate-spin" : "group-hover:rotate-180"
              }`}
            />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleClearPayments}
            disabled={loadingAnalytics || loadingPayments}
            className="group/clear inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/60 transition shadow-xs disabled:opacity-40"
            title="Clear all test payment transactions"
          >
            <DustbinIcon className="h-3.5 w-3.5 text-slate-400 group-hover/clear:text-rose-500 transition-colors" />
            <span>Clear Test Data</span>
          </button>
          <button
            type="button"
            onClick={handleSeedDemoPayments}
            disabled={loadingAnalytics || loadingPayments}
            className="group/seed inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-600 hover:text-white transition shadow-xs disabled:opacity-40"
            title="Generate demo transactions to test revenue analytics, payouts, and deletion"
          >
            <span>+ Seed Demo Data</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-xs font-bold hover:underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm text-emerald-800 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button type="button" onClick={() => setActionMessage("")} className="text-xs font-bold hover:underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Period Selection Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/60">
          {(["day", "week", "month", "allTime"] as const).map((p) => {
            const labels = {
              day: "Today (24h)",
              week: "This Week",
              month: "This Month",
              allTime: "All Time",
            };
            const active = period === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-lg py-1.5 px-3 sm:px-4 text-xs font-semibold transition ${
                  active
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {labels[p]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">
          Showing profit split for: <strong className="text-slate-800">{periodLabel}</strong>
        </p>
      </div>

      {/* 3 Main Highlight KPI Cards (Gross, Forson 60%, Asamoah 40%) */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
        {/* Card 1: Total Gross Revenue */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Gross Revenue · {periodLabel}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200/60">
              100% Total
            </span>
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
                ₵{activeBucket.grossGhs.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-bold text-slate-500">GHS</span>
            </div>
            <div className="flex items-baseline gap-1.5 text-xs text-slate-500 font-mono">
              <span>₦{activeBucket.grossNgn.toLocaleString("en-US", { minimumFractionDigits: 0 })}</span>
              <span className="text-[10px] text-slate-400">NGN</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>Successful Orders:</span>
            <strong className="text-slate-800 font-mono font-bold">{activeBucket.count} paid</strong>
          </div>
        </div>

        {/* Card 2: Forson Share (60%) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-amber-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 border border-amber-200/80 shadow-2xs">
                  <IconCrown className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Forson Payout
                </span>
              </div>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200/60">
                60% Split
              </span>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
                  ₵{activeBucket.hisGhs.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-bold text-slate-500">GHS</span>
              </div>
              <div className="flex items-baseline gap-1.5 text-xs text-slate-500 font-mono">
                <span>₦{activeBucket.hisNgn.toLocaleString("en-US", { minimumFractionDigits: 0 })}</span>
                <span className="text-[10px] text-slate-400">NGN</span>
              </div>
            </div>

            {payoutSummary?.forson && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-amber-50/50 p-2.5 border border-amber-200/50 text-[11px]">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Total Paid</span>
                  <span className="font-mono font-bold text-emerald-700">₵{payoutSummary.forson.paidGhs.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Available</span>
                  <span className="font-mono font-bold text-amber-800">₵{payoutSummary.forson.availableGhs.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500 font-medium">60% of Gross</span>
            <button
              type="button"
              onClick={() => openPayoutModalFor("Forson")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 text-xs font-bold transition shadow-xs active:scale-95"
            >
              <IconSend className="w-3 h-3" />
              <span>Request Payout</span>
            </button>
          </div>
        </div>

        {/* Card 3: Asamoah Share (40%) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-indigo-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-200/80 shadow-2xs">
                  <IconBriefcase className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Asamoah Payout
                </span>
              </div>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-800 border border-indigo-200/60">
                40% Split
              </span>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
                  ₵{activeBucket.myGhs.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-bold text-slate-500">GHS</span>
              </div>
              <div className="flex items-baseline gap-1.5 text-xs text-slate-500 font-mono">
                <span>₦{activeBucket.myNgn.toLocaleString("en-US", { minimumFractionDigits: 0 })}</span>
                <span className="text-[10px] text-slate-400">NGN</span>
              </div>
            </div>

            {payoutSummary?.asamoah && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-indigo-50/50 p-2.5 border border-indigo-200/50 text-[11px]">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Total Paid</span>
                  <span className="font-mono font-bold text-emerald-700">₵{payoutSummary.asamoah.paidGhs.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Available</span>
                  <span className="font-mono font-bold text-indigo-800">₵{payoutSummary.asamoah.availableGhs.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500 font-medium">40% of Gross</span>
            <button
              type="button"
              onClick={() => openPayoutModalFor("Asamoah")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 text-xs font-bold transition shadow-xs active:scale-95"
            >
              <IconSend className="w-3 h-3" />
              <span>Request Payout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Visual Split Gauge & Payment Health */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        {/* Visual Split Bar */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs lg:col-span-2">
          {/* Subtle background ambient blur */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/5 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-amber-500/5 blur-3xl" />

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-xs">
                <IconPieChart className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    Profit Split Allocation
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase tracking-wide border border-slate-200/60">
                    {periodLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Automated contractual 60% / 40% net revenue distribution
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-slate-50 px-3 py-1.5 border border-slate-200/70 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Combined:
              </span>
              <span className="font-mono text-sm font-extrabold text-slate-900">
                ~₵{activeBucket.combinedGhs.toFixed(2)}
              </span>
              {activeBucket.grossNgn > 0 && (
                <span className="text-[10px] font-mono text-slate-400">
                  (+₦{activeBucket.grossNgn.toLocaleString()})
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {/* Split Bar with pill tags */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs px-0.5 font-semibold">
                <div className="flex items-center gap-1.5 text-amber-700">
                  <IconCrown className="w-3.5 h-3.5 text-amber-600" />
                  <span>Forson Primary</span>
                  <span className="rounded-md bg-amber-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-amber-900">
                    60%
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-indigo-700">
                  <span className="rounded-md bg-indigo-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-indigo-900">
                    40%
                  </span>
                  <span>Asamoah Operations</span>
                  <IconBriefcase className="w-3.5 h-3.5 text-indigo-600" />
                </div>
              </div>

              {/* Segmented Gradient Bar */}
              <div className="relative flex h-9 w-full overflow-hidden rounded-2xl bg-slate-100 p-1 border border-slate-200/80 shadow-inner">
                <div
                  style={{ width: "60%" }}
                  className="relative flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 text-white text-xs font-bold shadow-xs transition-all duration-500"
                >
                  <IconCrown className="w-3.5 h-3.5 text-amber-100 drop-shadow-xs" />
                  <span className="tracking-wide text-[11px] sm:text-xs">60% · Forson</span>
                </div>
                <div
                  style={{ width: "40%" }}
                  className="relative flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-blue-600 text-white text-xs font-bold shadow-xs transition-all duration-500"
                >
                  <IconBriefcase className="w-3.5 h-3.5 text-indigo-100 drop-shadow-xs" />
                  <span className="tracking-wide text-[11px] sm:text-xs">40% · Asamoah</span>
                </div>
              </div>
            </div>

            {/* Split Details Below Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Forson Card */}
              <div className="relative overflow-hidden rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/60 via-white to-amber-50/20 p-4 shadow-2xs transition hover:border-amber-300">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 border border-amber-300/80 shadow-2xs">
                      <IconCrown className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Forson Allocation</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                        60% Majority Share
                      </p>
                    </div>
                  </div>
                  <span className="rounded-lg bg-amber-100 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-900 border border-amber-200/70">
                    60%
                  </span>
                </div>

                <div className="mt-3.5 space-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-extrabold text-slate-900 tracking-tight">
                      ₵{activeBucket.hisGhs.toFixed(2)}
                    </span>
                    <span className="text-xs font-bold text-slate-500">GHS</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500">
                    <span className="rounded-md bg-white/90 px-2 py-0.5 border border-amber-200/60 shadow-2xs font-semibold text-slate-700">
                      + ₦{activeBucket.hisNgn.toLocaleString()} NGN
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-amber-100/80 pt-2.5 text-[11px] text-slate-500">
                  <span>Contractual Ratio</span>
                  <span className="font-semibold text-amber-800">Primary Partner</span>
                </div>
              </div>

              {/* Asamoah Card */}
              <div className="relative overflow-hidden rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/60 via-white to-blue-50/20 p-4 shadow-2xs transition hover:border-indigo-300">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 border border-indigo-300/80 shadow-2xs">
                      <IconBriefcase className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Asamoah Allocation</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
                        40% Operations Share
                      </p>
                    </div>
                  </div>
                  <span className="rounded-lg bg-indigo-100 px-2.5 py-0.5 text-xs font-mono font-bold text-indigo-900 border border-indigo-200/70">
                    40%
                  </span>
                </div>

                <div className="mt-3.5 space-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-extrabold text-slate-900 tracking-tight">
                      ₵{activeBucket.myGhs.toFixed(2)}
                    </span>
                    <span className="text-xs font-bold text-slate-500">GHS</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500">
                    <span className="rounded-md bg-white/90 px-2 py-0.5 border border-indigo-200/60 shadow-2xs font-semibold text-slate-700">
                      + ₦{activeBucket.myNgn.toLocaleString()} NGN
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-indigo-100/80 pt-2.5 text-[11px] text-slate-500">
                  <span>Contractual Ratio</span>
                  <span className="font-semibold text-indigo-800">Tech & Infra</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Health Summary */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 shadow-2xs">
                <IconActivity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Payment Health</h3>
                <p className="text-[11px] text-slate-400">Order conversion & statuses</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 flex items-center gap-2 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" /> Paid (Completed)
                </span>
                <strong className="font-mono text-slate-900 font-bold text-sm">
                  {analytics?.statusCounts.paid ?? 0}
                </strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 flex items-center gap-2 font-medium">
                  <span className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-100" /> Pending (Checkout)
                </span>
                <strong className="font-mono text-slate-900 font-bold text-sm">
                  {analytics?.statusCounts.pending ?? 0}
                </strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 flex items-center gap-2 font-medium">
                  <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-rose-100" /> Failed
                </span>
                <strong className="font-mono text-slate-900 font-bold text-sm">
                  {analytics?.statusCounts.failed ?? 0}
                </strong>
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Checkout Success Rate:</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold font-mono text-emerald-800 border border-emerald-200 text-xs">
                {analytics?.statusCounts.successRate ?? 0}%
              </span>
            </div>
            {/* Visual Conversion Progress Bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/60">
              <div
                style={{ width: `${Math.min(100, Math.max(0, analytics?.statusCounts.successRate ?? 0))}%` }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Admin Split Payouts & Disbursements Section */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-indigo-600 text-white shadow-xs">
              <IconReceipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Admin Split Payouts & Disbursements
                </h3>
                <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  {payouts.length} total
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Request and track profit distributions via Mobile Money and Bank Transfer for Forson (60%) and Asamoah (40%).
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => loadPayouts()}
              disabled={loadingPayouts}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
              title="Refresh payouts"
            >
              <IconRefresh className={`w-3.5 h-3.5 ${loadingPayouts ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => openPayoutModalFor("Forson")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 text-xs font-bold transition shadow-xs active:scale-95"
            >
              <IconSend className="w-3.5 h-3.5 text-amber-400" />
              <span>+ Request Payout</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Bar for Payouts */}
        {payoutSummary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50/40 border-b border-slate-100 text-xs">
            <div className="rounded-xl bg-white p-3 border border-amber-200/70 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] text-amber-800 font-bold">
                <span className="flex items-center gap-1">
                  <IconCrown className="w-3.5 h-3.5 text-amber-600" /> Forson Available
                </span>
                <span className="text-[10px] bg-amber-50 px-1.5 py-0.2 rounded font-mono">60%</span>
              </div>
              <p className="mt-1 font-mono text-lg font-extrabold text-slate-900">
                ₵{payoutSummary.forson.availableGhs.toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Paid: ₵{payoutSummary.forson.paidGhs.toFixed(2)} · Pending: ₵{payoutSummary.forson.pendingGhs.toFixed(2)}
              </p>
            </div>

            <div className="rounded-xl bg-white p-3 border border-indigo-200/70 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] text-indigo-800 font-bold">
                <span className="flex items-center gap-1">
                  <IconBriefcase className="w-3.5 h-3.5 text-indigo-600" /> Asamoah Available
                </span>
                <span className="text-[10px] bg-indigo-50 px-1.5 py-0.2 rounded font-mono">40%</span>
              </div>
              <p className="mt-1 font-mono text-lg font-extrabold text-slate-900">
                ₵{payoutSummary.asamoah.availableGhs.toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Paid: ₵{payoutSummary.asamoah.paidGhs.toFixed(2)} · Pending: ₵{payoutSummary.asamoah.pendingGhs.toFixed(2)}
              </p>
            </div>

            <div className="rounded-xl bg-white p-3 border border-emerald-200/70 shadow-2xs">
              <div className="text-[11px] text-emerald-800 font-bold">
                Total Disbursed (Paid)
              </div>
              <p className="mt-1 font-mono text-lg font-extrabold text-emerald-700">
                ₵{(payoutSummary.forson.paidGhs + payoutSummary.asamoah.paidGhs).toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Settled across bank & MoMo
              </p>
            </div>

            <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs">
              <div className="text-[11px] text-slate-600 font-bold">
                Awaiting Payment
              </div>
              <p className="mt-1 font-mono text-lg font-extrabold text-amber-600">
                ₵{(payoutSummary.forson.pendingGhs + payoutSummary.asamoah.pendingGhs).toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {payouts.filter((p) => p.status === "pending").length} requests pending review
              </p>
            </div>
          </div>
        )}

        {/* Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-white">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all" as const, label: "All Payouts", count: payouts.length, badgeColor: "" },
                {
                  id: "pending" as const,
                  label: "Pending",
                  count: payouts.filter((p) => p.status === "pending").length,
                  badgeColor: "bg-amber-100 text-amber-800",
                },
                {
                  id: "paid" as const,
                  label: "Paid",
                  count: payouts.filter((p) => p.status === "paid").length,
                  badgeColor: "bg-emerald-100 text-emerald-800",
                },
                {
                  id: "Forson" as const,
                  label: "Forson (60%)",
                  count: payouts.filter((p) => p.recipient === "Forson").length,
                  badgeColor: "",
                },
                {
                  id: "Asamoah" as const,
                  label: "Asamoah (40%)",
                  count: payouts.filter((p) => p.recipient === "Asamoah").length,
                  badgeColor: "",
                },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPayoutFilter(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  payoutFilter === tab.id
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                    payoutFilter === tab.id
                      ? "bg-slate-800 text-slate-200"
                      : tab.badgeColor || "bg-slate-200 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={payoutSearch}
              onChange={(e) => setPayoutSearch(e.target.value)}
              placeholder="Search recipient, bank, phone…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none transition"
            />
            <div className="absolute left-2.5 top-2 text-slate-400">
              <IconSearch className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Payouts Table / List */}
        {filteredPayouts.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <IconReceipt className="w-6 h-6" />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-800">No payout requests found</p>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
              {payoutFilter !== "all" || payoutSearch
                ? "No payouts match your current filter or search criteria."
                : "No payouts have been initiated yet. Click '+ Request Payout' above to request a payout via Mobile Money or Bank."}
            </p>
            <button
              type="button"
              onClick={() => openPayoutModalFor("Forson")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition shadow-xs"
            >
              <IconSend className="w-3.5 h-3.5 text-amber-400" />
              <span>Request First Payout</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 pl-4 pr-3">Admin</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Method & Destination</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Requested At</th>
                  <th className="py-3 pr-4 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayouts.map((po) => {
                  const isForson = po.recipient === "Forson";
                  const isMoMo = po.method === "mobile_money";
                  const isPending = po.status === "pending";
                  const isPaid = po.status === "paid";

                  return (
                    <tr key={po.id} className="transition hover:bg-slate-50/60">
                      {/* Admin Recipient */}
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`grid h-8 w-8 place-items-center rounded-xl font-bold text-xs ${
                              isForson
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                            }`}
                          >
                            {isForson ? <IconCrown className="w-4 h-4 text-amber-700" /> : <IconBriefcase className="w-4 h-4 text-indigo-700" />}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 flex items-center gap-1.5">
                              {po.recipient}
                              <span
                                className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                                  isForson
                                    ? "bg-amber-50 text-amber-800 border border-amber-200/60"
                                    : "bg-indigo-50 text-indigo-800 border border-indigo-200/60"
                                }`}
                              >
                                {po.splitPercentage}% Split
                              </span>
                            </span>
                            <span className="text-[11px] text-slate-400 block font-normal">
                              Req by: {po.requestedBy || po.recipient}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-3 font-mono">
                        <span className="font-bold text-slate-900 text-sm">
                          {po.currency === "NGN" ? "₦" : "₵"}
                          {po.amount.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 block font-normal uppercase">
                          {po.currency}
                        </span>
                      </td>

                      {/* Method & Destination Details */}
                      <td className="py-3 px-3">
                        {isMoMo ? (
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200/70">
                              <IconSmartphone className="w-3 h-3 text-emerald-600" />
                              <span>{po.network || "Mobile Money"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-900 pt-0.5">
                              <span>{po.phone}</span>
                              {po.phone && (
                                <a
                                  href={`https://wa.me/${po.phone.replace(/[^0-9]/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Chat on WhatsApp"
                                  className="text-emerald-600 hover:text-emerald-700 p-0.5"
                                >
                                  <IconWhatsApp className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Account: <strong className="text-slate-700 font-semibold">{po.accountName}</strong>
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800 border border-blue-200/70">
                              <IconBuilding className="w-3 h-3 text-blue-600" />
                              <span>{po.bankName || "Bank Transfer"}</span>
                            </div>
                            <p className="font-mono text-xs font-semibold text-slate-900 pt-0.5">
                              Acc: {po.accountNumber}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Holder: <strong className="text-slate-700 font-semibold">{po.accountName}</strong>
                              {po.branch && <span className="text-slate-400"> ({po.branch})</span>}
                            </p>
                          </div>
                        )}
                        {po.notes && (
                          <p className="text-[10px] text-slate-400 italic mt-0.5">
                            Note: {po.notes}
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span>Pending Payout</span>
                          </span>
                        ) : isPaid ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                              <IconCheck className="w-3 h-3 text-emerald-600" />
                              <span>Paid & Settled</span>
                            </span>
                            {po.paidAt && (
                              <p className="text-[10px] text-slate-400 font-mono">
                                {formatDateTime(po.paidAt)}
                              </p>
                            )}
                            {po.paidReference && (
                              <p className="text-[10px] font-mono text-slate-500">
                                Ref: {po.paidReference}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                            <IconX className="w-3 h-3" />
                            <span>Rejected</span>
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {formatDateTime(po.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 pr-4 pl-3 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setMarkPaidModalPayout(po);
                                setMarkPaidReference("");
                              }}
                              disabled={markingPayoutId === po.id}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold transition shadow-xs active:scale-95 disabled:opacity-50"
                              title="Mark this payout as paid"
                            >
                              <IconCheck className="w-3.5 h-3.5" />
                              <span>Mark as Paid</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePayout(po.id)}
                              disabled={deletingPayoutId === po.id}
                              className="group/del relative inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition shadow-2xs active:scale-95 disabled:opacity-50"
                              title="Delete request"
                            >
                              <DustbinIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                              Settled
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeletePayout(po.id)}
                              disabled={deletingPayoutId === po.id}
                              className="group/del relative inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition active:scale-95 disabled:opacity-50"
                              title="Delete record"
                            >
                              <DustbinIcon className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product / Board Breakdown with Visual Graphs */}
      {analytics?.byProduct && analytics.byProduct.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
          {/* Card Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200/60">
                <IconBarChart className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Revenue Breakdown by Product / Odds Board
                </h3>
              </div>
            </div>

            {/* View Switcher: Graphs vs Table */}
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold border border-slate-200/60">
              <button
                type="button"
                onClick={() => setProductViewMode("graphs")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition ${
                  productViewMode === "graphs"
                    ? "bg-white text-indigo-600 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Graphs View"
              >
                <IconPieChart className="w-3.5 h-3.5" />
                <span>Graphs</span>
              </button>
              <button
                type="button"
                onClick={() => setProductViewMode("table")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition ${
                  productViewMode === "table"
                    ? "bg-white text-indigo-600 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Data Table View"
              >
                <IconTable className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>
          </div>

          {productViewMode === "graphs" ? (
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                {/* Left: Compact Donut (4 cols) */}
                <div className="md:col-span-4 flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50/60 border border-slate-100">
                  <div className="relative flex items-center justify-center">
                    <svg
                      width="130"
                      height="130"
                      viewBox="0 0 130 130"
                      className="transform -rotate-90"
                    >
                      <circle
                        cx="65"
                        cy="65"
                        r="52"
                        fill="none"
                        stroke="#F1F5F9"
                        strokeWidth="13"
                      />
                      {donutSlices.map((slice) => {
                        const isHovered = hoveredProdId === slice.id;
                        return (
                          <circle
                            key={slice.id}
                            cx="65"
                            cy="65"
                            r="52"
                            fill="none"
                            stroke={slice.color}
                            strokeWidth={isHovered ? 16 : 13}
                            strokeDasharray={slice.strokeDasharray}
                            strokeDashoffset={slice.strokeDashoffset}
                            strokeLinecap="round"
                            className="cursor-pointer transition-all duration-200"
                            onMouseEnter={() => setHoveredProdId(slice.id)}
                            onMouseLeave={() => setHoveredProdId(null)}
                          />
                        );
                      })}
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
                      {hoveredProduct ? (
                        <>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate max-w-[85px]">
                            {hoveredProduct.label}
                          </span>
                          <span className="font-mono text-sm font-extrabold text-slate-900">
                            ₵{hoveredProduct.grossGhs.toFixed(0)}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">
                            {productTotals.totalGhs > 0
                              ? `${((hoveredProduct.grossGhs / productTotals.totalGhs) * 100).toFixed(0)}%`
                              : "0%"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Total Gross
                          </span>
                          <span className="font-mono text-sm font-extrabold text-slate-900">
                            ₵{productTotals.totalGhs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">
                            {productTotals.totalOrders} orders
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Compact Legend */}
                  <div className="mt-2.5 flex flex-wrap justify-center gap-x-2.5 gap-y-1 text-[10px]">
                    {analytics.byProduct
                      .filter((p) => p.grossGhs > 0 || p.count > 0)
                      .map((p, idx) => {
                        const theme = getProductTheme(p.id, idx);
                        const pct =
                          productTotals.totalGhs > 0
                            ? ((p.grossGhs / productTotals.totalGhs) * 100).toFixed(0)
                            : "0";
                        return (
                          <div
                            key={p.id}
                            onMouseEnter={() => setHoveredProdId(p.id)}
                            onMouseLeave={() => setHoveredProdId(null)}
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <span className={`h-2 w-2 rounded-full ${theme.bgDot}`} />
                            <span className="text-slate-600 font-medium">{p.label}</span>
                            <span className="font-mono text-slate-400 font-bold">{pct}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Right: Slim, Streamlined Bars (8 cols) */}
                <div className="md:col-span-8 space-y-1.5">
                  {analytics.byProduct.map((prod, idx) => {
                    const theme = getProductTheme(prod.id, idx);
                    const isHovered = hoveredProdId === prod.id;
                    const pctShare =
                      productTotals.totalGhs > 0
                        ? ((prod.grossGhs / productTotals.totalGhs) * 100).toFixed(1)
                        : "0.0";

                    const barFillRatio =
                      productTotals.maxGhs > 0
                        ? (prod.grossGhs / productTotals.maxGhs) * 100
                        : 0;

                    return (
                      <div
                        key={prod.id}
                        onMouseEnter={() => setHoveredProdId(prod.id)}
                        onMouseLeave={() => setHoveredProdId(null)}
                        className={`rounded-lg px-2 py-1 transition ${
                          isHovered ? "bg-slate-50" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${theme.bgDot}`} />
                            <span className="font-semibold text-slate-900 text-xs">
                              {prod.label}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({prod.count} {prod.count === 1 ? "order" : "orders"})
                            </span>
                          </div>

                          <div className="flex items-center gap-2 font-mono">
                            <span className="font-bold text-slate-900 text-xs">
                              ₵{prod.grossGhs.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 w-10 text-right">
                              {pctShare}%
                            </span>
                          </div>
                        </div>

                        {/* Split Bar: 60% Forson (amber) / 40% Asamoah (indigo) */}
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                          {prod.grossGhs > 0 ? (
                            <>
                              <div
                                style={{ width: `${(barFillRatio * 0.6).toFixed(1)}%` }}
                                className="h-full bg-amber-500 transition-all duration-300"
                                title={`Forson (60%): ₵${prod.hisGhs.toFixed(2)}`}
                              />
                              <div
                                style={{ width: `${(barFillRatio * 0.4).toFixed(1)}%` }}
                                className="h-full bg-indigo-500 transition-all duration-300"
                                title={`Asamoah (40%): ₵${prod.myGhs.toFixed(2)}`}
                              />
                            </>
                          ) : (
                            <div className="h-full w-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Clean Split Legend Bar */}
                  <div className="flex items-center justify-between pt-2 px-2 border-t border-slate-100 text-[11px] text-slate-500">
                    <span className="text-[10px] text-slate-400">
                      Total: <strong className="text-slate-800 font-mono">₵{productTotals.totalGhs.toFixed(2)}</strong>
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-amber-800 font-medium text-[10px]">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Forson (60%): ₵{(productTotals.totalGhs * 0.6).toFixed(2)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-indigo-800 font-medium text-[10px]">
                        <span className="h-2 w-2 rounded-full bg-indigo-500" />
                        Asamoah (40%): ₵{(productTotals.totalGhs * 0.4).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Table Mode */
            <>
              {/* Mobile View: Product Cards */}
              <div className="grid grid-cols-1 gap-2.5 p-3 md:hidden">
                {analytics.byProduct.map((prod, idx) => {
                  const theme = getProductTheme(prod.id, idx);
                  return (
                    <div key={prod.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${theme.bgDot}`} />
                          <span className="font-bold text-slate-900 text-xs">{prod.label}</span>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600 border border-slate-200/60">
                          {prod.count} orders
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between border-t border-slate-100 pt-2 text-xs">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Gross:</span>
                        <span className="font-mono font-bold text-slate-900">
                          ₵{prod.grossGhs.toFixed(2)}{" "}
                          <span className="text-[10px] text-slate-400 font-normal">
                            (₦{prod.grossNgn.toLocaleString()})
                          </span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                        <div className="rounded-lg bg-amber-50/60 border border-amber-200/60 p-2">
                          <div className="flex items-center gap-1 text-amber-800">
                            <IconCrown className="w-3 h-3 text-amber-600" />
                            <p className="text-[10px] font-bold">Forson (60%)</p>
                          </div>
                          <p className="font-mono font-bold text-slate-900 mt-0.5">
                            ₵{prod.hisGhs.toFixed(2)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-indigo-50/60 border border-indigo-200/60 p-2">
                          <div className="flex items-center gap-1 text-indigo-800">
                            <IconBriefcase className="w-3 h-3 text-indigo-600" />
                            <p className="text-[10px] font-bold">Asamoah (40%)</p>
                          </div>
                          <p className="font-mono font-bold text-slate-900 mt-0.5">
                            ₵{prod.myGhs.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop View: Product Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-3 pl-4 pr-3">Product / Board</th>
                      <th className="py-3 px-3 text-center">Orders</th>
                      <th className="py-3 px-3">Total Gross (GHS)</th>
                      <th className="py-3 px-3">Total Gross (NGN)</th>
                      <th className="py-3 px-3 text-amber-800">
                        <span className="inline-flex items-center gap-1">
                          <IconCrown className="w-3.5 h-3.5 text-amber-600" /> Forson (60%)
                        </span>
                      </th>
                      <th className="py-3 pr-4 pl-3 text-indigo-800">
                        <span className="inline-flex items-center gap-1">
                          <IconBriefcase className="w-3.5 h-3.5 text-indigo-600" /> Asamoah (40%)
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analytics.byProduct.map((prod, idx) => {
                      const theme = getProductTheme(prod.id, idx);
                      return (
                        <tr key={prod.id} className="hover:bg-slate-50/60 transition">
                          <td className="py-3 pl-4 pr-3 font-semibold text-slate-900 flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${theme.bgDot}`} />
                            <span>{prod.label}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-center text-slate-700">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold">
                              {prod.count}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">
                            ₵{prod.grossGhs.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-500">
                            ₦{prod.grossNgn.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">
                            ₵{prod.hisGhs.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 pr-4 pl-3 font-mono font-bold text-slate-900">
                            ₵{prod.myGhs.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Pending Opay Approvals Notice Banner */}
      {Boolean(analytics?.statusCounts?.proofSubmitted && analytics.statusCounts.proofSubmitted > 0) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
              <IconBell className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950">
                {analytics!.statusCounts.proofSubmitted} Nigerian Opay Transfer{analytics!.statusCounts.proofSubmitted === 1 ? "" : "s"} Awaiting Approval!
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Customers sent transfers to 7082511762 (Peculiar Nmerisinachi Calistus) and submitted proof photos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter("proof_submitted")}
            className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-xs shrink-0 text-center"
          >
            Review Transfers ({analytics!.statusCounts.proofSubmitted}) →
          </button>
        </div>
      )}

      {/* Live Payments Ledger Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                All Transactions ({totalPaymentsCount})
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Audit ledger with customer info, gateway references, and split amounts.
              </p>
            </div>
            {/* Search form */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Search phone, name, ref..."
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="w-full sm:w-60 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400 shadow-xs"
              />
              <button
                type="submit"
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs shrink-0"
              >
                Search
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft("");
                    setSearchQuery("");
                  }}
                  className="text-xs text-rose-600 font-semibold hover:underline shrink-0"
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {/* Filter Pills */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-200/60">
            <span className="text-[11px] font-semibold text-slate-500">Status:</span>
            {[
              { id: "all", label: "All", icon: null },
              { id: "paid", label: "Paid", icon: null },
              { id: "proof_submitted", label: "Awaiting Approval", icon: <IconCamera className="w-3 h-3 text-amber-700" /> },
              { id: "pending", label: "Pending", icon: null },
              { id: "failed", label: "Failed", icon: null },
            ].map(({ id: st, label, icon }) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize transition ${
                  statusFilter === st
                    ? "bg-slate-900 text-white shadow-xs"
                    : st === "proof_submitted"
                    ? "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 font-bold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-slate-200/60"
                }`}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}

            <span className="ml-2 text-[11px] font-semibold text-slate-500">Curr:</span>
            {(["all", "GHS", "NGN"] as const).map((curr) => (
              <button
                key={curr}
                type="button"
                onClick={() => setCurrencyFilter(curr)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${
                  currencyFilter === curr
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-slate-200/60"
                }`}
              >
                {curr === "all" ? "All" : curr === "GHS" ? "GHS (₵)" : "NGN (₦)"}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile View: Transaction Cards */}
        <div className="grid grid-cols-1 gap-2.5 p-3 md:hidden">
          {loadingPayments ? (
            <p className="py-8 text-center text-xs text-slate-500">Loading transactions…</p>
          ) : payments.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No transactions found.</p>
          ) : (
            payments.map((p) => {
              const isPaid = p.status === "paid";
              const isAwaitingProof = p.status === "proof_submitted";
              const isPending = p.status === "pending" || isAwaitingProof;
              const currencySymbol = p.currency === "NGN" ? "₦" : "₵";
              const customerPhone = p.customer?.phone || p.phone || "";
              const waMessage = `Hello${p.customer?.name ? " " + p.customer.name : ""}! Regarding your ${productLabel(p.product)} order on OddNext:`;
              const waUrl = getWhatsAppUrl(customerPhone, p.currency, waMessage);

              return (
                <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900 text-xs">
                        {p.customer.name || "Buyer"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-slate-500 font-mono">
                          {customerPhone || "No phone"}
                        </span>
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-2xs border border-emerald-200"
                            title={`Chat with ${customerPhone} on WhatsApp`}
                          >
                            <IconWhatsApp className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isPaid
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : isAwaitingProof
                          ? "bg-amber-100 text-amber-800 border border-amber-300"
                          : isPending
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {isAwaitingProof ? (
                        <>
                          <IconCamera className="w-3 h-3 text-amber-700" />
                          <span>Awaiting Approval</span>
                        </>
                      ) : (
                        p.status
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200/60">
                      {productLabel(p.product)}
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {currencySymbol}{p.amount.toLocaleString("en-US", { minimumFractionDigits: p.currency === "NGN" ? 0 : 2 })}
                    </span>
                  </div>

                  {/* 60/40 Split Boxes for this payment */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="rounded-lg bg-amber-50/50 border border-amber-200/50 px-2.5 py-1.5">
                      <div className="flex items-center gap-1 text-amber-800">
                        <IconCrown className="w-3 h-3 text-amber-600" />
                        <p className="text-[10px] font-semibold">Forson (60%)</p>
                      </div>
                      <p className="font-mono font-bold text-slate-900 mt-0.5">
                        {currencySymbol}{p.hisShare.toLocaleString("en-US", { minimumFractionDigits: p.currency === "NGN" ? 0 : 2 })}
                      </p>
                    </div>
                    <div className="rounded-lg bg-indigo-50/50 border border-indigo-200/50 px-2.5 py-1.5">
                      <div className="flex items-center gap-1 text-indigo-800">
                        <IconBriefcase className="w-3 h-3 text-indigo-600" />
                        <p className="text-[10px] font-semibold">Asamoah (40%)</p>
                      </div>
                      <p className="font-mono font-bold text-slate-900 mt-0.5">
                        {currencySymbol}{p.myShare.toLocaleString("en-US", { minimumFractionDigits: p.currency === "NGN" ? 0 : 2 })}
                      </p>
                    </div>
                  </div>

                  {p.proofNote && (
                    <p className="text-[11px] bg-slate-50 p-2 rounded-lg text-slate-600 border border-slate-200/60">
                      <strong>Sender note:</strong> {p.proofNote}
                    </p>
                  )}

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                    <span>
                      {formatDateTime(p.createdAt)} · <strong className="uppercase text-slate-700">{p.provider}</strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {p.proofImage && (
                        <button
                          type="button"
                          onClick={() => setPreviewProof(p)}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-1 font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs"
                        >
                          <IconCamera className="w-3 h-3 text-indigo-600" />
                          <span>View Proof</span>
                        </button>
                      )}
                      {isAwaitingProof ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApprove(p.id)}
                            disabled={markingId === p.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white hover:bg-emerald-700 transition shadow-2xs"
                          >
                            {markingId === p.id ? (
                              "…"
                            ) : (
                              <>
                                <IconCheck className="w-3 h-3" />
                                <span>Approve</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(p.id)}
                            disabled={markingId === p.id}
                            className="group/del inline-flex items-center gap-1.5 rounded-lg border border-rose-200/90 bg-rose-50/70 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 active:scale-95 transition-all shadow-xs disabled:opacity-40"
                            title="Delete transaction"
                          >
                            {markingId === p.id ? (
                              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                            ) : (
                              <DustbinIcon className="h-3.5 w-3.5 text-rose-500 group-hover/del:text-white transition-colors" />
                            )}
                            <span>Delete</span>
                          </button>
                        </>
                      ) : isPending ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(p.id)}
                            disabled={markingId === p.id}
                            className="rounded-lg bg-slate-900 px-2.5 py-1 font-semibold text-white hover:bg-slate-800 transition"
                          >
                            {markingId === p.id ? "…" : "Mark Paid"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(p.id)}
                            disabled={markingId === p.id}
                            className="group/del inline-flex items-center gap-1.5 rounded-lg border border-rose-200/90 bg-rose-50/70 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 active:scale-95 transition-all shadow-xs disabled:opacity-40"
                            title="Delete transaction"
                          >
                            {markingId === p.id ? (
                              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                            ) : (
                              <DustbinIcon className="h-3.5 w-3.5 text-rose-500 group-hover/del:text-white transition-colors" />
                            )}
                            <span>Delete</span>
                          </button>
                        </>
                      ) : p.status === "failed" ? (
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(p.id)}
                          disabled={markingId === p.id}
                          className="group/del inline-flex items-center gap-1.5 rounded-lg border border-rose-200/90 bg-rose-50/70 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 active:scale-95 transition-all shadow-xs disabled:opacity-40"
                          title="Delete transaction"
                        >
                          {markingId === p.id ? (
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                          ) : (
                            <DustbinIcon className="h-3.5 w-3.5 text-rose-500 group-hover/del:text-white transition-colors" />
                          )}
                          <span>Delete</span>
                        </button>
                      ) : isPaid ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-mono">
                            {p.revealCode ? `Code: ${p.revealCode}` : `Ref: ${p.externalRef.slice(0, 8)}…`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(p.id)}
                            disabled={markingId === p.id}
                            className="group/del inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 active:scale-95 transition-all disabled:opacity-40"
                            title="Delete transaction"
                          >
                            {markingId === p.id ? (
                              <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-rose-600 border-t-transparent" />
                            ) : (
                              <DustbinIcon className="h-3 w-3 text-slate-400 group-hover/del:text-rose-500 transition-colors" />
                            )}
                            <span>Delete</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Full Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 pl-4 pr-2">Date / Time</th>
                <th className="py-3 px-2">Customer</th>
                <th className="py-3 px-2">Product</th>
                <th className="py-3 px-2">Gross Amount</th>
                <th className="py-3 px-2 text-amber-800">
                  <span className="inline-flex items-center gap-1">
                    <IconCrown className="w-3.5 h-3.5 text-amber-600" /> Forson (60%)
                  </span>
                </th>
                <th className="py-3 px-2 text-indigo-800">
                  <span className="inline-flex items-center gap-1">
                    <IconBriefcase className="w-3.5 h-3.5 text-indigo-600" /> Asamoah (40%)
                  </span>
                </th>
                <th className="py-3 px-2">Gateway</th>
                <th className="py-3 px-2 text-center">Status</th>
                <th className="py-3 pr-4 pl-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingPayments ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Loading payments ledger…
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No transactions found matching your filters.
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const isPaid = p.status === "paid";
                  const isAwaitingProof = p.status === "proof_submitted";
                  const isPending = p.status === "pending" || isAwaitingProof;
                  const currencySymbol = p.currency === "NGN" ? "₦" : "₵";
                  const customerPhone = p.customer?.phone || p.phone || "";
                  const waMessage = `Hello${p.customer?.name ? " " + p.customer.name : ""}! Regarding your ${productLabel(p.product)} order on OddNext:`;
                  const waUrl = getWhatsAppUrl(customerPhone, p.currency, waMessage);

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 pl-4 pr-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formatDateTime(p.createdAt)}
                      </td>
                      <td className="py-3 px-2">
                        <p className="font-semibold text-slate-900">
                          {p.customer.name || "Buyer"}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-slate-400 font-mono">
                            {customerPhone || "No phone"}
                          </span>
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-2xs border border-emerald-200/80 hover:scale-110"
                              title={`Chat with ${customerPhone} on WhatsApp`}
                            >
                              <IconWhatsApp className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        {p.proofNote && (
                          <p className="text-[10px] text-indigo-600 font-medium mt-0.5">
                            Note: {p.proofNote}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200/60">
                          {productLabel(p.product)}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {currencySymbol}
                        {p.amount.toLocaleString("en-US", {
                          minimumFractionDigits: p.currency === "NGN" ? 0 : 2,
                        })}
                      </td>
                      <td className="py-3 px-2 font-mono text-slate-900 font-bold whitespace-nowrap">
                        {currencySymbol}
                        {p.hisShare.toLocaleString("en-US", {
                          minimumFractionDigits: p.currency === "NGN" ? 0 : 2,
                        })}
                      </td>
                      <td className="py-3 px-2 font-mono text-slate-900 font-bold whitespace-nowrap">
                        {currencySymbol}
                        {p.myShare.toLocaleString("en-US", {
                          minimumFractionDigits: p.currency === "NGN" ? 0 : 2,
                        })}
                      </td>
                      <td className="py-3 px-2 uppercase text-[10px] font-mono font-bold text-slate-500">
                        {p.provider}
                      </td>
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isPaid
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : isAwaitingProof
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : isPending
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {isAwaitingProof ? (
                            <>
                              <IconCamera className="w-3 h-3 text-amber-700" />
                              <span>Awaiting Approval</span>
                            </>
                          ) : (
                            p.status
                          )}
                        </span>
                      </td>
                      <td className="py-3 pr-4 pl-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.proofImage && (
                            <button
                              type="button"
                              onClick={() => setPreviewProof(p)}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-xs"
                              title="Click to view payment receipt photo"
                            >
                              <IconCamera className="w-3 h-3 text-indigo-600" />
                              <span>View Proof</span>
                            </button>
                          )}
                          {isAwaitingProof ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApprove(p.id)}
                                disabled={markingId === p.id}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                                title="Approve and deliver odds"
                              >
                                {markingId === p.id ? (
                                  "…"
                                ) : (
                                  <>
                                    <IconCheck className="w-3 h-3" />
                                    <span>Approve</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePayment(p.id)}
                                disabled={markingId === p.id}
                                className="group/del relative inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200/90 bg-rose-50/70 text-rose-500 hover:bg-rose-600 hover:text-white hover:border-rose-600 hover:shadow-xs active:scale-95 transition-all duration-150 disabled:opacity-40"
                                title="Delete pending approval transaction"
                                aria-label="Delete transaction"
                              >
                                {markingId === p.id ? (
                                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                                ) : (
                                  <DustbinIcon className="h-3.5 w-3.5 transition-colors" />
                                )}
                              </button>
                            </>
                          ) : isPending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleMarkPaid(p.id)}
                                disabled={markingId === p.id}
                                className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 transition shadow-xs"
                                title="Manually verify and mark as paid"
                              >
                                {markingId === p.id ? "Saving…" : "Mark Paid"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePayment(p.id)}
                                disabled={markingId === p.id}
                                className="group/del relative inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200/90 bg-rose-50/70 text-rose-500 hover:bg-rose-600 hover:text-white hover:border-rose-600 hover:shadow-xs active:scale-95 transition-all duration-150 disabled:opacity-40"
                                title="Delete pending transaction"
                                aria-label="Delete transaction"
                              >
                                {markingId === p.id ? (
                                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                                ) : (
                                  <DustbinIcon className="h-3.5 w-3.5 transition-colors" />
                                )}
                              </button>
                            </>
                          ) : p.status === "failed" ? (
                            <button
                              type="button"
                              onClick={() => handleDeletePayment(p.id)}
                              disabled={markingId === p.id}
                              className="group/del inline-flex items-center gap-1.5 rounded-lg border border-rose-200/90 bg-rose-50/70 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 hover:shadow-xs active:scale-95 transition-all duration-150 disabled:opacity-40"
                              title="Delete transaction"
                            >
                              {markingId === p.id ? (
                                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                              ) : (
                                <DustbinIcon className="h-3.5 w-3.5 text-rose-500 group-hover/del:text-white transition-colors" />
                              )}
                              <span>Delete</span>
                            </button>
                          ) : isPaid ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400 font-mono">
                                {p.revealCode ? `Code: ${p.revealCode}` : `Ref: ${p.externalRef.slice(0, 8)}…`}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeletePayment(p.id)}
                                disabled={markingId === p.id}
                                className="group/del relative inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 active:scale-95 transition-all duration-150 disabled:opacity-40"
                                title="Delete transaction"
                                aria-label="Delete transaction"
                              >
                                {markingId === p.id ? (
                                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                                ) : (
                                  <DustbinIcon className="h-3.5 w-3.5 transition-colors" />
                                )}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPaymentsCount > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/40 px-4 py-3 sm:px-5">
            <p className="text-xs text-slate-500">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalPaymentsCount} total)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-xs"
                disabled={page <= 1 || loadingPayments}
                onClick={() => void loadPayments(page - 1)}
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-xs"
                disabled={page >= totalPages || loadingPayments}
                onClick={() => void loadPayments(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Proof Preview & Approval Modal */}
      {previewProof && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-5 sm:p-7 shadow-2xl text-slate-900 my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                  Proof of Payment Review
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {productLabel(previewProof.product)} · ₦{previewProof.amount.toLocaleString()}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto py-4 space-y-4 flex-1">
              {/* Photo Display */}
              <div className="rounded-xl border border-slate-200 bg-slate-950 p-2 text-center flex items-center justify-center">
                {previewProof.proofImage ? (
                  <img
                    src={previewProof.proofImage}
                    alt="Payment proof receipt"
                    className="max-h-96 w-auto object-contain rounded-lg"
                  />
                ) : (
                  <p className="py-12 text-slate-400 text-xs">No image attached.</p>
                )}
              </div>

              {/* Transaction Metadata */}
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Customer:</span>
                    <span className="font-semibold text-slate-800">
                      {previewProof.customer.name || "Buyer"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Customer Phone (Unlock Key):</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono font-bold text-slate-800">
                        {previewProof.customer.phone || previewProof.phone || "No phone"}
                      </span>
                      {getWhatsAppUrl(previewProof.customer.phone || previewProof.phone, previewProof.currency) && (
                        <a
                          href={getWhatsAppUrl(previewProof.customer.phone || previewProof.phone, previewProof.currency, `Hello! Regarding your ${productLabel(previewProof.product)} payment proof on OddNext:`)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-2xs border border-emerald-200"
                          title="Chat on WhatsApp"
                        >
                          <IconWhatsApp className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Gateway / Bank:</span>
                    <span className="font-semibold text-slate-800 uppercase">
                      {previewProof.provider}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Submitted:</span>
                    <span className="text-slate-700">
                      {formatDateTime(previewProof.proofSubmittedAt || previewProof.createdAt)}
                    </span>
                  </div>
                </div>

                {previewProof.proofNote && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Sender Name / Note:</span>
                    <p className="font-medium text-slate-900 bg-white p-2 rounded-lg border border-slate-200/60 mt-1">
                      {previewProof.proofNote}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row gap-2 justify-end">
              {getWhatsAppUrl(previewProof.customer.phone || previewProof.phone, previewProof.currency) && (
                <a
                  href={getWhatsAppUrl(
                    previewProof.customer.phone || previewProof.phone,
                    previewProof.currency,
                    `Hello! Your ${productLabel(previewProof.product)} payment has been approved! Visit our site and enter your phone number (${previewProof.customer.phone || previewProof.phone}) to view today's odds slip and booking codes immediately.`
                  )!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition shadow-2xs"
                  title="Open WhatsApp chat with prefilled approval text"
                >
                  <IconWhatsApp className="w-3.5 h-3.5" />
                  <span>Chat on WhatsApp</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  const phoneNum = previewProof.customer.phone || previewProof.phone || "";
                  const text = `Hello! Your ${productLabel(previewProof.product)} payment has been approved! Visit our site and enter your phone number (${phoneNum}) to view today's odds slip and booking codes immediately.`;
                  void navigator.clipboard.writeText(text);
                  setActionMessage("✓ Copied WhatsApp notification message!");
                  setTimeout(() => setActionMessage(""), 3000);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                title="Copy ready-to-send WhatsApp notification"
              >
                <IconClipboard className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy WhatsApp Text</span>
              </button>
              <button
                type="button"
                onClick={() => handleDeletePayment(previewProof.id)}
                disabled={markingId === previewProof.id}
                className="group/del inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 active:scale-95 transition-all duration-150 shadow-xs disabled:opacity-40"
                title="Delete this transaction"
              >
                {markingId === previewProof.id ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                ) : (
                  <DustbinIcon className="h-4 w-4 text-rose-500 group-hover/del:text-white transition-colors" />
                )}
                <span>Delete Transaction</span>
              </button>
              <button
                type="button"
                onClick={() => handleReject(previewProof.id)}
                disabled={markingId === previewProof.id}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                <IconX className="w-3.5 h-3.5 text-slate-600" />
                <span>Reject Proof</span>
              </button>
              <button
                type="button"
                onClick={() => handleApprove(previewProof.id)}
                disabled={markingId === previewProof.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm"
              >
                {markingId === previewProof.id ? (
                  "Approving…"
                ) : (
                  <>
                    <IconCheck className="w-4 h-4" />
                    <span>Approve & Send Odds</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Payout Modal */}
      {payoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Request Split Profit Payout
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Request a profit withdrawal via Mobile Money or Bank Transfer
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayoutModalOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            {/* Error & Success Banners */}
            {payoutModalError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 flex items-center gap-2">
                <IconX className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{payoutModalError}</span>
              </div>
            )}
            {payoutModalSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <IconCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{payoutModalSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSubmitPayout} className="space-y-4">
              {/* Select Admin Beneficiary */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Admin Beneficiary
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPayoutRecipient("Forson");
                      setPayoutAccountName("Forson Kwarteng");
                      const avail = payoutSummary?.forson?.availableGhs ?? 0;
                      if (!payoutAmount || parseFloat(payoutAmount) <= 0) {
                        setPayoutAmount(avail > 0 ? avail.toFixed(2) : "");
                      }
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border transition ${
                      payoutRecipient === "Forson"
                        ? "border-amber-500 bg-amber-50/70 shadow-xs ring-1 ring-amber-500"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 text-amber-800 font-bold">
                      <IconCrown className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-900">Forson (60%)</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        Avail: ₵{payoutSummary?.forson?.availableGhs.toFixed(2) ?? "0.00"}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPayoutRecipient("Asamoah");
                      setPayoutAccountName("Asamoah");
                      const avail = payoutSummary?.asamoah?.availableGhs ?? 0;
                      if (!payoutAmount || parseFloat(payoutAmount) <= 0) {
                        setPayoutAmount(avail > 0 ? avail.toFixed(2) : "");
                      }
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border transition ${
                      payoutRecipient === "Asamoah"
                        ? "border-indigo-500 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-500"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-100 text-indigo-800 font-bold">
                      <IconBriefcase className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-900">Asamoah (40%)</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        Avail: ₵{payoutSummary?.asamoah?.availableGhs.toFixed(2) ?? "0.00"}
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Amount & Currency */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Payout Amount
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const avail = payoutRecipient === "Forson"
                        ? (payoutSummary?.forson?.availableGhs ?? 0)
                        : (payoutSummary?.asamoah?.availableGhs ?? 0);
                      if (avail > 0) setPayoutAmount(avail.toFixed(2));
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:underline"
                  >
                    Withdraw Available Max
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={payoutCurrency}
                    onChange={(e) => setPayoutCurrency(e.target.value as "GHS" | "NGN")}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="GHS">GHS (₵)</option>
                    <option value="NGN">NGN (₦)</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Disbursement Channel
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayoutMethod("mobile_money")}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold transition border ${
                      payoutMethod === "mobile_money"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-xs ring-1 ring-emerald-500"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <IconSmartphone className="w-4 h-4 text-emerald-600" />
                    <span>Mobile Money (MoMo)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayoutMethod("bank")}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold transition border ${
                      payoutMethod === "bank"
                        ? "border-blue-500 bg-blue-50 text-blue-800 shadow-xs ring-1 ring-blue-500"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <IconBuilding className="w-4 h-4 text-blue-600" />
                    <span>Bank Transfer</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Method Form */}
              {payoutMethod === "mobile_money" ? (
                <div className="space-y-3 rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/80">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Network Provider
                    </label>
                    <select
                      value={payoutNetwork}
                      onChange={(e) => setPayoutNetwork(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="MTN Mobile Money">MTN Mobile Money</option>
                      <option value="Telecel Cash (Vodafone)">Telecel Cash (Vodafone)</option>
                      <option value="AirtelTigo Money">AirtelTigo / AT Money</option>
                      <option value="OPay">OPay (Nigeria)</option>
                      <option value="PalmPay">PalmPay (Nigeria)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Mobile Money Number
                    </label>
                    <input
                      type="tel"
                      required
                      value={payoutPhone}
                      onChange={(e) => setPayoutPhone(e.target.value)}
                      placeholder="e.g. 0551234567 or 08012345678"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Registered Account Name
                    </label>
                    <input
                      type="text"
                      required
                      value={payoutAccountName}
                      onChange={(e) => setPayoutAccountName(e.target.value)}
                      placeholder="e.g. Forson Kwarteng"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/80">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Bank Name
                    </label>
                    <select
                      value={payoutBankName}
                      onChange={(e) => setPayoutBankName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="GCB Bank">GCB Bank</option>
                      <option value="Ecobank Ghana">Ecobank</option>
                      <option value="Zenith Bank">Zenith Bank</option>
                      <option value="GTBank">Guaranty Trust Bank (GTBank)</option>
                      <option value="Stanbic Bank">Stanbic Bank</option>
                      <option value="Access Bank">Access Bank</option>
                      <option value="Fidelity Bank">Fidelity Bank</option>
                      <option value="CalBank">CalBank</option>
                      <option value="UBA">United Bank for Africa (UBA)</option>
                      <option value="Absa Bank">Absa Bank</option>
                      <option value="First Bank">First Bank</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        required
                        value={payoutAccountNumber}
                        onChange={(e) => setPayoutAccountNumber(e.target.value)}
                        placeholder="e.g. 1029384756"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Branch / Sort Code (Optional)
                      </label>
                      <input
                        type="text"
                        value={payoutBranch}
                        onChange={(e) => setPayoutBranch(e.target.value)}
                        placeholder="e.g. Accra Main"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      required
                      value={payoutAccountName}
                      onChange={(e) => setPayoutAccountName(e.target.value)}
                      placeholder="e.g. Forson Kwarteng"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Purpose Notes */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Notes / Reference (Optional)
                </label>
                <input
                  type="text"
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="e.g. Weekly oddnext split disbursement"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPayoutModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={payoutSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {payoutSubmitting ? (
                    "Submitting…"
                  ) : (
                    <>
                      <IconSend className="w-3.5 h-3.5 text-amber-400" />
                      <span>Submit Payout Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Payout as Paid Confirmation Modal */}
      {markPaidModalPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <IconCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Mark Payout as Paid
                  </h3>
                  <p className="text-xs text-slate-500">
                    Confirm disbursement to {markPaidModalPayout.recipient}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMarkPaidModalPayout(null)}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 transition"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            {/* Payout Summary Box */}
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500">Beneficiary:</span>
                <span className="font-bold text-slate-900">
                  {markPaidModalPayout.recipient} ({markPaidModalPayout.splitPercentage}% Split)
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500">Amount:</span>
                <span className="font-mono text-base font-extrabold text-slate-900">
                  {markPaidModalPayout.currency === "NGN" ? "₦" : "₵"}
                  {markPaidModalPayout.amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500">Channel:</span>
                <span className="font-semibold text-slate-800">
                  {markPaidModalPayout.method === "mobile_money"
                    ? `📱 MoMo: ${markPaidModalPayout.network || "Mobile Money"} (${markPaidModalPayout.phone})`
                    : `🏦 Bank: ${markPaidModalPayout.bankName} (${markPaidModalPayout.accountNumber})`}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500">Account Name:</span>
                <span className="font-semibold text-slate-800">
                  {markPaidModalPayout.accountName}
                </span>
              </div>
            </div>

            {/* Optional Transaction Reference */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Transaction ID / Reference (Optional)
              </label>
              <input
                type="text"
                value={markPaidReference}
                onChange={(e) => setMarkPaidReference(e.target.value)}
                placeholder="e.g. MTN MoMo ID: 29481924 or Bank Ref: 98124"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Leave blank or enter reference number for bookkeeping.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMarkPaidModalPayout(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleMarkPayoutPaid(markPaidModalPayout.id, markPaidReference)}
                disabled={markingPayoutId === markPaidModalPayout.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-bold transition shadow-xs disabled:opacity-50"
              >
                {markingPayoutId === markPaidModalPayout.id ? (
                  "Updating…"
                ) : (
                  <>
                    <IconCheck className="w-3.5 h-3.5" />
                    <span>Confirm as Paid</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
