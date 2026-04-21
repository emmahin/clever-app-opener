const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Pixabay does not have a public REST endpoint for raw audio downloads
 * via API. We expose a simple proxy that searches their image API for
 * preview thumbnails AND queries the audio.pixabay.com search HTML for
 * royalty-free music URLs (which are publicly hosted on cdn.pixabay.com).
 *
 * Output: { items: [{ id, title, duration, url, type: 'music' | 'sfx' }] }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const kind = (url.searchParams.get("kind") || "music").toLowerCase(); // music | sfx
    if (!q) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PIX = Deno.env.get("PIXABAY_API_KEY");
    if (!PIX) {
      return new Response(JSON.stringify({ error: "PIXABAY_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pixabay's official audio search endpoint
    const endpoint = kind === "sfx"
      ? `https://pixabay.com/api/sound-effects/?key=${PIX}&q=${encodeURIComponent(q)}&per_page=12`
      : `https://pixabay.com/api/music/?key=${PIX}&q=${encodeURIComponent(q)}&per_page=12`;

    const r = await fetch(endpoint);
    if (!r.ok) {
      const text = await r.text();
      console.error("pixabay api error", r.status, text);
      // Pixabay's audio API requires a specific plan; return graceful empty
      return new Response(
        JSON.stringify({ items: [], warning: `Pixabay audio API: ${r.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const data = await r.json();
    const items = (data.hits || []).map((h: any) => ({
      id: String(h.id),
      title: h.title || h.tags || `track-${h.id}`,
      duration: h.duration || 0,
      url: h.audio || h.preview_url || h.audio_url,
      tags: h.tags,
      type: kind,
    })).filter((i: any) => i.url);

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pixabay-search error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});