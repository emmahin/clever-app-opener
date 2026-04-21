const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

/**
 * Traduit une demande en langage naturel en actions de montage structurées.
 * Reçoit : prompt + résumé minimal de la timeline (id + nom + durée des clips).
 * Renvoie : { actions: [...], message: "..." }
 * Coût typique : ~200-400 tokens (vs 2000-5000 pour l'agent complet).
 */

const TOOL = {
  type: "function" as const,
  function: {
    name: "emit_actions",
    description: "Émet la liste d'actions de montage à appliquer sur la timeline.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Phrase courte (FR) qui résume ce que tu fais." },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["set_format", "trim", "reorder", "remove_clip", "add_text", "remove_text"],
              },
              clipId: { type: "string" },
              overlayId: { type: "string" },
              inPoint: { type: "number" },
              outPoint: { type: "number" },
              toIndex: { type: "integer" },
              text: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              size: { type: "number" },
              color: { type: "string" },
              preset: { type: "string", enum: ["youtube", "reels"] },
            },
            required: ["type"],
          },
        },
      },
      required: ["message", "actions"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, clips, preset } = await req.json();

    if (typeof prompt !== "string" || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "prompt requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Résumé MINIMAL de la timeline pour économiser les tokens
    const clipsSummary = (clips || [])
      .map((c: any, i: number) =>
        `[${i}] id=${c.id} "${c.name}" durée=${(c.duration ?? 0).toFixed(1)}s utilisé=${(c.inPoint ?? 0).toFixed(1)}-${(c.outPoint ?? 0).toFixed(1)}s`,
      )
      .join("\n");

    const system = `Tu traduis une demande utilisateur en JSON d'actions de montage vidéo.

Format actuel : ${preset || "youtube"} (${preset === "reels" ? "vertical 9:16, court" : "horizontal 16:9"}).
Timeline (${(clips || []).length} clip(s)) :
${clipsSummary || "(aucun clip importé)"}

RÈGLES :
- N'invente JAMAIS de clipId. Utilise UNIQUEMENT les id ci-dessus.
- Pour "monte tout seul" : applique trim raisonnable sur chaque clip (cap ~4s en Reels, ~12s en YouTube), ajoute un titre intro sur le 1er clip.
- Pour un changement de format : utilise set_format.
- Pour un trim précis : trim avec inPoint/outPoint en secondes ABSOLUES dans la source du clip.
- Coordonnées texte : x et y sont normalisés 0..1 (0.5 = centre).
- Si la demande est ambiguë ou impossible (ex : aucun clip), renvoie actions=[] et explique brièvement dans message.
- Réponds UNIQUEMENT via l'outil emit_actions.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "emit_actions" } },
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
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    let actions: any[] = [];
    let message = "OK";
    if (tc?.function?.arguments) {
      try {
        const parsed = JSON.parse(tc.function.arguments);
        actions = Array.isArray(parsed.actions) ? parsed.actions : [];
        message = typeof parsed.message === "string" ? parsed.message : message;
      } catch (e) {
        console.error("JSON parse failed", e);
      }
    }

    // Filtre : ne garder que les actions dont le clipId existe (ou pas de clipId)
    const validIds = new Set((clips || []).map((c: any) => c.id));
    actions = actions.filter((a) => !a.clipId || validIds.has(a.clipId));

    return new Response(JSON.stringify({ actions, message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("video-command-from-prompt error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});