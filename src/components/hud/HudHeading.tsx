import { cn } from "@/lib/utils";

interface HudHeadingProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  code?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

/**
 * En-tête de page HUD : titre Orbitron, sous-titre, ID de bloc, action à droite.
 * Inclut une ligne décorative animée et des indicateurs.
 */
export function HudHeading({ title, subtitle, code, icon, right, className }: HudHeadingProps) {
  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <span className="mt-1 flex items-center justify-center w-10 h-10 rounded-sm bg-primary/15 border border-primary/60 text-primary shadow-[0_0_14px_hsl(var(--primary)/0.5)]">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl md:text-3xl font-bold leading-none uppercase tracking-[0.1em] text-neon truncate">
                {title}
              </h1>
              {code && (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary/80 px-2 py-0.5 border border-primary/50 rounded-sm bg-background/60">
                  {code}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="block w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary))] animate-hud-pulse" />
        <span className="block h-px flex-1 bg-gradient-to-r from-primary/80 via-primary/30 to-transparent" />
        <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-primary/60">// LIVE</span>
        <span className="block h-px w-12 bg-primary/40" />
      </div>
    </div>
  );
}