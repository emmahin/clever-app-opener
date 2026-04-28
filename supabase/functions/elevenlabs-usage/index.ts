import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resp = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": apiKey },
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(
        JSON.stringify({ error: txt || `ElevenLabs error ${resp.status}` }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sub = await resp.json();

    const character_count = Number(sub.character_count ?? 0);
    const character_limit = Number(sub.character_limit ?? 0);
    const remaining = Math.max(0, character_limit - character_count);
    const percent_used = character_limit > 0
      ? Math.min(100, (character_count / character_limit) * 100)
      : 0;

    const payload = {
      tier: sub.tier ?? "unknown",
      status: sub.status ?? "unknown",
      character_count,
      character_limit,
      remaining,
      percent_used,
      next_character_count_reset_unix: sub.next_character_count_reset_unix ?? null,
      currency: sub.currency ?? null,
      can_extend_character_limit: sub.can_extend_character_limit ?? false,
      allowed_to_extend_character_limit: sub.allowed_to_extend_character_limit ?? false,
      fetched_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});