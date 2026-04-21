const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Recherche d'images via Pixabay (gratuit, 0 token IA).
 * Renvoie : { items: [{ id, thumb, full, page, tags, user }] }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const perPage = Math.min(20, parseInt(url.searchParams.get("per_page") || "8", 10));

    if (!q) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PIX = Deno.env.get("PIXABAY_API_KEY");
    if (!PIX) {
      return new Response(JSON.stringify({ error: "PIXABAY_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const endpoint = `https://pixabay.com/api/?key=${PIX}&q=${encodeURIComponent(q)}&per_page=${perPage}&image_type=photo&safesearch=true`;
    const r = await fetch(endpoint);
    if (!r.ok) {
      const text = await r.text();
      console.error("pixabay images error", r.status, text);
      return new Response(JSON.stringify({ items: [], warning: `Pixabay: ${r.status}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await r.json();
    const items = (data.hits || []).map((h: any) => ({
      id: String(h.id),
      thumb: h.webformatURL || h.previewURL,
      full: h.largeImageURL || h.webformatURL,
      page: h.pageURL,
      tags: h.tags,
      user: h.user,
      width: h.imageWidth,
      height: h.imageHeight,
    })).filter((i: any) => i.thumb);

    return new Response(JSON.stringify({ items, query: q }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("image-search error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});