import { useEffect, useState } from "react";
import { stockService, Stock } from "@/services";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
                <div className="h-32 -mx-1 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={s.series} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                      <defs>
                        <marker id={`arrowX-${s.symbol}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M0,0 L10,5 L0,10 z" fill="hsl(250, 15%, 55%)" />
                        </marker>
                        <marker id={`arrowY-${s.symbol}`} viewBox="0 0 10 10" refX="5" refY="2" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M0,10 L5,0 L10,10 z" fill="hsl(250, 15%, 55%)" />
                        </marker>
                      </defs>
                      <CartesianGrid stroke="hsl(250, 15%, 45% / 0.25)" strokeWidth={0.5} />
                      <XAxis
                        dataKey="t"
                        tick={{ fill: "hsl(250, 15%, 70%)", fontSize: 9 }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(250, 15%, 55%)", strokeWidth: 1.2, markerEnd: `url(#arrowX-${s.symbol})` }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: "hsl(250, 15%, 70%)", fontSize: 9 }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(250, 15%, 55%)", strokeWidth: 1.2, markerEnd: `url(#arrowY-${s.symbol})` }}
                        width={28}
                        domain={["auto", "auto"]}
                      />
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
                      <Line
                        type="monotone"
                        dataKey="close"
                        stroke={stroke}
                        strokeWidth={2.5}
                        dot={{ fill: stroke, stroke: stroke, r: 3 }}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
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
