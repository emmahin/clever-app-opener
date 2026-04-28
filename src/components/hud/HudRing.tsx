import { cn } from "@/lib/utils";

interface HudRingProps {
  /** 0..100 */
  value: number;
  label?: string;
  unit?: string;
  size?: number;
  className?: string;
  /** Affiche une valeur formatée au centre (à la place du % par défaut) */
  display?: React.ReactNode;
}

/**
 * Jauge circulaire HUD — type cercle Iron Man (anneau néon avec progression).
 * SVG, scalable, glow cyan.
 */
export function HudRing({ value, label, unit, size = 120, className, display }: HudRingProps) {
  const v = Math.max(0, Math.min(100, value));
  const r = 44;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90 drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]">
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="hsl(var(--primary) / 0.35)"
          strokeWidth="0.5"
          strokeDasharray="2 4"
        />
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--primary) / 0.18)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
        />
        <circle cx="50" cy="50" r="32" fill="none" stroke="hsl(var(--primary) / 0.4)" strokeWidth="0.5" />
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const x1 = 50 + Math.cos(angle) * 38;
          const y1 = 50 + Math.sin(angle) * 38;
          const x2 = 50 + Math.cos(angle) * 41;
          const y2 = 50 + Math.sin(angle) * 41;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--primary) / 0.6)" strokeWidth="0.5" />
          );
        })}
      </svg>
      <div className="relative flex flex-col items-center justify-center text-center">
        <span className="font-display text-2xl font-bold text-neon tabular-nums leading-none">
          {display ?? `${Math.round(v)}`}
        </span>
        {(unit || label) && (
          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-primary/70">
            {unit ?? label}
          </span>
        )}
      </div>
    </div>
  );
}