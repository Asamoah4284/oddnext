import { compactCount } from "@/lib/format";

export function TelegramPromo({
  count,
  url,
}: {
  count: number;
  url: string;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="rounded-2xl border border-line/80 bg-gradient-to-r from-surface to-surface/60 p-5 backdrop-blur-md sm:p-7 md:flex md:items-center md:justify-between md:gap-8">
        <div className="min-w-0 font-sans tracking-normal">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-[#2aa3d4] animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-wider text-[#2aa3d4]">
              VIP Telegram Channel
            </p>
          </div>
          <p className="mt-1 text-2xl font-extrabold leading-tight text-cream sm:text-3xl">
            {compactCount(count)}+ Active Punters
          </p>
          <p className="mt-1 text-sm leading-relaxed text-mute">
            Get instant kickoff alerts, live booking codes, and winner updates right on your phone.
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#229ED9] px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_25px_rgba(34,158,217,0.35)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] md:mt-0 md:w-auto"
        >
          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
          </svg>
          Join Telegram Community
        </a>
      </div>
    </section>
  );
}
