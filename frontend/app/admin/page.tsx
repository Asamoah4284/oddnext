"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminLogin } from "@/components/AdminLogin";
import { useAuth } from "@/components/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { datetimeLocalValue, formatDateTime, formatKickoff } from "@/lib/format";
import { productLabel, type SlipProductId } from "@/lib/products";
import { useProducts } from "@/components/ProductsProvider";
import { AdminPricesEditor } from "@/components/AdminPricesEditor";
import { AdminPaymentsAnalytics } from "@/components/AdminPaymentsAnalytics";
import { BetslipPasteModal } from "@/components/BetslipPasteModal";
import type { AdminTip } from "@/lib/types";
import {
  IconBall,
  IconWallet,
  IconSettings,
  IconPlus,
  IconClipboard,
  IconSearch,
  IconCheck,
  IconX,
  IconExternalLink,
  IconLogOut,
  IconRefresh,
  IconTrash,
  IconEdit,
  IconCalendar,
  IconClock,
  IconLayers,
  IconActivity,
  IconCopy,
  IconChevronRight,
  IconChevronDown,
  IconUsers,
  IconDashboard,
  IconBell,
  IconMoon,
} from "@/components/Icons";

const PAGE_SIZE = 8;

const QUICK_LEAGUES = [
  "Premier League",
  "La Liga",
  "Serie A",
  "Champions League",
  "Bundesliga",
  "Ligue 1",
];

const QUICK_MARKETS = [
  { label: "1 (Home)", val: "Home Win" },
  { label: "X (Draw)", val: "Draw" },
  { label: "2 (Away)", val: "Away Win" },
  { label: "Over 1.5", val: "Over 1.5 Goals" },
  { label: "Over 2.5", val: "Over 2.5 Goals" },
  { label: "Under 2.5", val: "Under 2.5 Goals" },
  { label: "BTTS (GG)", val: "Both Teams To Score (GG)" },
  { label: "1X (DC)", val: "1X (Home or Draw)" },
  { label: "X2 (DC)", val: "X2 (Draw or Away)" },
];

const QUICK_ODDS = ["1.30", "1.45", "1.65", "1.85", "2.10", "2.60"];

function tipDay(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function calculateSlipCombinedOdds(tips: AdminTip[]): number {
  if (tips.length === 0) return 0;
  const product = tips.reduce((acc, t) => acc * (Number(t.odds) || 1), 1);
  return Math.round(product * 100) / 100;
}

function getPresetKickoff(type: "plus1h" | "plus3h" | "tonight20" | "tomorrow15"): string {
  const d = new Date();
  if (type === "plus1h") {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0, 0, 0);
  } else if (type === "plus3h") {
    d.setHours(d.getHours() + 3);
    d.setMinutes(0, 0, 0);
  } else if (type === "tonight20") {
    d.setHours(20, 0, 0, 0);
    if (new Date().getHours() >= 20) {
      d.setDate(d.getDate() + 1);
    }
  } else if (type === "tomorrow15") {
    d.setDate(d.getDate() + 1);
    d.setHours(15, 0, 0, 0);
  }
  return datetimeLocalValue(d.toISOString());
}

const emptyTip = {
  kickoffAt: "",
  league: "",
  homeTeam: "",
  awayTeam: "",
  prediction: "",
  odds: "1.50",
  product: "odds10" as SlipProductId,
  isVip: true,
  status: "pending" as AdminTip["status"],
};

export default function AdminPage() {
  const { user, token, logout } = useAuth();
  const { slipProducts } = useProducts();

  const [adminTab, setAdminTab] = useState<"picks" | "prices" | "payments">("picks");
  const [tips, setTips] = useState<AdminTip[]>([]);
  const [form, setForm] = useState(emptyTip);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [boardFilter, setBoardFilter] = useState<SlipProductId | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "won" | "lost">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [tipsPage, setTipsPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingTips, setLoadingTips] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [bookingDrafts, setBookingDrafts] = useState<Record<string, string>>({});
  const [bookingBusy, setBookingBusy] = useState("");
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState("");
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function dropStaleSession() {
    logout();
  }

  async function loadTips() {
    if (!token) return;
    try {
      setLoadingTips(true);
      setError("");
      const data = await apiFetch<{ tips: AdminTip[] }>("/api/admin/tips", { token });
      setTips(data.tips);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        dropStaleSession();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load tips");
    } finally {
      setLoadingTips(false);
    }
  }

  useEffect(() => {
    if (!token || user?.role !== "admin") return;
    void loadTips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  async function saveTip(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      odds: Number(form.odds),
      kickoffAt: new Date(form.kickoffAt).toISOString(),
    };
    try {
      if (editingId) {
        await apiFetch(`/api/admin/tips/${editingId}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(payload),
        });
        setSuccessBanner(`Updated pick: ${form.homeTeam} vs ${form.awayTeam}`);
      } else {
        await apiFetch("/api/admin/tips", {
          method: "POST",
          token,
          body: JSON.stringify(payload),
        });
        setSuccessBanner(`Posted new pick: ${form.homeTeam} vs ${form.awayTeam}`);
      }
      setForm(emptyTip);
      setEditingId(null);
      setFormOpen(false);
      await loadTips();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save pick");
    } finally {
      setBusy(false);
    }
  }

  function startEditTip(tip: AdminTip) {
    setEditingId(tip.id);
    setForm({
      kickoffAt: datetimeLocalValue(tip.kickoffAt),
      league: tip.league,
      homeTeam: tip.homeTeam,
      awayTeam: tip.awayTeam,
      prediction: tip.prediction,
      odds: String(tip.odds),
      product: tip.product || "odds10",
      isVip: tip.isVip,
      status: tip.status,
    });
    setFormOpen(true);
    window.scrollTo({ top: 350, behavior: "smooth" });
  }

  async function patchTip(id: string, body: Partial<AdminTip>) {
    if (!token) return;
    try {
      setTips((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...body } : t))
      );
      await apiFetch(`/api/admin/tips/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      });
      await loadTips();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        dropStaleSession();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not update tip");
      await loadTips();
    }
  }

  async function saveBoardBooking(product: SlipProductId, date: string) {
    if (!token) return;
    const key = `${product}|${date}`;
    setBookingBusy(key);
    setError("");
    try {
      const code = (bookingDrafts[key] ?? "").trim();
      await apiFetch("/api/admin/boards/booking", {
        method: "PATCH",
        token,
        body: JSON.stringify({
          product,
          date,
          bookingCode: code,
        }),
      });
      setSuccessBanner(`Booking code for ${productLabel(product)} saved: ${code || "(cleared)"}`);
      await loadTips();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save booking code");
    } finally {
      setBookingBusy("");
    }
  }

  function handleCopyBookingCode(key: string, code: string) {
    if (!code) return;
    void navigator.clipboard.writeText(code);
    setCopiedCodeKey(key);
    setTimeout(() => {
      setCopiedCodeKey(null);
    }, 2000);
  }

  async function deleteTip(id: string, label: string) {
    if (!token || !window.confirm(`Delete pick "${label}"?`)) return;
    try {
      await apiFetch(`/api/admin/tips/${id}`, { method: "DELETE", token });
      setSuccessBanner(`Deleted pick: ${label}`);
      await loadTips();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        dropStaleSession();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not delete tip");
    }
  }

  async function clearAllTips() {
    if (!token) return;
    const label =
      boardFilter === "all"
        ? "ALL picks across all boards"
        : `all picks on ${productLabel(boardFilter)}`;
    if (
      !window.confirm(
        `Are you sure you want to delete ${label}? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const url =
        boardFilter === "all"
          ? "/api/admin/tips"
          : `/api/admin/tips?product=${boardFilter}`;
      const res = await apiFetch<{ deletedCount: number }>(url, {
        method: "DELETE",
        token,
      });
      setSuccessBanner(`Cleared ${res.deletedCount} picks.`);
      await loadTips();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear picks");
    } finally {
      setBusy(false);
    }
  }

  // Filter tips by board, status, and search query
  const filteredTips = useMemo(() => {
    return tips.filter((tip) => {
      if (boardFilter !== "all" && (tip.product || "odds10") !== boardFilter) {
        return false;
      }
      if (statusFilter !== "all" && tip.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchHome = tip.homeTeam?.toLowerCase().includes(q);
        const matchAway = tip.awayTeam?.toLowerCase().includes(q);
        const matchLeague = tip.league?.toLowerCase().includes(q);
        const matchPick = tip.prediction?.toLowerCase().includes(q);
        const matchCode = tip.bookingCode?.toLowerCase().includes(q);
        if (!matchHome && !matchAway && !matchLeague && !matchPick && !matchCode) {
          return false;
        }
      }
      return true;
    });
  }, [tips, boardFilter, statusFilter, searchQuery]);

  // Aggregate stats for dashboard ribbon
  const stats = useMemo(() => {
    const totalCount = tips.length;
    const wonCount = tips.filter((t) => t.status === "won").length;
    const lostCount = tips.filter((t) => t.status === "lost").length;
    const pendingCount = tips.filter((t) => t.status === "pending").length;
    const settled = wonCount + lostCount;
    const winRate = settled > 0 ? Math.round((wonCount / settled) * 100) : 0;

    const boardsWithCodes = new Set<string>();
    const totalBoardsToday = new Set<string>();

    for (const t of tips) {
      const key = `${t.product || "odds10"}|${tipDay(t.kickoffAt)}`;
      totalBoardsToday.add(key);
      if (t.bookingCode) {
        boardsWithCodes.add(key);
      }
    }

    return {
      totalCount,
      wonCount,
      lostCount,
      pendingCount,
      winRate,
      boardsWithCodes: boardsWithCodes.size,
      totalBoards: totalBoardsToday.size,
    };
  }, [tips]);

  // Group filtered tips into accumulator slips (board + date)
  const slipGroups = useMemo(() => {
    const groups: {
      key: string;
      product: SlipProductId;
      date: string;
      code: string;
      combinedOdds: number;
      wonCount: number;
      lostCount: number;
      pendingCount: number;
      tips: AdminTip[];
    }[] = [];
    const index = new Map<string, number>();

    const ordered = [...filteredTips].sort((a, b) => {
      const board = (a.product || "odds10").localeCompare(b.product || "odds10");
      if (board !== 0) return board;
      const day = tipDay(b.kickoffAt).localeCompare(tipDay(a.kickoffAt));
      if (day !== 0) return day;
      return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
    });

    for (const tip of ordered) {
      const product = (tip.product || "odds10") as SlipProductId;
      const date = tipDay(tip.kickoffAt);
      const key = `${product}|${date}`;
      const existing = index.get(key);

      if (existing === undefined) {
        index.set(key, groups.length);
        groups.push({
          key,
          product,
          date,
          code: tip.bookingCode || "",
          combinedOdds: Number(tip.odds) || 1,
          wonCount: tip.status === "won" ? 1 : 0,
          lostCount: tip.status === "lost" ? 1 : 0,
          pendingCount: tip.status === "pending" ? 1 : 0,
          tips: [tip],
        });
      } else {
        const g = groups[existing];
        g.tips.push(tip);
        if (!g.code && tip.bookingCode) {
          g.code = tip.bookingCode;
        }
        if (tip.status === "won") g.wonCount++;
        else if (tip.status === "lost") g.lostCount++;
        else g.pendingCount++;
      }
    }

    for (const g of groups) {
      g.combinedOdds = calculateSlipCombinedOdds(g.tips);
    }

    return groups;
  }, [filteredTips]);

  const tipPages = Math.max(1, Math.ceil(slipGroups.length / PAGE_SIZE));
  const pagedGroups = useMemo(() => {
    const start = (tipsPage - 1) * PAGE_SIZE;
    return slipGroups.slice(start, start + PAGE_SIZE);
  }, [slipGroups, tipsPage]);

  // Count picks per board for tab badges
  const boardCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tips.length };
    for (const p of slipProducts) {
      counts[p.id] = tips.filter((t) => (t.product || "odds10") === p.id).length;
    }
    return counts;
  }, [tips, slipProducts]);

  useEffect(() => {
    setTipsPage(1);
  }, [boardFilter, statusFilter, searchQuery]);

  useEffect(() => {
    if (tipsPage > tipPages) setTipsPage(tipPages);
  }, [tipsPage, tipPages]);

  if (!user || user.role !== "admin" || !token) {
    return <AdminLogin />;
  }

  // Sidebar navigation component
  const sidebarNavContent = (
    <div className="flex flex-col h-full justify-between">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 font-mono text-sm font-black text-white shadow-sm">
            ON
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none">
              OddNext
            </h1>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              BETTING COMMAND
            </p>
          </div>
        </div>

        {/* Section: MAIN HOME */}
        <div className="px-4 py-4 space-y-1">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            MAIN HOME
          </p>

          <button
            type="button"
            onClick={() => {
              setAdminTab("picks");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
              adminTab === "picks"
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <div className="flex items-center gap-3">
              <IconDashboard className={`h-4 w-4 ${adminTab === "picks" ? "text-blue-600" : "text-slate-400"}`} />
              <span>Dashboard</span>
            </div>
            {adminTab === "picks" && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setAdminTab("payments");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
              adminTab === "payments"
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <div className="flex items-center gap-3">
              <IconActivity className={`h-4 w-4 ${adminTab === "payments" ? "text-blue-600" : "text-slate-400"}`} />
              <span>Analytics</span>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              Live
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAdminTab("payments");
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <div className="flex items-center gap-3">
              <IconWallet className="h-4 w-4 text-slate-400" />
              <span>Finance</span>
            </div>
          </button>
        </div>

        {/* Section: ALL PAGE */}
        <div className="px-4 py-2 space-y-1">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            ALL PAGE
          </p>

          <button
            type="button"
            onClick={() => {
              setAdminTab("picks");
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <div className="flex items-center gap-3">
              <IconBall className="h-4 w-4 text-slate-400" />
              <span>Picks & Slips</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-mono text-slate-600">
                {tips.length}
              </span>
              <IconChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setAdminTab("prices");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
              adminTab === "prices"
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <div className="flex items-center gap-3">
              <IconSettings className={`h-4 w-4 ${adminTab === "prices" ? "text-blue-600" : "text-slate-400"}`} />
              <span>Board Prices</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] font-bold text-emerald-600">
                GH/NG
              </span>
              <IconChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setAdminTab("payments");
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <div className="flex items-center gap-3">
              <IconWallet className="h-4 w-4 text-slate-400" />
              <span>Revenue Split</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-amber-50 px-1.5 py-0.2 text-[10px] font-bold text-amber-600">
                60/40
              </span>
              <IconChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </button>

          <Link
            href="/"
            target="_blank"
            className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <div className="flex items-center gap-3">
              <IconExternalLink className="h-4 w-4 text-slate-400" />
              <span>Live Public Site</span>
            </div>
            <IconChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
        </div>
      </div>

      {/* Bottom Profile Footer */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-200/60">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 font-bold text-white text-xs">
              A
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">Asamoah</p>
              <p className="text-[10px] text-slate-400">Superadmin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={dropStaleSession}
            className="text-slate-400 hover:text-rose-600 p-1 transition"
            title="Sign out"
          >
            <IconLogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 antialiased font-sans flex admin-white">
      {/* Desktop Left Sidebar (Matching Screenshot) */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200/90 flex-col shrink-0 min-h-screen sticky top-0 h-screen z-30">
        {sidebarNavContent}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-64 bg-white h-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarNavContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f8fafc]">
        {/* Top Header Bar (Matching Screenshot) */}
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200/80 px-4 sm:px-8 flex items-center justify-between backdrop-blur-md">
          {/* Mobile Menu Button & Brand */}
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <IconDashboard className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white font-bold text-xs">
                ON
              </div>
              <span className="font-bold text-slate-900 text-sm">OddNext</span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Desk /</span>
            <span className="text-xs font-bold text-slate-700 capitalize">{adminTab} Workspace</span>
          </div>

          {/* Right Header Capsule Items */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Bell Notifications */}
            <button
              type="button"
              className="h-9 w-9 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition relative"
              title="Notifications"
            >
              <IconBell className="h-4 w-4" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-blue-600" />
            </button>

            {/* User Profile Capsule (Matching Screenshot: Asamoah / Superadmin) */}
            <div className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full border border-slate-200 bg-slate-50">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-white font-bold text-xs">
                A
              </div>
              <div className="hidden sm:block text-left pr-2">
                <p className="text-xs font-bold text-slate-900 leading-none">Asamoah</p>
                <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">Superadmin</p>
              </div>
            </div>

            {/* Dark / Light Toggle Icon */}
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 p-1"
              title="Theme Toggle"
            >
              <IconMoon className="h-4 w-4" />
            </button>

            {/* Logout Icon */}
            <button
              type="button"
              onClick={dropStaleSession}
              className="text-slate-400 hover:text-rose-600 p-1"
              title="Sign out"
            >
              <IconLogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="p-4 sm:p-7 space-y-6 max-w-7xl w-full mx-auto">
          {/* Header Title Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                OddNext Command Center
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-500">
                Unified operations across Daily Slips, High-Odds Accumulators, Board Pricing, and SportyBet Booking Codes.
              </p>
            </div>

            {/* Royal Blue Top-Right Primary Action Button (Matching Screenshot: + Phone / Custom Order) */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setPasteModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-xs font-bold shadow-sm transition"
              >
                <IconClipboard className="h-3.5 w-3.5" />
                <span>+ Paste Betslip</span>
              </button>
            </div>
          </div>

          {/* Feedback & Error Banners */}
          {error && (
            <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-700">
              <div className="flex items-center gap-2">
                <span className="font-bold">Error:</span>
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError("")}
                className="font-semibold text-rose-800 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {successBanner && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm text-emerald-800">
              <div className="flex items-center gap-2">
                <IconCheck className="h-4 w-4 text-emerald-600" />
                <span>{successBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessBanner("")}
                className="font-semibold text-emerald-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Render Tab Views: Prices, Payments, or Dashboard Main */}
          {adminTab === "prices" ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <AdminPricesEditor token={token} />
            </div>
          ) : adminTab === "payments" ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <AdminPaymentsAnalytics token={token} />
            </div>
          ) : (
            <>
              {/* Dark Executive Live Banner (Matching Screenshot exactly!) */}
              <div className="bg-[#0b1328] text-white rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-sm border border-slate-800">
                {/* Left: Green online indicator */}
                <div className="flex items-center gap-3.5">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#14233c] text-emerald-400 border border-emerald-500/30">
                    <IconActivity className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xl sm:text-2xl font-bold text-white">
                        {stats.totalCount > 0 ? "1" : "0"}
                      </span>
                      <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ONLINE NOW
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Active in last 1 min across OddNext web & checkouts
                    </p>
                  </div>
                </div>

                {/* Center: Metric Columns (Matching Screenshot: Today's visits, Weekly, Monthly) */}
                <div className="flex items-center gap-6 sm:gap-10 border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-8">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      TODAY'S PICKS
                    </p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-mono text-lg sm:text-xl font-bold text-white">
                        {stats.totalCount}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold">
                        ({slipGroups.length} slips)
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      SETTLED (7D)
                    </p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-mono text-lg sm:text-xl font-bold text-white">
                        {stats.wonCount + stats.lostCount}
                      </span>
                      <span className="text-[10px] text-slate-400">results</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      WIN RATE (30D)
                    </p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-mono text-lg sm:text-xl font-bold text-emerald-400">
                        {stats.winRate}%
                      </span>
                      <span className="text-[10px] text-slate-400">accuracy</span>
                    </div>
                  </div>
                </div>

                {/* Right: Notification chip & Full Action */}
                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  {stats.pendingCount > 0 && (
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                      <span>🔥</span>
                      <span>{stats.pendingCount} Pending Items</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setAdminTab("payments")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white transition shadow-sm"
                  >
                    <span>Full Analytics</span>
                    <IconChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* 4 White Metric Cards with Mini Wave Curves (Matching Screenshot exactly!) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: TOTAL USERS / PICKS */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        TOTAL PICKS
                      </span>
                      <div className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600">
                        <IconUsers className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <span className="font-mono text-2xl sm:text-3xl font-extrabold text-slate-900">
                        {stats.totalCount}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {stats.totalCount} active picks
                      </p>
                    </div>
                  </div>
                  {/* Blue Wave SVG Line */}
                  <div className="mt-3 pt-1">
                    <svg viewBox="0 0 120 28" fill="none" className="h-6 w-full text-blue-500">
                      <path
                        d="M0 20 Q 30 5, 60 16 T 120 10"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>

                {/* Card 2: TOTAL PRODUCTS / BOARDS */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        ACTIVE BOARDS
                      </span>
                      <div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                        <IconBall className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <span className="font-mono text-2xl sm:text-3xl font-extrabold text-slate-900">
                        {slipGroups.length}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {slipProducts.length} boards live
                      </p>
                    </div>
                  </div>
                  {/* Green Wave SVG Line */}
                  <div className="mt-3 pt-1">
                    <svg viewBox="0 0 120 28" fill="none" className="h-6 w-full text-emerald-500">
                      <path
                        d="M0 22 Q 35 18, 65 6 T 120 14"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>

                {/* Card 3: TOTAL ORDERS / OUTCOMES */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        SETTLED OUTCOMES
                      </span>
                      <div className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-600">
                        <IconClock className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <span className="font-mono text-2xl sm:text-3xl font-extrabold text-slate-900">
                        {stats.wonCount}W
                      </span>
                      <p className="text-[11px] text-amber-600 font-semibold mt-0.5">
                        {stats.pendingCount} pending
                      </p>
                    </div>
                  </div>
                  {/* Amber Wave SVG Line */}
                  <div className="mt-3 pt-1">
                    <svg viewBox="0 0 120 28" fill="none" className="h-6 w-full text-amber-500">
                      <path
                        d="M0 16 Q 30 24, 70 8 T 120 20"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>

                {/* Card 4: REVENUE */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        WIN RATE
                      </span>
                      <div className="grid h-7 w-7 place-items-center rounded-lg bg-purple-50 text-purple-600">
                        <IconWallet className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <span className="font-mono text-2xl sm:text-3xl font-extrabold text-slate-900">
                        {stats.winRate}%
                      </span>
                      <p className="text-[11px] text-purple-600 font-semibold mt-0.5">
                        {stats.wonCount} won · {stats.lostCount} lost
                      </p>
                    </div>
                  </div>
                  {/* Purple Wave SVG Line */}
                  <div className="mt-3 pt-1">
                    <svg viewBox="0 0 120 28" fill="none" className="h-6 w-full text-purple-500">
                      <path
                        d="M0 18 Q 40 4, 80 18 T 120 8"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Main Ecosystem Card (Matching bottom card in screenshot) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm space-y-5">
                {/* Header with Blue Round Icon & Stars */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white font-bold text-sm shadow-sm">
                      <IconLayers className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">
                          OddNext Betting Operations & Daily Slips
                        </h2>
                        <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                          Live Pulse
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Aggregated sports betting demand velocity across banker slips, high accas, and VIP codes.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                      <span>★</span>
                      <span>60% Forson · 40% Asamoah Split Active</span>
                    </span>
                  </div>
                </div>

                {/* Sub KPI Stats Strip */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 rounded-xl p-3 border border-slate-200/60">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      UNIFIED PICKS POOL
                    </p>
                    <p className="font-mono text-base font-bold text-slate-900 mt-0.5">
                      {stats.totalCount} Games
                    </p>
                    <p className="text-[10px] text-slate-400">across 5 board tiers</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      ACTIVE SLIP TICKETS
                    </p>
                    <p className="font-mono text-base font-bold text-slate-900 mt-0.5">
                      {slipGroups.length} Accumulators
                    </p>
                    <p className="text-[10px] text-slate-400">auto-calculated odds</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      SPORTYBET SYNC
                    </p>
                    <p className="font-mono text-base font-bold text-slate-900 mt-0.5">
                      {stats.boardsWithCodes} / {stats.totalBoards} Synced
                    </p>
                    <p className="text-[10px] text-emerald-600 font-semibold">1-click code copy</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      BOARD CHECKOUT
                    </p>
                    <p className="font-mono text-base font-bold text-slate-900 mt-0.5">
                      GH₵ & ₦ Live
                    </p>
                    <p className="text-[10px] text-slate-400">Moolre + Paystack</p>
                  </div>
                </div>

                {/* Studio Creator Toggle Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (formOpen && !editingId) {
                          setFormOpen(false);
                        } else {
                          setEditingId(null);
                          setForm(emptyTip);
                          setFormOpen(true);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-sm ${
                        formOpen
                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      <IconPlus className="h-4 w-4" />
                      <span>{formOpen ? "Close Pick Studio" : "+ Add Single Game"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPasteModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 text-xs font-semibold shadow-sm transition"
                    >
                      <IconClipboard className="h-4 w-4 text-blue-600" />
                      <span>Paste Full Betslip</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadTips()}
                      disabled={loadingTips}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm"
                    >
                      <IconRefresh className={`h-3.5 w-3.5 ${loadingTips ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>

                    {filteredTips.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAllTips}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-600 transition"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                        <span>{boardFilter === "all" ? "Clear All" : `Clear ${productLabel(boardFilter)}`}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Collapsible Form Panel */}
                {formOpen && (
                  <form
                    onSubmit={saveTip}
                    className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-600" />
                        <h3 className="font-bold text-sm text-slate-900">
                          {editingId ? "Edit Game Pick" : "Post New Game Pick"}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setFormOpen(false);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Board
                        </label>
                        <select
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-600"
                          value={form.product}
                          onChange={(e) => setForm({ ...form, product: e.target.value as SlipProductId })}
                        >
                          {slipProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label} (GH₵{p.priceGhs} / ₦{p.priceNgn.toLocaleString()})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          League
                        </label>
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600"
                          placeholder="e.g. Premier League"
                          required
                          value={form.league}
                          onChange={(e) => setForm({ ...form, league: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Home Team
                        </label>
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600"
                          placeholder="e.g. Arsenal"
                          required
                          value={form.homeTeam}
                          onChange={(e) => setForm({ ...form, homeTeam: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Away Team
                        </label>
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600"
                          placeholder="e.g. Chelsea"
                          required
                          value={form.awayTeam}
                          onChange={(e) => setForm({ ...form, awayTeam: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Quick League Helpers */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-[11px] text-slate-400">Quick League:</span>
                      {QUICK_LEAGUES.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setForm({ ...form, league: l })}
                          className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:border-blue-500 hover:text-blue-600 transition shadow-2xs"
                        >
                          {l}
                        </button>
                      ))}
                    </div>

                    {/* Kickoff Date & Quick Time Presets */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Kickoff
                        </label>
                        <input
                          type="datetime-local"
                          required
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-blue-600"
                          value={form.kickoffAt}
                          onChange={(e) => setForm({ ...form, kickoffAt: e.target.value })}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Quick Presets
                        </label>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, kickoffAt: getPresetKickoff("plus1h") })}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:text-blue-600 hover:border-blue-300"
                          >
                            +1 Hour
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, kickoffAt: getPresetKickoff("plus3h") })}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:text-blue-600 hover:border-blue-300"
                          >
                            +3 Hours
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, kickoffAt: getPresetKickoff("tonight20") })}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:text-blue-600 hover:border-blue-300"
                          >
                            Tonight 20:00
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, kickoffAt: getPresetKickoff("tomorrow15") })}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:text-blue-600 hover:border-blue-300"
                          >
                            Tomorrow 15:00
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Market & Odds */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Prediction / Market
                        </label>
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                          placeholder="e.g. Over 2.5 Goals"
                          required
                          value={form.prediction}
                          onChange={(e) => setForm({ ...form, prediction: e.target.value })}
                        />

                        {/* Quick Market Chips */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {QUICK_MARKETS.map((m) => (
                            <button
                              key={m.val}
                              type="button"
                              onClick={() => setForm({ ...form, prediction: m.val })}
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:border-blue-400 hover:text-blue-600 transition"
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Decimal Odds
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          required
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold text-blue-600 outline-none focus:border-blue-600"
                          value={form.odds}
                          onChange={(e) => setForm({ ...form, odds: e.target.value })}
                        />

                        <div className="mt-2 flex flex-wrap gap-1">
                          {QUICK_ODDS.map((odd) => (
                            <button
                              key={odd}
                              type="button"
                              onClick={() => setForm({ ...form, odds: odd })}
                              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 hover:border-blue-400 hover:text-blue-600"
                            >
                              {odd}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Result & Action */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-blue-100 pt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Result:
                        </span>
                        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                          {(["pending", "won", "lost"] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setForm({ ...form, status: st })}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                                form.status === st
                                  ? st === "won"
                                    ? "bg-emerald-600 text-white"
                                    : st === "lost"
                                    ? "bg-rose-600 text-white"
                                    : "bg-slate-700 text-white"
                                  : "text-slate-500 hover:text-slate-900"
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold shadow-sm transition disabled:opacity-50"
                      >
                        {busy ? "Saving…" : editingId ? "Update Pick" : "Post Pick to Board"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Search & Board Filter Bar */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                      <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search match, team, league, prediction…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Status Pill Filters */}
                    <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                      {(["all", "pending", "won", "lost"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStatusFilter(st)}
                          className={`rounded-lg px-3 py-1 font-semibold capitalize transition ${
                            statusFilter === st
                              ? "bg-white text-blue-600 shadow-2xs font-bold"
                              : "text-slate-500 hover:text-slate-900"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Board Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                    <button
                      type="button"
                      onClick={() => setBoardFilter("all")}
                      className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                        boardFilter === "all"
                          ? "bg-blue-600 text-white font-bold shadow-sm"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                      }`}
                    >
                      <span>All Boards</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                          boardFilter === "all" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {boardCounts.all ?? 0}
                      </span>
                    </button>

                    {slipProducts.map((p) => {
                      const count = boardCounts[p.id] ?? 0;
                      const isSelected = boardFilter === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setBoardFilter(p.id)}
                          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                            isSelected
                              ? "bg-blue-600 text-white font-bold shadow-sm"
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                          }`}
                        >
                          <span>{p.label}</span>
                          <span
                            className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                              isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Slip Ticket Cards Container */}
                <div className="space-y-4 pt-2">
                  {pagedGroups.map((group) => {
                    const draft = bookingDrafts[group.key] ?? group.code;
                    const isCopied = copiedCodeKey === group.key;

                    return (
                      <article
                        key={group.key}
                        className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs hover:border-slate-300 transition"
                      >
                        {/* Ticket Header */}
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-b border-slate-200/80 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200/60 font-mono">
                              {productLabel(group.product)}
                            </span>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <IconCalendar className="h-3.5 w-3.5 text-slate-400" />
                              <span>{group.date}</span>
                            </div>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs text-slate-500">
                              {group.tips.length} {group.tips.length === 1 ? "game" : "games"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-1 text-xs font-mono font-bold text-blue-600 shadow-2xs">
                              <span className="text-[10px] text-slate-400 font-sans uppercase">Acca Odds</span>
                              <span>{group.combinedOdds.toFixed(2)}x</span>
                            </div>

                            <div className="flex items-center gap-1 text-[11px] font-mono">
                              {group.wonCount > 0 && (
                                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-800 font-bold">
                                  {group.wonCount}W
                                </span>
                              )}
                              {group.lostCount > 0 && (
                                <span className="rounded-md bg-rose-100 px-2 py-0.5 text-rose-800 font-bold">
                                  {group.lostCount}L
                                </span>
                              )}
                              {group.pendingCount > 0 && (
                                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-800 font-bold">
                                  {group.pendingCount}P
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Games List */}
                        <div className="divide-y divide-slate-100">
                          {group.tips.map((tip) => (
                            <div
                              key={tip.id}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 hover:bg-slate-50/60 transition"
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-slate-900 text-sm">
                                    {tip.homeTeam} <span className="text-slate-400 font-normal">vs</span> {tip.awayTeam}
                                  </span>
                                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                    {tip.league}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <div className="flex items-center gap-1 text-slate-400">
                                    <IconClock className="h-3 w-3" />
                                    <span>{formatKickoff(tip.kickoffAt)}</span>
                                  </div>
                                  <span className="text-slate-200">·</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-blue-600">
                                      {tip.prediction}
                                    </span>
                                    <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono font-bold text-slate-800">
                                      @{Number(tip.odds).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Row */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                                  <button
                                    type="button"
                                    onClick={() => void patchTip(tip.id, { status: "pending" })}
                                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                      tip.status === "pending"
                                        ? "bg-amber-500 text-white font-bold shadow-2xs"
                                        : "text-slate-500 hover:text-slate-900"
                                    }`}
                                  >
                                    Pending
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void patchTip(tip.id, { status: "won" })}
                                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                      tip.status === "won"
                                        ? "bg-emerald-600 text-white font-bold shadow-2xs"
                                        : "text-slate-500 hover:text-emerald-700"
                                    }`}
                                  >
                                    Won
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void patchTip(tip.id, { status: "lost" })}
                                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                      tip.status === "lost"
                                        ? "bg-rose-600 text-white font-bold shadow-2xs"
                                        : "text-slate-500 hover:text-rose-700"
                                    }`}
                                  >
                                    Lost
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => startEditTip(tip)}
                                  className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-blue-600 hover:border-blue-200 transition shadow-2xs"
                                  title="Edit Pick"
                                >
                                  <IconEdit className="h-3.5 w-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => deleteTip(tip.id, `${tip.homeTeam} vs ${tip.awayTeam}`)}
                                  className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-rose-600 hover:border-rose-200 transition shadow-2xs"
                                  title="Delete Pick"
                                >
                                  <IconTrash className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Booking Code Bar */}
                        <div className="bg-slate-50/80 border-t border-slate-200/80 px-4 py-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                            <div className="flex items-center gap-2">
                              <span className="grid h-6 w-6 place-items-center rounded-lg bg-blue-600 text-white font-bold text-[10px]">
                                SB
                              </span>
                              <span className="text-xs font-semibold text-slate-700">
                                SportyBet Code:
                              </span>
                              {group.code && (
                                <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                                  {group.code}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Enter SportyBet booking code…"
                                value={draft}
                                onChange={(e) =>
                                  setBookingDrafts((curr) => ({
                                    ...curr,
                                    [group.key]: e.target.value,
                                  }))
                                }
                                className="w-full sm:w-56 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 shadow-2xs"
                              />

                              {draft && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyBookingCode(group.key, draft)}
                                  className={`shrink-0 inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                                    isCopied
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-bold"
                                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  <IconCopy className="h-3.5 w-3.5" />
                                  <span>{isCopied ? "Copied!" : "Copy"}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={bookingBusy === group.key}
                                onClick={() => void saveBoardBooking(group.product, group.date)}
                                className="shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-bold transition shadow-sm disabled:opacity-50"
                              >
                                {bookingBusy === group.key ? "Saving…" : "Save Code"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}

                  {pagedGroups.length === 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-12 text-center">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-blue-600 border border-slate-200 shadow-sm">
                        <IconBall className="h-6 w-6" />
                      </div>
                      <h3 className="mt-3 text-sm font-bold text-slate-900">No picks found</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {searchQuery
                          ? `No picks matching "${searchQuery}". Clear your search query.`
                          : "No games found on this board."}
                      </p>
                      <div className="mt-4 flex items-center justify-center gap-2">
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Clear Search
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setForm(emptyTip);
                            setFormOpen(true);
                          }}
                          className="rounded-xl bg-blue-600 text-white px-4 py-1.5 text-xs font-bold hover:bg-blue-700"
                        >
                          + Add Pick
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pagination */}
                {slipGroups.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                    <p>
                      Showing <strong className="text-slate-800">{pagedGroups.length}</strong> of{" "}
                      <strong className="text-slate-800">{slipGroups.length}</strong> slips · Page{" "}
                      <strong className="text-slate-800">{tipsPage}</strong> of{" "}
                      <strong className="text-slate-800">{tipPages}</strong>
                    </p>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={tipsPage <= 1}
                        onClick={() => setTipsPage((p) => Math.max(1, p - 1))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50 shadow-2xs"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={tipsPage >= tipPages}
                        onClick={() => setTipsPage((p) => Math.min(tipPages, p + 1))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50 shadow-2xs"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Betslip Bulk Paste Modal */}
      <BetslipPasteModal
        isOpen={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        token={token}
        defaultBoard={boardFilter !== "all" ? boardFilter : form.product}
        onSuccess={(count, boardLabel, code) => {
          setSuccessBanner(
            `Successfully posted ${count} picks to ${boardLabel}${
              code ? ` with booking code "${code}"` : ""
            }!`
          );
          void loadTips();
        }}
      />
    </div>
  );
}
