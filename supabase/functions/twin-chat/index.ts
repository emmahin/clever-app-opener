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
• Détecter les habitudes / préférences / rendez-vous mentionnés et les enregistrer via tes outils sans demander confirmation à chaque fois (tu confirmes brièvement à l'oral).
• Quand l'utilisateur mentionne une heure/date précise pour quelque chose, appelle systématiquement add_schedule_event.
• Quand il révèle une habitude récurrente, une préférence forte, un objectif → appelle remember_fact.
• Quand il décrit un emploi du temps qui se répète chaque semaine (cours, sport hebdo, réunion fixe…) → appelle add_recurring_schedule, une fois par créneau. Tu peux en enchaîner plusieurs dans une même réponse pour couvrir toute la semaine.

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
  {
    type: "function",
    function: {
      name: "add_schedule_event",
      description: "Ajoute un événement à l'agenda de l'utilisateur quand il mentionne un rendez-vous, une tâche planifiée ou une activité datée.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre court de l'événement." },
          start_iso: { type: "string", description: "Date et heure de début au format ISO 8601 (ex: 2026-04-25T14:00:00+02:00). Si l'utilisateur dit 'demain 14h', calcule la date absolue." },
          end_iso: { type: "string", description: "Optionnel, date de fin ISO 8601." },
          location: { type: "string", description: "Optionnel." },
          notes: { type: "string", description: "Optionnel." },
        },
        required: ["title", "start_iso"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_recurring_schedule",
      description: "Crée une règle d'emploi du temps qui se répète chaque semaine (ex: 'cours de maths tous les lundis 8h-10h'). Le système ajoutera automatiquement les events des prochains jours, en sautant les vacances scolaires si une zone est définie. Appelle ce tool une fois par créneau.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Ex: 'Cours de maths', 'Entraînement piscine'." },
          day_of_week: { type: "number", description: "0=dimanche, 1=lundi, 2=mardi, 3=mercredi, 4=jeudi, 5=vendredi, 6=samedi.", minimum: 0, maximum: 6 },
          start_time: { type: "string", description: "Heure de début format HH:MM (24h), ex '08:00'." },
          end_time: { type: "string", description: "Optionnel, format HH:MM." },
          location: { type: "string", description: "Optionnel." },
          notes: { type: "string", description: "Optionnel." },
          skip_school_holidays: { type: "boolean", description: "Défaut true. Mets false pour les activités qui continuent pendant les vacances." },
        },
        required: ["title", "day_of_week", "start_time"],
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