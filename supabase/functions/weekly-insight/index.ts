// Edge function : génère 1-3 insights hebdomadaires depuis les moods des 7 derniers jours.
// Évite les doublons : skippe si un insight a déjà été créé < 6 jours.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Tu es un coach bienveillant qui observe les émotions d'un utilisateur sur une semaine.
À partir des humeurs taggées de ses messages, identifie 1 à 3 insights utiles.

Règles strictes :
- Reste mesuré, jamais alarmiste. Pas de diagnostic médical.
- Tutoie l'utilisateur ("Tu as mentionné…").
- Chaque insight DOIT être basé sur une vraie répétition observée (≥ 2 occurrences).
- "category" :
  • "pattern" = répétition observée (ex: stress travail 3 fois)
  • "positive" = tendance positive à célébrer
  • "concern" = tendance préoccupante (rare, seulement si signal fort)
  • "suggestion" = action concrète proposée
- "suggested_action" : phrase courte d'action (optionnel mais recommandé pour pattern/concern)
- Si rien d'intéressant à dire (peu de données ou tout neutre) → retourne tableau vide.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
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

    const now = new Date();
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Skip si un insight a déjà été généré dans les 6 derniers jours
    const { data: recent } = await supabase
      .from("mood_insights")
      .select("id, created_at")
      .eq("user_id", user.id)
      .gte("created_at", new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_generated_recently" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupère les moods de la semaine
    const { data: moods, error: moodsErr } = await supabase
      .from("message_moods")
      .select("mood, intensity, themes, summary, created_at")
      .eq("user_id", user.id)
      .gte("created_at", periodStart.toISOString())
      .order("created_at", { ascending: true });

    if (moodsErr) {
      console.error("[weekly-insight] moods read failed", moodsErr);
      return new Response(JSON.stringify({ error: "db_error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!moods || moods.length < 5) {
      return new Response(JSON.stringify({ ok: true, skipped: "not_enough_data", count: moods?.length ?? 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compact pour le prompt
    const compact = moods.slice(0, 80).map((m) => ({
      d: new Date(m.created_at).toISOString().slice(0, 10),
      mood: m.mood,
      intensity: m.intensity,
      themes: m.themes,
      summary: m.summary,
    }));

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Voici mes humeurs des 7 derniers jours (JSON) :\n\n${JSON.stringify(compact)}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_insights",
            description: "Emit 0-3 weekly insights based on observed mood patterns.",
            parameters: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  maxItems: 3,
                  items: {
                    type: "object",
                    properties: {
                      insight: { type: "string", maxLength: 280 },
                      category: { type: "string", enum: ["pattern", "positive", "concern", "suggestion"] },
                      themes: { type: "array", items: { type: "string" }, maxItems: 4 },
                      suggested_action: { type: "string", maxLength: 160 },
                    },
                    required: ["insight", "category", "themes"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["insights"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_insights" } },
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
      console.error("[weekly-insight] gateway error", aiResp.status, await aiResp.text());
      return new Response(JSON.stringify({ error: "gateway_error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const argsStr = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_tool_call" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { insights: Array<{ insight: string; category: string; themes: string[]; suggested_action?: string }> };
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return new Response(JSON.stringify({ ok: true, skipped: "parse_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insights = (parsed.insights || []).slice(0, 3);
    if (insights.length === 0) {
      return new Response(JSON.stringify({ ok: true, count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = insights.map((i) => ({
      user_id: user.id,
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
      insight: (i.insight || "").slice(0, 280),
      category: ["pattern", "positive", "concern", "suggestion"].includes(i.category) ? i.category : "pattern",
      themes: Array.isArray(i.themes) ? i.themes.slice(0, 4) : [],
      suggested_action: i.suggested_action ? i.suggested_action.slice(0, 160) : null,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("mood_insights")
      .insert(rows)
      .select("id, insight, category, themes, suggested_action");

    if (insertErr) {
      console.error("[weekly-insight] insert failed", insertErr);
      return new Response(JSON.stringify({ error: "db_error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, insights: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[weekly-insight] unhandled", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});