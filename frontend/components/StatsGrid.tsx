import { compactCount } from "@/lib/format";
import type { SiteStats } from "@/lib/types";

function WinRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="grid h-14 w-14 shrink-0 place-items-center rounded-full sm:h-16 sm:w-16"
      style={{
        background: `conic-gradient(#22c55e ${clamped}%, #24302a 0)`,
      }}
    >
      <div className="grid h-11 w-11 place-items-center rounded-full bg-surface sm:h-12 sm:w-12">
        <span className="font-sans text-sm font-extrabold tracking-normal text-star">
          {clamped}%
        </span>
      </div>
    </div>
  );
}

export function StatsGrid({ stats }: { stats: SiteStats }) {
  const items = [
    { label: "Tips this month", value: String(stats.monthlyTips), icon: "⚽" },
    { label: "VIP members", value: compactCount(stats.vipMembers), icon: "👑" },
    { label: "Telegram", value: compactCount(stats.telegramCount), icon: "💬" },
  ];

  return (
    <section className="relative z-10 mx-auto -mt-10 max-w-6xl px-4 md:-mt-16">
      <div className="rounded-3xl border border-line/80 bg-surface/90 p-4 shadow-slip backdrop-blur-xl sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5 rounded-2xl bg-paper/90 px-4 py-3 ring-1 ring-white/5">
            <WinRing value={stats.winRate} />
            <div className="min-w-0 font-sans tracking-normal">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-fire animate-pulse" />
                <p className="text-xs font-semibold text-mute">Verified banker rate</p>
              </div>
              <p className="text-lg font-extrabold leading-tight text-white sm:text-xl">
                {stats.winRate}% Tips Landed
              </p>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-3 gap-2">
            {items.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-line/40 bg-paper/70 px-2 py-3 text-center transition hover:border-fire/30 sm:px-3"
              >
                <p className="flex items-center justify-center gap-1 font-sans text-[11px] font-medium leading-tight tracking-normal text-mute">
                  <span>{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.label.split(" ")[0]}</span>
                </p>
                <p className="mt-1 font-sans text-lg font-black tracking-tight text-cream sm:text-2xl">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
