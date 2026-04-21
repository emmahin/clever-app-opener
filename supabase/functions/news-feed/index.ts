const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FeedSource { name: string; url: string; category: string; }

const SOURCES: FeedSource[] = [
  // À la une
  { name: "Le Monde", url: "https://www.lemonde.fr/rss/une.xml", category: "À la une" },
  { name: "France Info", url: "https://www.francetvinfo.fr/titres.rss", category: "À la une" },
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", category: "À la une" },
  // Tech / IA
  { name: "Le Monde Pixels", url: "https://www.lemonde.fr/pixels/rss_full.xml", category: "Tech & IA" },
  { name: "BBC Tech", url: "https://feeds.bbci.co.uk/news/technology/rss.xml", category: "Tech & IA" },
  { name: "Wired", url: "https://www.wired.com/feed/tag/ai/latest/rss", category: "Tech & IA" },
  // Économie
  { name: "Les Echos", url: "https://services.lesechos.fr/rss/les-echos-tech-medias.xml", category: "Économie" },
  { name: "Le Monde Éco", url: "https://www.lemonde.fr/economie/rss_full.xml", category: "Économie" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "Économie" },
  // International
  { name: "Le Monde Intl", url: "https://www.lemonde.fr/international/rss_full.xml", category: "International" },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "International" },
];

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  let v = m[1].trim();
  v = v.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  return v;
}

function extractImage(block: string): string | null {
  // <media:content url="...">
  let m = block.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/i);
  if (m) return m[1];
  // <enclosure url="..." type="image/...">
  m = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image/i);
  if (m) return m[1];
  m = block.match(/<enclosure[^>]*type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i);
  if (m) return m[1];
  // <image><url>...</url></image>
  m = block.match(/<image>[\s\S]*?<url>([\s\S]*?)<\/url>/i);
  if (m) return m[1].trim();
  // <img src="..."> inside description / content:encoded
  m = block.match(/<img[^>]*src=["']([^"']+)["']/i);
  if (m) return m[1];
  return null;
}

function parseRss(xml: string, sourceName: string, category: string): any[] {
  const items: any[] = [];
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi;
  const matches = xml.match(itemRe) || [];
  for (const block of matches.slice(0, 10)) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const desc = extractTag(block, "description") || extractTag(block, "content:encoded") || "";
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date") || "";
    const image = extractImage(block);
    if (!title || !link) continue;
    items.push({
      id: `${sourceName}-${link}`,
      title: stripHtml(title),
      url: link.trim(),
      source: sourceName,
      category,
      image: image || undefined,
      summary: stripHtml(desc).slice(0, 200),
      publishedAt: pubDate,
      _ts: pubDate ? new Date(pubDate).getTime() : 0,
    });
  }
  return items;
}

function relativeTime(iso: string): string {
  if (!iso) return "récemment";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "récemment";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return `il y a ${Math.max(1, Math.round(diff / 60))} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  if (diff < 604800) return `il y a ${Math.round(diff / 86400)} j`;
  return d.toLocaleDateString("fr-FR");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const results = await Promise.allSettled(
      SOURCES.map(async (s) => {
        const r = await fetch(s.url, { headers: { "User-Agent": "Mozilla/5.0 NewsBot" } });
        if (!r.ok) throw new Error(`${s.name} ${r.status}`);
        return parseRss(await r.text(), s.name, s.category);
      })
    );
    const all: any[] = [];
    for (const res of results) {
      if (res.status === "fulfilled") all.push(...res.value);
      else console.warn("Feed failed:", res.reason);
    }
    all.sort((a, b) => b._ts - a._ts);
    const items = all.slice(0, 80).map(({ _ts, publishedAt, ...rest }) => ({
      ...rest,
      publishedAt: relativeTime(publishedAt),
    }));
    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("news-feed error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
