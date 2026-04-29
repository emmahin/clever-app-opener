import { ChatWidget, ChartSpec, ChartSeries, NewsItem, Stock, WebSource, GalleryImage, VideoItem } from "@/services";
import { Component, ReactNode, useState } from "react";
import { ExternalLink, Newspaper, TrendingUp, TrendingDown, BarChart3, Globe, ImageIcon, Images, Video, PlayCircle, LineChart as LineChartIcon } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WhatsAppSendWidget } from "./WhatsAppSendWidget";
import { ReminderWidget } from "./widgets/ReminderWidget";
import { InsightWidget } from "./widgets/InsightWidget";
import { ScheduleWidget } from "./widgets/ScheduleWidget";
import { OpenAppWidget } from "./widgets/OpenAppWidget";
import { LocalAppLaunchWidget } from "./widgets/LocalAppLaunchWidget";
import { OrganizeFilesWidget } from "./widgets/OrganizeFilesWidget";
import { N8nTriggerWidget } from "./widgets/N8nTriggerWidget";

export function MessageWidgets({ widgets, messageId }: { widgets: ChatWidget[]; messageId?: string }) {
  if (!widgets?.length) return null;
  return (
    <div className="space-y-4 mt-3">
      {widgets.map((w, i) => {
        if (w.type === "open_app") {
          console.debug("[nex:message-widgets] open_app widget received", { index: i, widget: w });
        }
        if (w.type === "launch_local_app") {
          console.debug("[nex:message-widgets] launch_local_app widget received", { index: i, widget: w });
        }
        const node = renderWidget(w, i, messageId);
        if (!node) return null;
        return (
          <WidgetErrorBoundary key={i} widgetType={w.type}>
            {node}
          </WidgetErrorBoundary>
        );
      })}
    </div>
  );
}

function renderWidget(w: ChatWidget, i: number, messageId?: string): ReactNode {
  if (w.type === "news") return <NewsWidget items={w.items} />;
  if (w.type === "stocks") return <StocksWidget items={w.items} />;
  if (w.type === "image") return <ImageWidget url={w.url} prompt={w.prompt} />;
  if (w.type === "image_gallery") return <ImageGalleryWidget query={w.query} items={w.items} />;
  if (w.type === "videos") return <VideosWidget query={w.query} items={w.items} />;
  if (w.type === "web_sources") return <WebSourcesWidget items={w.items} />;
  if (w.type === "chart") return <ChartWidget chart={w.chart} />;
  if (w.type === "whatsapp_send") return <WhatsAppSendWidget contact_name={w.contact_name} body={w.body} />;
  if (w.type === "reminder_created") return <ReminderWidget title={w.title} body={w.body} when_iso={w.when_iso} />;
  if (w.type === "insight_created") return <InsightWidget title={w.title} body={w.body} />;
  if (w.type === "open_app") {
    return w.kind === "deeplink" ? (
      <LocalAppLaunchWidget target={w.app_name || w.target} label={w.app_name} />
    ) : (
      <OpenAppWidget
        app_name={w.app_name}
        kind={w.kind}
        target={w.target}
        fallback_url={w.fallback_url}
        auto_opened={w.auto_opened}
      />
    );
  }
  if (w.type === "launch_local_app") {
    return <LocalAppLaunchWidget target={w.target} args={w.args} label={w.label} />;
  }
  if (w.type === "n8n_trigger") {
    return <N8nTriggerWidget action={w.action} params={w.params} label={w.label} />;
  }
  if (w.type === "organize_files") {
    return (
      <OrganizeFilesWidget
        root_name={w.root_name}
        total={w.total}
        categories={w.categories}
        mapping={w.mapping}
        explanation={w.explanation}
        messageId={w.messageId || messageId}
      />
    );
  }
  if (w.type === "schedule") {
    return (
      <ScheduleWidget
        range_label={w.range_label}
        range_start_iso={w.range_start_iso}
        range_end_iso={w.range_end_iso}
        added={w.added}
        remove_query={w.remove_query}
      />
    );
  }
  return null;
}

/**
 * Évite qu'un widget qui crash (props inattendues, URL invalide…) ne fasse planter
 * tout l'écran de chat (page violette gelée). On affiche un mini-message à la place.
 */
class WidgetErrorBoundary extends Component<
  { children: ReactNode; widgetType: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[nex:widget-error-boundary] widget crashed", {
      widgetType: this.props.widgetType,
      message: error?.message,
      info,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          ⚠️ Impossible d'afficher ce contenu ({this.props.widgetType}).
          {this.state.error.message ? (
            <span className="block mt-1 font-mono text-[10px] opacity-70">
              {this.state.error.message}
            </span>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
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

function providerLabel(p: VideoItem["provider"]): string {
  return {
    youtube: "YouTube",
    vimeo: "Vimeo",
    tiktok: "TikTok",
    instagram: "Instagram",
    twitter: "X (Twitter)",
    direct: "Vidéo",
  }[p];
}

function VideoCard({ v }: { v: VideoItem }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="rounded-lg overflow-hidden border border-border/30 bg-background/40 hover:border-primary/50 transition-colors flex flex-col">
      <div className="relative aspect-video bg-black">
        {playing ? (
          v.provider === "direct" ? (
            <video
              src={v.embedUrl}
              controls
              autoPlay
              className="w-full h-full"
            />
          ) : (
            <iframe
              src={`${v.embedUrl}${v.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
              title={v.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="w-full h-full"
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group relative w-full h-full"
            aria-label={`Lire ${v.title}`}
          >
            {v.thumbnail ? (
              <img
                src={v.thumbnail}
                alt={v.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-fuchsia-500/30" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
              <PlayCircle className="w-12 h-12 text-white drop-shadow-lg group-hover:scale-110 transition-transform" />
            </div>
            {v.duration && (
              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono">
                {v.duration}
              </span>
            )}
            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] uppercase tracking-wide">
              {providerLabel(v.provider)}
            </span>
          </button>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-1">
        <h4 className="text-xs font-medium text-foreground line-clamp-2">{v.title}</h4>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="truncate">{v.author || providerLabel(v.provider)}</span>
          <a
            href={v.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-primary/80 hover:text-primary"
          >
            Source <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function VideosWidget({ query, items }: { query?: string; items: VideoItem[] }) {
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-border/40 bg-white/5 p-3 text-xs text-muted-foreground">
        Aucune vidéo trouvée{query ? ` pour « ${query} »` : ""}.
      </div>
    );
  }
  const single = items.length === 1;
  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <Video className="w-3.5 h-3.5 text-primary" />
        VIDÉO{items.length > 1 ? "S" : ""} · {items.length}
        {query ? ` — « ${query} »` : ""}
      </div>
      <div
        className={
          single
            ? "max-w-2xl mx-auto"
            : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        }
      >
        {items.map((v) => (
          <VideoCard key={v.id} v={v} />
        ))}
      </div>
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
    <div className="rounded-2xl border border-border/40 bg-white/5 p-4">
      <div className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Newspaper className="w-4 h-4 text-primary" />
        Actualités
        <span className="text-xs text-muted-foreground font-normal">· {items.length} articles</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin">
        {items.map((n) => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex-shrink-0 w-72 snap-start glass rounded-2xl overflow-hidden border border-border/40 hover:border-primary/50 transition-all hover:-translate-y-0.5"
          >
            <div className="aspect-video bg-gradient-to-br from-primary/20 to-fuchsia-500/20 overflow-hidden relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <Newspaper className="w-10 h-10 text-white/30" />
              </div>
              {n.image && (
                <img
                  src={n.image}
                  alt={n.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="relative w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              )}
            </div>
            <div className="p-3">
              <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                {n.title}
              </h4>
              {n.summary && (
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{n.summary}</p>
              )}
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground/70">
                <span className="font-medium">{n.source}</span>
                <span>{n.publishedAt}</span>
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
              <div className="h-28 -mx-1 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={s.series} margin={{ top: 6, right: 12, left: 2, bottom: 2 }}>
                    <defs>
                      <marker id={`mwAx-${s.symbol}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 z" fill="hsl(250, 15%, 55%)" />
                      </marker>
                      <marker id={`mwAy-${s.symbol}`} viewBox="0 0 10 10" refX="5" refY="2" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                        <path d="M0,10 L5,0 L10,10 z" fill="hsl(250, 15%, 55%)" />
                      </marker>
                    </defs>
                    <CartesianGrid stroke="hsl(250, 15%, 45% / 0.22)" strokeWidth={0.5} />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "hsl(250, 15%, 70%)", fontSize: 8 }}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(250, 15%, 55%)", strokeWidth: 1, markerEnd: `url(#mwAx-${s.symbol})` }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "hsl(250, 15%, 70%)", fontSize: 8 }}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(250, 15%, 55%)", strokeWidth: 1, markerEnd: `url(#mwAy-${s.symbol})` }}
                      width={24}
                      domain={["auto", "auto"]}
                    />
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
                    <Line type="monotone" dataKey="close" stroke={stroke} strokeWidth={2} dot={{ fill: stroke, stroke: stroke, r: 2.5 }} activeDot={{ r: 3.5 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// Theme-aligned palette using HSL semantic tokens (cycles for multi-series).
const CHART_PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(142, 76%, 60%)",
  "hsl(38, 92%, 60%)",
  "hsl(280, 70%, 65%)",
  "hsl(190, 80%, 55%)",
  "hsl(0, 75%, 65%)",
];

function ChartWidget({ chart }: { chart: ChartSpec }) {
  const data = Array.isArray(chart?.data) ? chart.data : [];
  if (!data.length) {
    return (
      <div className="rounded-xl border border-border/40 bg-white/5 p-3 text-xs text-muted-foreground">
        Aucune donnée pour le graphique.
      </div>
    );
  }

  const xKey = chart.xKey || Object.keys(data[0]).find((k) => typeof data[0][k] === "string") || "x";

  // Auto-detect series for line/bar/area if not provided: any numeric key except xKey.
  const inferredSeries: ChartSeries[] =
    chart.series && chart.series.length
      ? chart.series
      : Object.keys(data[0])
          .filter((k) => k !== xKey && typeof data[0][k] === "number")
          .map((name) => ({ name }));

  const tooltipStyle = {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "11px",
    color: "hsl(var(--popover-foreground))",
  } as const;
  const axisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 10 };
  const grid = "hsl(var(--border) / 0.5)";

  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-2">
        <LineChartIcon className="w-3.5 h-3.5 text-primary" />
        {chart.title?.toUpperCase() || `GRAPHIQUE · ${chart.kind.toUpperCase()}`}
      </div>
      {chart.subtitle && <p className="text-[10px] text-muted-foreground/80 mb-2">{chart.subtitle}</p>}
      <div className="h-64 -mx-1 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chart.kind === "pie" ? (
            <PieChart>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                outerRadius={80}
                innerRadius={30}
                paddingAngle={2}
                isAnimationActive={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : chart.kind === "bar" ? (
            <BarChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey={xKey} tick={axisTick} tickLine={false} />
              <YAxis tick={axisTick} tickLine={false} width={32} label={chart.yLabel ? { value: chart.yLabel, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 } : undefined} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
              {inferredSeries.map((s, i) => (
                <Bar key={s.name} dataKey={s.name} fill={s.color || CHART_PALETTE[i % CHART_PALETTE.length]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          ) : chart.kind === "area" ? (
            <AreaChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey={xKey} tick={axisTick} tickLine={false} />
              <YAxis tick={axisTick} tickLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
              {inferredSeries.map((s, i) => {
                const color = s.color || CHART_PALETTE[i % CHART_PALETTE.length];
                return (
                  <Area
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.25}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                );
              })}
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey={xKey} tick={axisTick} tickLine={false} />
              <YAxis tick={axisTick} tickLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
              {inferredSeries.map((s, i) => {
                const color = s.color || CHART_PALETTE[i % CHART_PALETTE.length];
                return (
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stroke={color}
                    strokeWidth={2}
                    dot={{ fill: color, r: 2.5 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}