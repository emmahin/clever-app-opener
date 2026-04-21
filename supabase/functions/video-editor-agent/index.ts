const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Conversational video-editing agent.
 * Receives the current timeline state + user message, returns a textual
 * answer + a list of "actions" (tool calls) that the client must apply
 * to its in-memory timeline.
 *
 * Action types (the client reducer knows them):
 *  - { type: "trim", clipId, inPoint?, outPoint? }
 *  - { type: "reorder", clipId, toIndex }
 *  - { type: "remove_clip", clipId }
 *  - { type: "add_text", clipId, text, x?, y?, size?, color? }
 *  - { type: "remove_text", clipId, overlayId }
 *  - { type: "add_audio_url", url, title, kind }
 *  - { type: "set_format", preset } // "youtube" | "reels"
 */

const TOOLS = [
  {
    type: "function",
    function: {
      name: "apply_actions",
      description:
        "Modifie la timeline du monteur. Appelle UNE SEULE FOIS avec toutes les actions à appliquer.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Court message à afficher à l'utilisateur (FR, 1-3 phrases).",
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "trim",
                    "reorder",
                    "remove_clip",
                    "add_text",
                    "remove_text",
                    "add_audio_url",
                    "set_format",
                  ],
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
                url: { type: "string" },
                title: { type: "string" },
                kind: { type: "string", enum: ["music", "sfx"] },
                preset: { type: "string", enum: ["youtube", "reels"] },
              },
              required: ["type"],
            },
          },
        },
        required: ["message", "actions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_pixabay_audio",
      description:
        "Cherche un son ou une musique libre de droits sur Pixabay. Renvoie une liste, à toi d'en choisir un et de l'ajouter via apply_actions/add_audio_url.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Mots-clés (ex: 'cinematic intro', 'whoosh')" },
          kind: { type: "string", enum: ["music", "sfx"], description: "Type de son" },
        },
        required: ["q", "kind"],
      },
    },
  },
];

function buildSystem(state: any): string {
  const preset = state?.preset || "youtube";
  const clips = (state?.clips || []) as any[];
  const audios = (state?.audios || []) as any[];
  return `Tu es un monteur vidéo IA expert. Tu aides l'utilisateur à monter sa vidéo en discutant avec lui ET en modifiant directement sa timeline via l'outil apply_actions.

FORMAT CIBLE: ${preset === "reels" ? "Reels/Shorts vertical 9:16, court (15-60s)" : "YouTube horizontal 16:9, plusieurs minutes"}.

ÉTAT ACTUEL DE LA TIMELINE:
- ${clips.length} clip(s) vidéo : ${clips.map((c, i) => `[${i}] id=${c.id} "${c.name}" durée_source=${c.duration?.toFixed?.(1)}s utilisé=${c.inPoint?.toFixed?.(1)}→${c.outPoint?.toFixed?.(1)}s, ${c.overlays?.length || 0} texte(s)`).join(" | ") || "aucun"}
- ${audios.length} piste(s) audio : ${audios.map((a) => `"${a.title}"`).join(", ") || "aucune"}

RÈGLES :
1. Tu réponds en français, bref et précis.
2. Pour MODIFIER la timeline, appelle TOUJOURS apply_actions avec un tableau d'actions.
3. Pour AJOUTER une musique/SFX, appelle d'abord search_pixabay_audio puis apply_actions avec add_audio_url.
4. Si l'utilisateur dit "monte tout seul", crée un montage cohérent : ordonne les clips, propose des coupes, ajoute du texte d'intro, suggère une musique.
5. Si tu ne peux pas faire quelque chose (ex: pas de clips importés), explique-le clairement sans appeler d'outil.
6. Sois concis, ne réécris jamais l'état complet.`;
}

async function searchPixabay(q: string, kind: string) {
  const r = await fetch(
    `${SUPABASE_URL}/functions/v1/pixabay-search?q=${encodeURIComponent(q)}&kind=${kind}`,
    { headers: { Authorization: `Bearer ${ANON}` } },
  );
  if (!r.ok) return { items: [] };
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messages, state } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SYSTEM = buildSystem(state);
    const conv: any[] = [{ role: "system", content: SYSTEM }, ...messages];

    // Loop up to 3 turns to allow search → apply
    for (let turn = 0; turn < 3; turn++) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: conv,
          tools: TOOLS,
          tool_choice: "auto",
        }),
      });

      if (r.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (r.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!r.ok) {
        const t = await r.text();
        console.error("AI error", r.status, t);
        return new Response(JSON.stringify({ error: "Erreur IA." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await r.json();
      const msg = data.choices?.[0]?.message;
      const calls = msg?.tool_calls || [];

      if (!calls.length) {
        // Plain answer, no actions
        return new Response(
          JSON.stringify({ message: msg?.content || "OK", actions: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Execute tool calls
      let finalMessage = msg?.content || "";
      let finalActions: any[] = [];
      const toolResults: any[] = [];

      for (const tc of calls) {
        const name = tc.function?.name;
        const args = JSON.parse(tc.function?.arguments || "{}");
        if (name === "apply_actions") {
          finalMessage = args.message || finalMessage;
          finalActions = args.actions || [];
          // Done — return immediately
          return new Response(
            JSON.stringify({ message: finalMessage, actions: finalActions }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (name === "search_pixabay_audio") {
          const res = await searchPixabay(args.q, args.kind);
          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(res),
          });
        }
      }

      // Continue conversation with tool results
      conv.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: calls,
      });
      conv.push(...toolResults);
    }

    return new Response(
      JSON.stringify({ message: "Je n'ai pas pu finaliser l'action.", actions: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("video-editor-agent error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});