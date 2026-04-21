import { ChatWidget, NewsItem, Stock, WebSource, GalleryImage } from "@/services";
import { ExternalLink, Newspaper, TrendingUp, TrendingDown, BarChart3, Globe, ImageIcon, Images } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

export function MessageWidgets({ widgets }: { widgets: ChatWidget[] }) {
  if (!widgets?.length) return null;
  return (
    <div className="space-y-4 mt-3">
      {widgets.map((w, i) => {
        if (w.type === "news") return <NewsWidget key={i} items={w.items} />;
        if (w.type === "stocks") return <StocksWidget key={i} items={w.items} />;
        if (w.type === "image") return <ImageWidget key={i} url={w.url} prompt={w.prompt} />;
        if (w.type === "image_gallery") return <ImageGalleryWidget key={i} query={w.query} items={w.items} />;
        if (w.type === "web_sources") return <WebSourcesWidget key={i} items={w.items} />;
        return null;
      })}
    </div>
  );
}

function ImageGalleryWidget({ query, items }: { query: string; items: GalleryImage[] }) {
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-border/40 bg-white/5 p-3 text-xs text-muted-foreground">
        Aucune image trouvée pour « {query} ».
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <Images className="w-3.5 h-3.5 text-primary" />
        GALERIE · {items.length} image(s) — « {query} »
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map((img) => (
          <a
            key={img.id}
            href={img.page || img.full}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square rounded-lg overflow-hidden bg-black/20 border border-border/30 hover:border-primary/50 transition-all"
          >
            <img
              src={img.thumb}
              alt={img.tags || query}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {img.tags && (
              <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[9px] text-white/90 line-clamp-1">{img.tags}</p>
              </div>
            )}
          </a>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-2">Source : Pixabay · libre de droits</p>
    </div>
  );
}

function ImageWidget({ url, prompt }: { url: string; prompt: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
        <ImageIcon className="w-3.5 h-3.5 text-primary" />
        IMAGE GÉNÉRÉE
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={prompt} className="w-full max-h-[480px] object-contain rounded-lg bg-black/20" />
      </a>
      {prompt && <p className="text-[11px] text-muted-foreground mt-2 italic line-clamp-2">"{prompt}"</p>}
    </div>
  );
}

function WebSourcesWidget({ items }: { items: WebSource[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <Globe className="w-3.5 h-3.5 text-primary" />
        SOURCES WEB · {items.length}
      </div>
      <div className="space-y-2">
        {items.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 rounded-lg bg-background/40 hover:bg-background/60 border border-border/30 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-xs font-medium text-foreground line-clamp-1">{s.title}</h4>
              <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
            </div>
            {s.snippet && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{s.snippet}</p>}
            <p className="text-[10px] text-primary/70 mt-1 truncate">{new URL(s.url).hostname}</p>
          </a>
        ))}
      </div>
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