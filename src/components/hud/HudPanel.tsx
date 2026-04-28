import * as React from "react";
import { cn } from "@/lib/utils";

interface HudPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  code?: string;
  variant?: "default" | "highlight" | "muted";
  contentClassName?: string;
}

/**
 * HudPanel — bloc cockpit avec brackets aux 4 coins, header optionnel,
 * tag d'identifiant à droite, et glow néon. À utiliser à la place de Card
 * pour les zones "instrumentation".
 */
export function HudPanel({
  title,
  subtitle,
  icon,
  code,
  variant = "default",
  className,
  contentClassName,
  children,
  ...rest
}: HudPanelProps) {
  const tone =
    variant === "highlight"
      ? "border-primary/70 shadow-[0_0_22px_hsl(var(--primary)/0.45)]"
      : variant === "muted"
      ? "border-primary/25"
      : "border-primary/45 shadow-[0_0_18px_hsl(var(--primary)/0.18)]";

  return (
    <div
      className={cn(
        "relative bg-card/60 backdrop-blur-sm rounded-sm border",
        tone,
        className,
      )}
      {...rest}
    >
      <span className="pointer-events-none absolute -top-px -left-px w-3 h-3 border-l-2 border-t-2 border-primary" />
      <span className="pointer-events-none absolute -top-px -right-px w-3 h-3 border-r-2 border-t-2 border-primary" />
      <span className="pointer-events-none absolute -bottom-px -left-px w-3 h-3 border-l-2 border-b-2 border-primary" />
      <span className="pointer-events-none absolute -bottom-px -right-px w-3 h-3 border-r-2 border-b-2 border-primary" />

      {(title || code) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-primary/25">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="flex items-center justify-center w-7 h-7 rounded-sm bg-primary/15 border border-primary/50 text-primary shadow-[0_0_10px_hsl(var(--primary)/0.4)]">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="font-display text-sm font-bold leading-none uppercase tracking-[0.14em] text-neon truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-1 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {code && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80 px-2 py-0.5 border border-primary/40 rounded-sm bg-background/60">
              {code}
            </span>
          )}
        </header>
      )}

      <div className={cn("p-5", contentClassName)}>{children}</div>
    </div>
  );
}