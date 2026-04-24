import { NewsItem } from "./types";

export interface INewsService {
  getLatest(): Promise<NewsItem[]>;
}

const NEWS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feed`;

// Cache local 5 min : évite de relancer l'edge function (et donc l'IA en aval) trop souvent.
const TTL = 5 * 60 * 1000;
let cache: { at: number; items: NewsItem[] } | null = null;

export const rssNewsService: INewsService = {
  async getLatest() {
    if (cache && Date.now() - cache.at < TTL) return cache.items;
    try {
      const r = await fetch(NEWS_URL, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      if (!r.ok) throw new Error(`news-feed ${r.status}`);
      const data = await r.json();
      const items = (data.items as NewsItem[]) ?? [];
      cache = { at: Date.now(), items };
      return items;
    } catch (e) {
      console.error("newsService error:", e);
      return [];
    }
  },
};
