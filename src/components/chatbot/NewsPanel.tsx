import { useEffect, useMemo, useState } from "react";
import { newsService, NewsItem } from "@/services";
import { ExternalLink, Newspaper, Loader2 } from "lucide-react";
import { useTranslatedNews } from "@/hooks/useTranslatedNews";
import { useLanguage } from "@/i18n/LanguageProvider";

interface NewsPanelProps {
  layout?: "vertical" | "horizontal";
  /** Max items per category row (horizontal layout) */
  perRowLimit?: number;
}

export function NewsPanel({ layout = "vertical", perRowLimit = 12 }: NewsPanelProps = {}) {
  const [rawNews, setRawNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { news, translating } = useTranslatedNews(rawNews);
  const { t } = useLanguage();

  useEffect(() => {
    newsService.getLatest().then((items) => {
      setRawNews(items);
      setLoading(false);
    });
  }, []);

  const grouped = useMemo(() => {
    const ORDER = ["À la une", "Tech & IA", "Économie", "International"];
    const CAT_KEY: Record<string, "cat_top" | "cat_tech" | "cat_econ" | "cat_intl"> = {
      "À la une": "cat_top",
      "Tech & IA": "cat_tech",
      "Économie": "cat_econ",
      "International": "cat_intl",
    };
    const map = new Map<string, NewsItem[]>();
    for (const n of news) {
      const rawCat = n.category || "Actualités";
      const key = CAT_KEY[rawCat];
      const cat = key ? t(key) : t("cat_default");
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(n);
    }
    const ORDER_TRANSLATED = [t("cat_top"), t("cat_tech"), t("cat_econ"), t("cat_intl")];
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const ia = ORDER_TRANSLATED.indexOf(a);
        const ib = ORDER_TRANSLATED.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([cat, items]) => [cat, items.slice(0, perRowLimit)] as const);
  }, [news, perRowLimit, t]);

  if (layout === "vertical") {
    return (
      <div className="glass rounded-2xl p-4 flex-1 min-h-0 overflow-y-auto">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          {t("latestNews")}
          {translating && <Loader2 className="w-3 h-3 ml-1 animate-spin opacity-60" />}
        </h3>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {news.slice(0, 8).map((item) => (
              <NewsCardCompact key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Horizontal layout: one row per category
  return (
    <div className="space-y-6">
      {translating && (
        <div className="text-xs text-muted-foreground flex items-center gap-2 px-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t("translating")}
        </div>
      )}
      {loading
        ? [...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="h-5 w-40 bg-white/5 rounded mb-3 animate-pulse" />
              <div className="flex gap-4 overflow-hidden">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="w-72 h-56 bg-white/5 rounded-2xl animate-pulse flex-shrink-0" />
                ))}
              </div>
            </div>
          ))
        : grouped.map(([category, items]) => (
            <section key={category}>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2 px-1">
                <Newspaper className="w-4 h-4 text-primary" />
                {category}
                <span className="text-xs text-muted-foreground font-normal">· {items.length} {t("articles")}</span>
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin">
                {items.map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex-shrink-0 w-72 snap-start glass rounded-2xl overflow-hidden border border-border/40 hover:border-primary/50 transition-all hover:-translate-y-0.5"
    >
      <div className="aspect-video bg-gradient-to-br from-primary/20 to-fuchsia-500/20 overflow-hidden relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <Newspaper className="w-10 h-10 text-white/30" />
        </div>
        {item.image && (
          <img
            src={item.image}
            alt={item.title}
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
          {item.title}
        </h4>
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{item.summary}</p>
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground/70">
          <span className="font-medium">{item.source}</span>
          <span>{item.publishedAt}</span>
        </div>
      </div>
    </a>
  );
}

function NewsCardCompact({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group"
    >
      <div className="flex gap-3">
        {item.image && (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-white/5"
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
              {item.title}
            </h4>
            <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground/70">
            <span>{item.source}</span>
            <span>·</span>
            <span>{item.publishedAt}</span>
          </div>
        </div>
      </div>
    </a>
  );
}