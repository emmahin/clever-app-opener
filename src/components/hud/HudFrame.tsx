import { useEffect, useState } from "react";

/**
 * HudFrame — overlay global (z-index 60, pointer-events: none) qui pose :
 *  - 4 brackets aux coins du viewport
 *  - 1 scanline animée
 *  - 2 anneaux rotatifs décoratifs
 *  - une status bar HUD en bas (heure, état système)
 *
 * Tout est purement décoratif. N'intercepte aucun clic.
 */
export function HudFrame() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const date = now.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] select-none">
      {/* Corner brackets */}
      <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-primary/70" />
      <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-primary/70" />
      <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-primary/70" />
      <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-primary/70" />

      {/* Edge ticks */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 flex gap-1">
        <span className="block w-px h-2 bg-primary/60" />
        <span className="block w-px h-3 bg-primary" />
        <span className="block w-px h-2 bg-primary/60" />
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col gap-1">
        <span className="block h-px w-2 bg-primary/60" />
        <span className="block h-px w-3 bg-primary" />
        <span className="block h-px w-2 bg-primary/60" />
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-1 items-end">
        <span className="block h-px w-2 bg-primary/60" />
        <span className="block h-px w-3 bg-primary" />
        <span className="block h-px w-2 bg-primary/60" />
      </div>

      {/* Scanline */}
      <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_10px_hsl(var(--primary))] animate-[scanline_8s_linear_infinite]" />

      {/* Decorative rings */}
      <div className="absolute -bottom-40 -right-40 w-[480px] h-[480px] rounded-full border border-primary/20 animate-hud-spin opacity-40">
        <div className="absolute inset-8 rounded-full border border-dashed border-primary/30" />
        <div className="absolute inset-16 rounded-full border border-primary/15" />
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_hsl(var(--primary))]" />
      </div>
      <div className="absolute -top-40 -left-40 w-[420px] h-[420px] rounded-full border border-primary/15 animate-hud-spin-rev opacity-30">
        <div className="absolute inset-10 rounded-full border border-dashed border-primary/25" />
        <div className="absolute bottom-4 right-1/2 translate-x-1/2 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary))]" />
      </div>

      {/* Status bar bottom */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 h-7 bg-background/70 border border-primary/40 backdrop-blur-md rounded-sm font-mono text-[10px] uppercase tracking-[0.18em] text-primary/85 shadow-[0_0_18px_hsl(var(--primary)/0.25)]">
        <span className="flex items-center gap-1.5">
          <span className="block w-1.5 h-1.5 rounded-full bg-primary animate-hud-pulse" />
          <span>SYS · ONLINE</span>
        </span>
        <span className="opacity-50">|</span>
        <span>{date}</span>
        <span className="opacity-50">|</span>
        <span className="text-neon">
          {hh}
          <span className="animate-flicker">:</span>
          {mm}
          <span className="opacity-60">:{ss}</span>
        </span>
        <span className="opacity-50">|</span>
        <span>NEX // HUD v1.0</span>
      </div>
    </div>
  );
}