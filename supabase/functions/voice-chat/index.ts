const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * voice-chat — edge function ULTRA-LÉGÈRE dédiée au mode vocal.
 *
 * Différences avec ai-orchestrator :
 *   - Pas de routage tools / web search / image gen / code
 *   - Pas de calcul de crédits côté serveur (économise ~200-400ms)
 *   - Modèle le plus rapide : google/gemini-3-flash-preview
 *   - Prompt système minimaliste, pensé pour l'oral court
 *   - Streaming SSE direct, formato compatible avec le client existant
 *
 * Le client envoie : { messages, memoriesContext?, eventsContext?, timezone?, customInstructions? }
 * Le client reçoit : SSE { delta: string } puis { done: true }
 */

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const SYSTEM_PROMPT_BASE = `Tu es Lia, l'assistante vocale de l'utilisateur. Tu parles à l'oral, en français.

Règle absolue de RAPIDITÉ : commence ta réponse IMMÉDIATEMENT par l'info utile. Pas de préambule ("alors", "eh bien", "d'accord", "bien sûr", "laisse-moi réfléchir", "je vais voir", "très bonne question"). Pas de reformulation de la question. Pas de phrase de politesse en intro.

Style oral STRICT (ta réponse est lue par une voix de synthèse) :
- 1 à 2 phrases courtes maximum, sauf si on te demande explicitement de développer.
- Texte brut UNIQUEMENT : pas de markdown, pas d'étoiles, pas de listes, pas de puces, pas d'émojis, pas de code.
- Ton naturel, contracté, parlé : "j'crois", "t'as", "ouais", "bon".
- Ponctuation simple (. , ? !) pour rythmer la voix.
- Pas de relance ("voulez-vous que…", "souhaitez-vous…", "je suis là", "à votre écoute").
- Pas de formule d'attente. Conclus directement sur l'info utile, point final.
- Réponds UNIQUEMENT en français.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const memoriesContext: string = typeof body?.memoriesContext === "string" ? body.memoriesContext : "";
    const eventsContext: string = typeof body?.eventsContext === "string" ? body.eventsContext : "";
    const customInstructions: string = typeof body?.customInstructions === "string" ? body.customInstructions : "";
    const tz = typeof body?.timezone === "string" && body.timezone ? body.timezone : "UTC";

    const now = new Date();
    let nowLocal = now.toISOString();
    try {
      nowLocal = new Intl.DateTimeFormat("fr-FR", {
        timeZone: tz,
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(now);
    } catch { /* fallback UTC */ }

    const systemFull = `${SYSTEM_PROMPT_BASE}

Date et heure : ${nowLocal} (fuseau ${tz}).${
      memoriesContext ? `\n\nMémoire utilisateur :\n${memoriesContext}` : ""
    }${
      eventsContext ? `\n\nAgenda à venir :\n${eventsContext}` : ""
    }${
      customInstructions ? `\n\nInstructions supplémentaires :\n${customInstructions}` : ""
    }`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Modèle le plus rapide & le moins cher : idéal pour des réponses
        // vocales courtes (1-2 phrases). Latence avant 1er token ~2x plus
        // faible que gemini-3-flash-preview.
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemFull },
          // Limite stricte à 4 derniers tours en vocal : moins de tokens en
          // entrée = TTFT plus rapide. Le contexte mémoire reste injecté via
          // le system prompt.
          ...messages.slice(-4),
        ],
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const t = await resp.text().catch(() => "");
      console.error("voice-chat AI error:", resp.status, t);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes — réessayez." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `AI gateway error ${resp.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-streame en SSE compact { delta } (compat client existant).
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const reader = resp.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              let line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") { controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`)); continue; }
              try {
                const j = JSON.parse(payload);
                const delta = j?.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta.length > 0) {
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta })}\n\n`));
                }
              } catch { /* partial */ }
            }
          }
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } catch (e) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : "stream error" })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("voice-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
