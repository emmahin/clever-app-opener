import { Stock } from "./types";

export interface IStockService {
  getTrending(tickers?: string[]): Promise<Stock[]>;
}

const STOCK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stock-data`;

export const yahooStockService: IStockService = {
  async getTrending(tickers) {
    try {
      const qs = tickers?.length ? `?tickers=${tickers.join(",")}` : "";
      const r = await fetch(`${STOCK_URL}${qs}`, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      if (!r.ok) throw new Error(`stock-data ${r.status}`);
      const data = await r.json();
      return (data.stocks as Stock[]) ?? [];
    } catch (e) {
      console.error("stockService error:", e);
      return [];
    }
  },
};
