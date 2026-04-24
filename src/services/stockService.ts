import { Stock } from "./types";

export interface IStockService {
  getTrending(tickers?: string[]): Promise<Stock[]>;
}

const STOCK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stock-data`;

// Cache local 5 min par jeu de tickers.
const TTL = 5 * 60 * 1000;
const cache = new Map<string, { at: number; stocks: Stock[] }>();

export const yahooStockService: IStockService = {
  async getTrending(tickers) {
    const key = tickers?.length ? tickers.slice().sort().join(",") : "__trending__";
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.stocks;
    try {
      const qs = tickers?.length ? `?tickers=${tickers.join(",")}` : "";
      const r = await fetch(`${STOCK_URL}${qs}`, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      if (!r.ok) throw new Error(`stock-data ${r.status}`);
      const data = await r.json();
      const stocks = (data.stocks as Stock[]) ?? [];
      cache.set(key, { at: Date.now(), stocks });
      return stocks;
    } catch (e) {
      console.error("stockService error:", e);
      return [];
    }
  },
};
