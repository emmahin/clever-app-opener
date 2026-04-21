import { useEffect, useState } from "react";
import { stockService, Stock } from "@/services";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { useLanguage } from "@/i18n/LanguageProvider";

export function StockPanel() {
  const { t } = useLanguage();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    stockService.getTrending().then((s) => {
      setStocks(s);
      setLoading(false);
    });
    const interval = setInterval(() => stockService.getTrending().then(setStocks), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        {t("capitalRising")}
      </h3>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {stocks.map((s) => {
            const positive = s.changePct >= 0;
            const stroke = positive ? "hsl(142, 76%, 60%)" : "hsl(0, 75%, 65%)";
            return (
              <a
                key={s.symbol}
                href={`https://finance.yahoo.com/quote/${s.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-border/30"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.symbol} · {s.currency}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono font-semibold text-foreground">
                      {s.price.toFixed(2)}
                    </div>
                    <div
                      className="text-xs font-medium flex items-center gap-1 justify-end"
                      style={{ color: stroke }}
                    >
                      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {positive ? "+" : ""}{s.changePct.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="h-12 -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={s.series}>
                      <defs>
                        <linearGradient id={`g-${s.symbol}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={stroke} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(250, 35%, 9%)",
                          border: "1px solid hsl(260, 30%, 18%)",
                          borderRadius: "8px",
                          fontSize: "11px",
                        }}
                        labelStyle={{ color: "hsl(250, 15%, 65%)" }}
                        formatter={(v: number) => [v.toFixed(2), "Cours"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="close"
                        stroke={stroke}
                        strokeWidth={1.5}
                        fill={`url(#g-${s.symbol})`}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
