import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const date = now.toLocaleDateString("fr-FR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="h-full flex flex-col items-center justify-center gap-2">
      <motion.div
        key={mm}
        initial={{ opacity: 0.6, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="font-display text-4xl md:text-5xl font-bold tabular-nums text-neon leading-none tracking-[0.08em]"
      >
        {hh}<span className="animate-flicker">:</span>{mm}
        <span className="text-primary/50 text-2xl md:text-3xl">:{ss}</span>
      </motion.div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {date}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary/60">
        // {tz}
      </div>
    </div>
  );
}