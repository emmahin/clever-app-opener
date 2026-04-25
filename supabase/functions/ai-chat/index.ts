const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import {
  getUserIdFromAuth,
  estimateCreditsForRequest,
  computeFinalCredits,
  debitCredits,
  refundCredits,
} from "../_shared/credits.ts";

const SYSTEM_PROMPT = `Tu es un assistant IA polyvalent, intégré dans une application bureautique Windows.
Tu réponds en français de façon claire, structurée (markdown), concise mais complète.
Tu peux discuter de tout : code, analyse, explication, brainstorming, recherche d'infos.
Si l'utilisateur demande d'ouvrir une application locale, indique poliment que cette
fonctionnalité sera bientôt disponible via l'utilitaire Windows compagnon.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Crédits : auth + pré-débit
    const userId = getUserIdFromAuth(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Authentification requise." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const estimate = estimateCreditsForRequest({ messages });
    const debit = await debitCredits(userId, estimate.credits, {
      model: "google/gemini-3-flash-preview",
      action: "chat",
      inputTokens: estimate.inputTokens,
      outputTokens: estimate.estimatedOutputTokens,
      metadata: { phase: "estimate", multiplier: estimate.multiplier },
    });
    if (!debit.ok) {
      const isInsufficient = debit.error === "insufficient_credits";
      return new Response(JSON.stringify({
        error: isInsufficient ? "Crédits insuffisants." : "Erreur de débit crédits.",
        code: isInsufficient ? "insufficient_credits" : "debit_error",
        balance: debit.balance ?? 0,
        required: estimate.credits,
      }), {
        status: isInsufficient ? 402 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "Payment required" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tee le stream pour ajuster les crédits à la fin selon la longueur réelle.
    if (!response.body) {
      return new Response(JSON.stringify({ error: "Empty stream" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const [forClient, forCount] = response.body.tee();

    // Compteur asynchrone (n'attend pas le client).
    (async () => {
      try {
        const reader = forCount.getReader();
        const dec = new TextDecoder();
        let produced = "";
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).replace(/\r$/, "");
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (!json || json === "[DONE]") continue;
            try {
              const p = JSON.parse(json);
              const delta = p.choices?.[0]?.delta?.content || "";
              if (delta) produced += delta;
            } catch { /* partial */ }
          }
        }
        const realOutputTokens = Math.ceil(produced.length / 4);
        const finalCredits = computeFinalCredits({
          realInputTokens: estimate.inputTokens,
          realOutputTokens,
          multiplier: estimate.multiplier,
          actionTokens: estimate.actionTokens,
        });
        const delta = finalCredits - estimate.credits;
        if (delta > 0) {
          await debitCredits(userId, delta, {
            model: "google/gemini-3-flash-preview", action: "chat",
            inputTokens: estimate.inputTokens, outputTokens: realOutputTokens,
            metadata: { phase: "adjust", reason: "underestimate" },
          });
        } else if (delta < 0) {
          await refundCredits(userId, -delta, {
            metadata: { phase: "adjust", reason: "overestimate", real_output_tokens: realOutputTokens },
          });
        }
      } catch (e) {
        console.warn("ai-chat credit adjust failed", e);
      }
    })();

    return new Response(forClient, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
