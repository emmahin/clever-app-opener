// Edge function : analyse l'humeur d'un message utilisateur via Lovable AI Gateway
// (modèle gratuit : google/gemini-2.5-flash-lite). Stocke le résultat dans message_moods.
// Tolérante aux pannes : ne casse JAMAIS le chat si l'analyse échoue.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkCredits } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_MOODS = [
  "joyful", "calm", "neutral", "tired", "stressed",
  "anxious", "sad", "angry", "frustrated", "excited", "reflective",
] as const;

interface MoodResult {
  mood: typeof ALLOWED_MOODS[number];
  intensity: number;
  themes: string[];
  summary: string;
}

const SYSTEM_PROMPT = `Tu es un analyseur émotionnel discret. Analyse le message de l'utilisateur et retourne UNIQUEMENT un objet JSON via tool calling.

Règles strictes :
- "mood" doit être un de : joyful, calm, neutral, tired, stressed, anxious, sad, angry, frustrated, excited, reflective
- "intensity" entre 0.0 (très faible) et 1.0 (très intense)
- "themes" : 1 à 4 thèmes courts en français (ex: ["travail", "famille", "projet"])
- "summary" : une phrase TRÈS courte (max 80 caractères) résumant l'état émotionnel et le sujet
- Si le message est purement factuel/technique sans charge émotionnelle → mood="neutral", intensity=0.2
- Pas d'interprétation excessive : reste mesuré.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { message_id, conversation_id, content } = body;
    if (!message_id || !conversation_id || !content || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip messages trop courts pour être analysables
    const trimmed = content.trim();
    if (trimmed.length < 8) {
      return new Response(JSON.stringify({ ok: true, skipped: "too_short" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Pré-flight crédits : 1 crédit fixe (court appel JSON) ──────────
    {
      const check = await checkCredits(user.id, 1, {
        action: "analyze-mood",
        model: "google/gemini-2.5-flash-lite",
        cors: corsHeaders,
        breakdown: { fixed_cost: 1, reason: "mood analysis (single message)" },
      });
      if (!check.ok) return check.response;
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = "google/gemini-2.5-flash-lite";
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed.slice(0, 2000) },
        ],
        tools: [{
          type: "function",
          function: {
            name: "tag_mood",
            description: "Tag the emotional state of the user's message.",
            parameters: {
              type: "object",
              properties: {
                mood: { type: "string", enum: ALLOWED_MOODS as unknown as string[] },
                intensity: { type: "number", minimum: 0, maximum: 1 },
                themes: { type: "array", items: { type: "string" }, maxItems: 4 },
                summary: { type: "string", maxLength: 80 },
              },
              required: ["mood", "intensity", "themes", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "tag_mood" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "insufficient_credits" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("[analyze-mood] gateway error", aiResp.status, txt);
      return new Response(JSON.stringify({ error: "gateway_error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      console.warn("[analyze-mood] no tool_call returned");
      return new Response(JSON.stringify({ ok: true, skipped: "no_tool_call" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: MoodResult;
    try {
      parsed = JSON.parse(argsStr);
    } catch (e) {
      console.warn("[analyze-mood] tool args parse failed", e);
      return new Response(JSON.stringify({ ok: true, skipped: "parse_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize
    const mood = ALLOWED_MOODS.includes(parsed.mood) ? parsed.mood : "neutral";
    const intensity = Math.max(0, Math.min(1, Number(parsed.intensity) || 0.5));
    const themes = Array.isArray(parsed.themes)
      ? parsed.themes.filter((t) => typeof t === "string").slice(0, 4).map((t) => t.slice(0, 40))
      : [];
    const summary = (parsed.summary || "").toString().slice(0, 80);

    const { error: insertErr } = await supabase.from("message_moods").upsert({
      user_id: user.id,
      message_id,
      conversation_id,
      mood,
      intensity,
      themes,
      summary,
      model,
    }, { onConflict: "message_id" });

    if (insertErr) {
      console.error("[analyze-mood] insert failed", insertErr);
      return new Response(JSON.stringify({ error: "db_error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, mood, intensity, themes, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[analyze-mood] unhandled", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});