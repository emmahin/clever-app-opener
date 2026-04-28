import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface HudGaugeProps {
  /** 0..100 */
  value: number;
  label?: string;
  unit?: string;
  size?: number;
  className?: string;
  /** Couleur d'alerte si valeur >= seuil */
  alertThreshold?: number;
}

/**
 * Jauge animée holographique. Anneau qui se remplit avec spring physics
 * et compteur numérique qui s'incrémente en mono.
 */
export function HudGauge({ value, label, unit, size = 140, className, alertThreshold = 85 }: HudGaugeProps) {
  const v = Math.max(0, Math.min(100, value));
  const r = 44;
  const c = 2 * Math.PI * r;

  const progress = useMotionValue(0);
  const display = useTransform(progress, (p) => Math.round(p));
  const offset = useTransform(progress, (p) => c - (p / 100) * c);

  const alert = v >= alertThreshold;
  const stroke = alert ? "hsl(var(--destructive))" : "hsl(var(--primary))";

  useEffect(() => {
    const controls = animate(progress, v, { duration: 1.2, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [v, progress]);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        {/* outer dashed */}
        <circle cx="50" cy="50" r="48" fill="none" stroke={stroke} strokeOpacity="0.35" strokeWidth="0.5" strokeDasharray="2 4" />
        {/* track */}
        <circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeOpacity="0.15" strokeWidth="6" />
        {/* progress (motion) */}
        <motion.circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ strokeDashoffset: offset, filter: `drop-shadow(0 0 6px ${stroke})` }}
        />
        {/* inner ring */}
        <circle cx="50" cy="50" r="32" fill="none" stroke={stroke} strokeOpacity="0.4" strokeWidth="0.5" />
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 15 * Math.PI) / 180;
          const len = i % 3 === 0 ? 4 : 2;
          const x1 = 50 + Math.cos(angle) * (38 - len);
          const y1 = 50 + Math.sin(angle) * (38 - len);
          const x2 = 50 + Math.cos(angle) * 38;
          const y2 = 50 + Math.sin(angle) * 38;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeOpacity="0.55" strokeWidth="0.4" />;
        })}
      </svg>
      <div className="relative flex flex-col items-center justify-center text-center">
        <motion.span
          className={cn(
            "font-display text-3xl font-bold tabular-nums leading-none",
            alert ? "text-destructive" : "text-neon",
          )}
          style={{
            textShadow: alert
              ? "0 0 10px hsl(var(--destructive)/0.7)"
              : "0 0 8px hsl(var(--primary)/0.7)",
          }}
        >
          {display}
        </motion.span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary/70 mt-1">
          {unit ?? "%"}
        </span>
        {label && (
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}