import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface HudLoaderProps {
  size?: number;
  label?: string;
  className?: string;
}

/**
 * HudLoader — cercle rotatif holographique JARVIS.
 * 3 anneaux concentriques qui tournent à des vitesses différentes,
 * ticks néon et label clignotant au centre.
 */
export function HudLoader({ size = 80, label = "LOADING", className }: HudLoaderProps) {
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    >
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 drop-shadow-[0_0_8px_hsl(var(--primary)/0.7)]"
        animate={{ rotate: 360 }}
        transition={{ duration: 6, ease: "linear", repeat: Infinity }}
      >
        <circle
          cx="50" cy="50" r="46"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="0.8"
          strokeDasharray="90 30 14 30"
        />
      </motion.svg>
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-3"
        animate={{ rotate: -360 }}
        transition={{ duration: 4, ease: "linear", repeat: Infinity }}
      >
        <circle
          cx="50" cy="50" r="42"
          fill="none"
          stroke="hsl(var(--primary) / 0.6)"
          strokeWidth="1.2"
          strokeDasharray="6 8"
        />
      </motion.svg>
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-6"
        animate={{ rotate: 360 }}
        transition={{ duration: 2.5, ease: "linear", repeat: Infinity }}
      >
        <circle
          cx="50" cy="50" r="38"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="40 200"
        />
      </motion.svg>
      <span className="font-mono text-[8px] uppercase tracking-[0.25em] text-primary animate-pulse">
        {label}
      </span>
    </div>
  );
}