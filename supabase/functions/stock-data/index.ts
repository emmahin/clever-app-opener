const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Top "capital qui explose" — IA, semi-conducteurs, tech à forte croissance
const DEFAULT_TICKERS: { symbol: string; name: string }[] = [
  { symbol: "NVDA", name: "Nvidia" },
  { symbol: "PLTR", name: "Palantir" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "META", name: "Meta" },
  { symbol: "AMD", name: "AMD" },
  { symbol: "MSFT", name: "Microsoft" },
];

async function fetchYahoo(symbol: string) {
  // 6 mois, données journalières
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=6mo&interval=1d`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Yahoo ${symbol} ${r.status}`);
  const data = await r.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  const timestamps: number[] = result.timestamp || [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
  const series = timestamps.map((t, i) => ({
    date: new Date(t * 1000).toISOString().slice(0, 10),
    close: closes[i],
  })).filter((p) => p.close != null);

  const meta = result.meta || {};
  const first = series[0]?.close ?? 0;
  const last = series[series.length - 1]?.close ?? 0;
  const changePct = first ? ((last - first) / first) * 100 : 0;

  return {
    symbol,
    currency: meta.currency || "USD",
    price: last,
    changePct,
    series,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const tickersParam = url.searchParams.get("tickers");
    const tickers = tickersParam
      ? tickersParam.split(",").map((s) => ({ symbol: s.trim().toUpperCase(), name: s.trim().toUpperCase() }))
      : DEFAULT_TICKERS;

    const results = await Promise.allSettled(tickers.map((t) => fetchYahoo(t.symbol)));
    const stocks = results.map((res, i) => {
      const meta = tickers[i];
      if (res.status === "fulfilled") {
        return { ...res.value, name: meta.name };
      }
      console.warn("ticker failed:", meta.symbol, res.reason);
      return null;
    }).filter(Boolean);

    // Trier par perf 6 mois desc
    stocks.sort((a: any, b: any) => b.changePct - a.changePct);

    return new Response(JSON.stringify({ stocks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stock-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
