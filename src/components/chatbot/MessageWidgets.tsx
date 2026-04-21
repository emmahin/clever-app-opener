import { ChatWidget, NewsItem, Stock } from "@/services";
import { ExternalLink, Newspaper, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

export function MessageWidgets({ widgets }: { widgets: ChatWidget[] }) {
  if (!widgets?.length) return null;
  return (
    <div className="space-y-4 mt-3">
      {widgets.map((w, i) =>
        w.type === "news" ? (
          <NewsWidget key={i} items={w.items} />
        ) : (
          <StocksWidget key={i} items={w.items} />
        )
      )}
    </div>
  );
}

function NewsWidget({ items }: { items: NewsItem[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <Newspaper className="w-3.5 h-3.5 text-primary" />
        ACTUALITÉS · {items.length} articles
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {items.map((n) => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex-shrink-0 w-56 rounded-lg overflow-hidden bg-background/40 border border-border/30 hover:border-primary/50 transition-all"
          >
            <div className="aspect-video bg-gradient-to-br from-primary/20 to-fuchsia-500/20 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <Newspaper className="w-6 h-6 text-white/30" />
              </div>
              {n.image && (
                <img
                  src={n.image}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="relative w-full h-full object-cover"
                  onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                />
              )}
            </div>
            <div className="p-2.5">
              <h4 className="text-xs font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                {n.title}
              </h4>
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground/70">
                <span className="font-medium">{n.source}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function StocksWidget({ items }: { items: Stock[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-primary" />
        MARCHÉS · {items.length} valeurs
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {items.map((s) => {
          const positive = s.changePct >= 0;
          const stroke = positive ? "hsl(142, 76%, 60%)" : "hsl(0, 75%, 65%)";
          return (
            <a
              key={s.symbol}
              href={`https://finance.yahoo.com/quote/${s.symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2.5 rounded-lg bg-background/40 hover:bg-background/60 transition-colors border border-border/30"
            >
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="text-xs font-semibold text-foreground">{s.name}</div>
                  <div className="text-[10px] text-muted-foreground">{s.symbol}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-semibold">{s.price.toFixed(2)}</div>
                  <div className="text-[10px] flex items-center gap-0.5 justify-end" style={{ color: stroke }}>
                    {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {positive ? "+" : ""}{s.changePct.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="h-10 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={s.series}>
                    <defs>
                      <linearGradient id={`mw-${s.symbol}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stroke} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(250, 35%, 9%)",
                        border: "1px solid hsl(260, 30%, 18%)",
                        borderRadius: "8px",
                        fontSize: "10px",
                      }}
                      labelStyle={{ color: "hsl(250, 15%, 65%)" }}
                      formatter={(v: number) => [v.toFixed(2), "Cours"]}
                    />
                    <Area type="monotone" dataKey="close" stroke={stroke} strokeWidth={1.5} fill={`url(#mw-${s.symbol})`} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}