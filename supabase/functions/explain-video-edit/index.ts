const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

/**
 * Explication pédagogique du montage local.
 * Reçoit uniquement les statistiques agrégées (~50-100 tokens d'entrée),
 * renvoie 3-5 phrases en français (~100 tokens de sortie).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { stats, rulesApplied, command } = await req.json();

    if (!stats || !Array.isArray(rulesApplied)) {
      return new Response(JSON.stringify({ error: "stats et rulesApplied requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = `L'utilisateur a demandé : "${command}"

Le moteur de montage LOCAL (gratuit, 0 token IA) a appliqué :
- Format : ${stats.preset}
- Clips : ${stats.clipsCount}
- Clips raccourcis : ${stats.clipsTrimmed}
- Textes ajoutés : ${stats.textsAdded}
- Clips supprimés : ${stats.removed}
- Changement de format : ${stats.formatChanged ? "oui" : "non"}
- Règles : ${rulesApplied.join(" ; ") || "aucune"}

Rédige une explication PÉDAGOGIQUE et CHALEUREUSE en français (3-5 phrases max) qui explique à l'utilisateur ce que le logiciel local a fait sur sa vidéo. Utilise des emojis avec parcimonie. Ne mentionne JAMAIS le mot "tokens" ni le coût.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant de montage vidéo. Tu expliques brièvement et clairement ce qu'un logiciel de montage local a fait sur la timeline de l'utilisateur.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Trop de requêtes." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("AI gateway error", r.status, t);
      return new Response(JSON.stringify({ error: "Erreur IA." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const explanation = data.choices?.[0]?.message?.content || "Montage appliqué avec succès.";

    return new Response(JSON.stringify({ explanation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("explain-video-edit error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});