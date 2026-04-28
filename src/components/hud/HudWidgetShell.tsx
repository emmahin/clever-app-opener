import { motion } from "framer-motion";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HudWidgetShellProps {
  title: React.ReactNode;
  code?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Active mode édition : affiche poignée drag + bouton supprimer */
  editMode?: boolean;
  onRemove?: () => void;
  className?: string;
  /** Padding du contenu (par défaut p-4) */
  contentClassName?: string;
}

/**
 * Shell d'un widget JARVIS pour la grille du Cockpit.
 * - corner brackets
 * - header avec drag handle (active uniquement en mode édition)
 * - bouton supprimer (mode édition)
 * - hover glow doux
 * - animation d'entrée Framer Motion
 *
 * IMPORTANT: la classe ".widget-drag-handle" doit être passée au handle pour
 * que react-grid-layout n'attrape le drag QUE depuis ce header.
 */
export function HudWidgetShell({
  title, code, icon, children, editMode = false, onRemove, className, contentClassName,
}: HudWidgetShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ boxShadow: "0 0 28px hsl(var(--primary) / 0.45)" }}
      className={cn(
        "group relative h-full w-full overflow-hidden rounded-sm border border-primary/45 bg-card/60 backdrop-blur-md",
        "shadow-[0_0_18px_hsl(var(--primary)/0.18),inset_0_1px_0_hsl(var(--primary)/0.12)]",
        "transition-colors hover:border-primary/80",
        className,
      )}
    >
      {/* corner brackets */}
      <span className="pointer-events-none absolute -top-px -left-px w-3 h-3 border-l-2 border-t-2 border-primary" />
      <span className="pointer-events-none absolute -top-px -right-px w-3 h-3 border-r-2 border-t-2 border-primary" />
      <span className="pointer-events-none absolute -bottom-px -left-px w-3 h-3 border-l-2 border-b-2 border-primary" />
      <span className="pointer-events-none absolute -bottom-px -right-px w-3 h-3 border-r-2 border-b-2 border-primary" />

      {/* header (drag handle) */}
      <header
        className={cn(
          "widget-drag-handle flex items-center justify-between gap-2 px-3 h-9 border-b border-primary/25 bg-background/40",
          editMode ? "cursor-move" : "cursor-default",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {editMode && (
            <GripVertical className="w-3.5 h-3.5 text-primary/60 shrink-0" />
          )}
          {icon && (
            <span className="text-primary shrink-0">{icon}</span>
          )}
          <h3 className="font-display text-[11px] font-bold leading-none uppercase tracking-[0.16em] text-neon truncate">
            {title}
          </h3>
          {code && (
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary/70 px-1.5 py-px border border-primary/40 rounded-sm bg-background/60 ml-1">
              {code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="block w-1.5 h-1.5 rounded-full bg-primary animate-hud-pulse" />
          {editMode && onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="ml-1 w-5 h-5 flex items-center justify-center rounded-sm text-destructive border border-destructive/50 hover:bg-destructive/20 transition"
              title="Supprimer le widget"
              aria-label="Supprimer le widget"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </header>

      <div className={cn("h-[calc(100%-2.25rem)] overflow-auto", contentClassName ?? "p-4")}>
        {children}
      </div>
    </motion.div>
  );
}