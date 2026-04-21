import { NewsItem } from "./types";

export interface INewsService {
  getLatest(): Promise<NewsItem[]>;
}

const NEWS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feed`;

export const rssNewsService: INewsService = {
  async getLatest() {
    try {
      const r = await fetch(NEWS_URL, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      if (!r.ok) throw new Error(`news-feed ${r.status}`);
      const data = await r.json();
      return (data.items as NewsItem[]) ?? [];
    } catch (e) {
      console.error("newsService error:", e);
      return [];
    }
  },
};
