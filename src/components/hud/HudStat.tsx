import { cn } from "@/lib/utils";

interface HudStatProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: { value: string; positive?: boolean };
  /** 0..100, affiche une barre sous la valeur */
  progress?: number;
  className?: string;
}

export function HudStat({ label, value, unit, delta, progress, className }: HudStatProps) {
  return (
    <div
      className={cn(
        "relative px-3 py-2 bg-background/40 border border-primary/30 rounded-sm",
        "before:content-[''] before:absolute before:top-0 before:left-0 before:w-2 before:h-2 before:border-l before:border-t before:border-primary",
        "after:content-[''] after:absolute after:bottom-0 after:right-0 after:w-2 after:h-2 after:border-r after:border-b after:border-primary",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        {delta && (
          <span
            className={cn(
              "font-mono text-[9px] uppercase tracking-wider px-1.5 py-px rounded-sm border",
              delta.positive
                ? "text-primary border-primary/50 bg-primary/10"
                : "text-destructive border-destructive/50 bg-destructive/10",
            )}
          >
            {delta.value}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-xl font-bold text-neon tabular-nums leading-none">
          {value}
        </span>
        {unit && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary/70">
            {unit}
          </span>
        )}
      </div>
      {typeof progress === "number" && (
        <div className="mt-2 h-[3px] w-full bg-primary/15 rounded-sm overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary via-accent to-primary shadow-[0_0_8px_hsl(var(--primary))]"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}