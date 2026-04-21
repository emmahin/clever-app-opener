const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VideoItem {
  id: string;
  provider: "youtube" | "vimeo" | "tiktok" | "instagram" | "twitter" | "direct";
  videoId?: string;
  title: string;
  author?: string;
  thumbnail?: string;
  embedUrl: string;
  pageUrl: string;
  duration?: string;
}

function detectProvider(url: string): VideoItem | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    // YouTube
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return baseYoutube(id, url);
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return baseYoutube(id, url);
    }
    if (host === "youtube.com" && u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      if (id) return baseYoutube(id, url);
    }

    // Vimeo
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) {
        return {
          id: `vimeo:${id}`,
          provider: "vimeo",
          videoId: id,
          title: `Vimeo · ${id}`,
          embedUrl: `https://player.vimeo.com/video/${id}`,
          pageUrl: url,
        };
      }
    }

    // TikTok
    if (host.endsWith("tiktok.com")) {
      const m = u.pathname.match(/\/video\/(\d+)/);
      if (m) {
        return {
          id: `tiktok:${m[1]}`,
          provider: "tiktok",
          videoId: m[1],
          title: "TikTok video",
          embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}`,
          pageUrl: url,
        };
      }
    }

    // Instagram (reel/post)
    if (host.endsWith("instagram.com")) {
      const m = u.pathname.match(/\/(reel|p|tv)\/([A-Za-z0-9_-]+)/);
      if (m) {
        return {
          id: `ig:${m[2]}`,
          provider: "instagram",
          videoId: m[2],
          title: "Instagram video",
          embedUrl: `https://www.instagram.com/${m[1]}/${m[2]}/embed`,
          pageUrl: url,
        };
      }
    }

    // Twitter / X
    if (host === "twitter.com" || host === "x.com") {
      const m = u.pathname.match(/\/status\/(\d+)/);
      if (m) {
        return {
          id: `tw:${m[1]}`,
          provider: "twitter",
          videoId: m[1],
          title: "Tweet vidéo",
          embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}`,
          pageUrl: url,
        };
      }
    }

    // Direct mp4/webm
    if (/\.(mp4|webm|mov)(\?|$)/i.test(u.pathname)) {
      return {
        id: `direct:${url}`,
        provider: "direct",
        title: u.pathname.split("/").pop() || "Vidéo",
        embedUrl: url,
        pageUrl: url,
      };
    }
  } catch { /* ignore */ }
  return null;
}

function baseYoutube(id: string, url: string): VideoItem {
  return {
    id: `yt:${id}`,
    provider: "youtube",
    videoId: id,
    title: `YouTube · ${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    pageUrl: url,
  };
}

async function enrichYoutube(item: VideoItem): Promise<VideoItem> {
  if (item.provider !== "youtube" || !item.videoId) return item;
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${item.videoId}`,
    );
    if (r.ok) {
      const j = await r.json();
      return {
        ...item,
        title: j.title || item.title,
        author: j.author_name,
        thumbnail: j.thumbnail_url || item.thumbnail,
      };
    }
  } catch { /* ignore */ }
  return item;
}

async function searchYoutube(query: string, count: number): Promise<VideoItem[]> {
  const html = await fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    },
  ).then((r) => r.text());

  // Extract first ytInitialData JSON
  const m = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/);
  const items: VideoItem[] = [];
  const seen = new Set<string>();

  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const sections =
        data.contents?.twoColumnSearchResultsRenderer?.primaryContents
          ?.sectionListRenderer?.contents || [];
      for (const sec of sections) {
        const list = sec.itemSectionRenderer?.contents || [];
        for (const it of list) {
          const v = it.videoRenderer;
          if (!v?.videoId || seen.has(v.videoId)) continue;
          seen.add(v.videoId);
          const title =
            v.title?.runs?.[0]?.text || v.title?.simpleText || "Vidéo YouTube";
          const author =
            v.ownerText?.runs?.[0]?.text ||
            v.longBylineText?.runs?.[0]?.text;
          const duration =
            v.lengthText?.simpleText || v.lengthText?.accessibility?.accessibilityData?.label;
          const thumb =
            v.thumbnail?.thumbnails?.[v.thumbnail.thumbnails.length - 1]?.url ||
            `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
          items.push({
            id: `yt:${v.videoId}`,
            provider: "youtube",
            videoId: v.videoId,
            title,
            author,
            duration,
            thumbnail: thumb,
            embedUrl: `https://www.youtube-nocookie.com/embed/${v.videoId}?rel=0`,
            pageUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
          });
          if (items.length >= count) break;
        }
        if (items.length >= count) break;
      }
    } catch (e) {
      console.error("ytInitialData parse error", e);
    }
  }

  // Fallback simple regex if structured parse failed
  if (items.length === 0) {
    const re = /"videoId":"([A-Za-z0-9_-]{11})"/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(html)) && items.length < count) {
      if (seen.has(mm[1])) continue;
      seen.add(mm[1]);
      items.push(baseYoutube(mm[1], `https://www.youtube.com/watch?v=${mm[1]}`));
    }
  }

  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const directUrl = url.searchParams.get("url");
    const query = url.searchParams.get("q");
    const count = Math.min(8, Math.max(1, parseInt(url.searchParams.get("count") || "4", 10)));

    // Direct URL → return single embedded item
    if (directUrl) {
      const item = detectProvider(directUrl);
      if (!item) {
        return new Response(JSON.stringify({ items: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const enriched = await enrichYoutube(item);
      return new Response(JSON.stringify({ items: [enriched] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Search query → YouTube
    if (query) {
      const items = await searchYoutube(query, count);
      return new Response(JSON.stringify({ items, query }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Missing q or url parameter" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("video-search error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});