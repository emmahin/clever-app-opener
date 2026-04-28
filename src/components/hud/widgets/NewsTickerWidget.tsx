import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { fetchNews, type NewsItem } from "@/services/newsService";
import { HudLoader } from "@/components/hud/HudLoader";

export function NewsTickerWidget() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNews()
      .then((all) => { if (!cancelled) setItems(all.slice(0, 5)); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  if (!items) {
    return <div className="h-full flex items-center justify-center"><HudLoader size={60} label="FEED" /></div>;
  }
  if (!items.length) {
    return <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-center">// FLUX VIDE</div>;
  }

  return (
    <ul className="h-full overflow-auto space-y-1.5 pr-1">
      {items.map((n, i) => (
        <motion.li
          key={n.url ?? i}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
        >
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full text-left group flex gap-2 px-2 py-1.5 rounded-sm border border-primary/20 hover:border-primary/60 hover:bg-primary/10 transition"
          >
            <span className="font-mono text-[10px] text-primary/60 mt-0.5 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="text-xs text-foreground truncate group-hover:text-neon transition">{n.title}</div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-primary/50 truncate">
                {n.source}
              </div>
            </div>
          </button>
        </motion.li>
      ))}
    </ul>
  );
}