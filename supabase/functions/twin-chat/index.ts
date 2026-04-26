const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Twin chat — Lovable AI Gateway avec tool calling.
 * L'agent peut appeler `remember_fact` et `add_schedule_event` pour stocker
 * des données. Le client exécute les tools côté navigateur (accès direct DB
 * via Supabase + RLS user) puis renvoie la réponse au LLM dans la prochaine
 * requête s'il faut continuer.
 *
 * Format simple : non-streaming. On retourne le `message` complet (texte +
 * éventuels `tool_calls`).
 */

const SYSTEM_PROMPT = `Tu es le double numérique de l'utilisateur — un coach personnel chaleureux, attentif et proche, qui parle à voix haute en français naturel (style oral, contractions, pauses, phrases courtes).

Ton rôle :
• Écouter activement, reformuler, poser des questions ouvertes.
• Aider à clarifier les pensées, identifier les habitudes, fixer des objectifs.
• Détecter les habitudes / préférences importantes mentionnées et les enregistrer via remember_fact (sans demander confirmation, tu confirmes brièvement à l'oral).
• N'AJOUTE JAMAIS d'événement à l'agenda et ne crée JAMAIS de règle d'emploi du temps récurrente, même si l'utilisateur mentionne un horaire ou une activité régulière. L'agenda est géré uniquement à la main par l'utilisateur depuis l'écran Agenda. Si tu penses qu'un événement mériterait d'être noté, suggère-le simplement à l'oral ("tu pourrais l'ajouter à ton agenda si tu veux") sans rien créer.

Style oral STRICT (très important — ta réponse est lue par une voix de synthèse) :
• Écris UNIQUEMENT du texte brut, comme un humain qui parle. Aucune mise en forme.
• INTERDIT : étoiles (*), dièses (#), underscores (_), backticks (\`), tirets de liste, puces, titres, gras, italique, markdown, émojis, code.
• Pas de listes : si tu dois énumérer, utilise « d'abord, ensuite, enfin » dans une phrase.
• Phrases courtes, complètes, avec ponctuation naturelle (. , ? ! …).
• Contractions et style oral : « j'crois », « t'as », « ouais », « bon », « eh bien ».
• Pas plus de 2-3 phrases, sauf si on te demande de développer.
• Tu peux utiliser "…" pour marquer une pause naturelle.
• Réponds UNIQUEMENT en français.`;

const tools = [
  {
    type: "function",
    function: {
      name: "remember_fact",
      description: "Enregistre une habitude, préférence, objectif, fait personnel, émotion ou relation importante à propos de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Le fait à mémoriser, formulé clairement à la 3e personne (ex: 'médite 10 min chaque matin')." },
          category: {
            type: "string",
            enum: ["habit", "preference", "goal", "fact", "emotion", "relationship"],
            description: "Type de souvenir.",
          },
          importance: { type: "number", description: "1 (anodin) à 5 (capital). Défaut 3.", minimum: 1, maximum: 5 },
        },
        required: ["content", "category"],
        additionalProperties: false,
      },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const memoriesContext: string = typeof body?.memoriesContext === "string" ? body.memoriesContext : "";
    const eventsContext: string = typeof body?.eventsContext === "string" ? body.eventsContext : "";
    const tz = typeof body?.timezone === "string" && body.timezone ? body.timezone : "UTC";
    // Date/heure locale lisible pour aider à résoudre "demain", "mardi", "ce soir", etc.
    const now = new Date();
    const nowIsoUtc = now.toISOString();
    let nowLocal = nowIsoUtc;
    try {
      nowLocal = new Intl.DateTimeFormat("fr-FR", {
        timeZone: tz,
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(now);
    } catch { /* fallback UTC */ }

    const systemFull = `${SYSTEM_PROMPT}

Date et heure actuelles : ${nowLocal} (fuseau ${tz}). En UTC : ${nowIsoUtc}.
Utilise toujours cette date pour interpréter "aujourd'hui", "demain", "ce soir", "lundi prochain", etc.

Mémoire à long terme de l'utilisateur :
${memoriesContext || "(vide pour l'instant)"}

Agenda à venir :
${eventsContext || "(rien de prévu)"}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemFull },
          ...messages,
        ],
        tools,
        tool_choice: "auto",
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("twin-chat AI error:", resp.status, t);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requêtes atteinte. Réessayez dans une minute." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA Lovable épuisés. Ajoutez des fonds dans Settings → Workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `AI gateway error ${resp.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const message = data?.choices?.[0]?.message ?? { role: "assistant", content: "" };
    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("twin-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});