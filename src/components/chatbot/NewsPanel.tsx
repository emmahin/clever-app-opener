import { useEffect, useState } from "react";
import { newsService, NewsItem } from "@/services";
import { ExternalLink } from "lucide-react";

export function NewsPanel() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    newsService.getLatest().then((items) => {
      setNews(items);
      setLoading(false);
    });
  }, []);

  return (
    <div className="glass rounded-2xl p-4 flex-1 min-h-0 overflow-y-auto">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Dernières actus
      </h3>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                  {item.title}
                </h4>
                <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {item.summary}
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground/70">
                <span>{item.source}</span>
                <span>·</span>
                <span>{item.publishedAt}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
