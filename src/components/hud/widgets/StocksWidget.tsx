import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { yahooStockService } from "@/services/stockService";
import type { Stock } from "@/services/types";
import { HudLoader } from "@/components/hud/HudLoader";
import { TrendingDown, TrendingUp } from "lucide-react";

export function StocksWidget() {
  const [items, setItems] = useState<Stock[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      yahooStockService.getTrending()
        .then((all) => { if (!cancelled) setItems(all.slice(0, 5)); })
        .catch(() => { if (!cancelled) setItems([]); });
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  if (!items) {
    return <div className="h-full flex items-center justify-center"><HudLoader size={60} label="DATA" /></div>;
  }
  if (!items.length) {
    return <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-center">// PAS DE FLUX</div>;
  }

  return (
    <ul className="h-full overflow-auto space-y-1 pr-1">
      {items.map((s, i) => {
        const up = (s.changePct ?? 0) >= 0;
        return (
          <motion.li
            key={s.symbol}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm border border-primary/20 bg-background/30"
          >
            <div className="min-w-0">
              <div className="font-display text-xs uppercase tracking-wider text-neon">{s.symbol}</div>
              <div className="font-mono text-[9px] text-muted-foreground truncate">{s.name}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-xs tabular-nums text-foreground">
                {s.price?.toFixed(2) ?? "—"}
              </div>
              <div className={`flex items-center justify-end gap-0.5 font-mono text-[10px] tabular-nums ${up ? "text-primary" : "text-destructive"}`}>
                {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {(s.changePct ?? 0).toFixed(2)}%
              </div>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}