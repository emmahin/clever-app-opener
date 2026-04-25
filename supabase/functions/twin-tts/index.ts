const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Twin TTS — synthèse vocale via ElevenLabs (free tier 10k caractères/mois).
 * Si la clé ElevenLabs n'est pas dispo OU si le quota est dépassé, le client
 * basculera sur SpeechSynthesis du navigateur (fallback gratuit illimité).
 *
 * Voix par défaut : "Charlotte" (féminine, française, naturelle) — on peut
 * surcharger via le body. Modèle eleven_turbo_v2_5 (low latency) pour réduire
 * la latence d'attente côté oreille.
 */

const DEFAULT_VOICE_ID = "XB0fDUnXU5powFXDhCwa"; // Charlotte
const DEFAULT_MODEL = "eleven_turbo_v2_5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, voiceId, modelId } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      // 204 → le client utilisera le TTS navigateur en fallback
      return new Response(JSON.stringify({ fallback: true, reason: "no_key" }), {
        status: 204, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vid = (voiceId && typeof voiceId === "string") ? voiceId : DEFAULT_VOICE_ID;
    const mid = (modelId && typeof modelId === "string") ? modelId : DEFAULT_MODEL;

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${vid}/stream?output_format=mp3_44100_128`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: mid,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 1.0 },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.warn("ElevenLabs TTS failed → fallback navigateur:", r.status, t.slice(0, 200));
      return new Response(JSON.stringify({ fallback: true, reason: `eleven_${r.status}` }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(r.body, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
    });
  } catch (e) {
    console.error("twin-tts error:", e);
    return new Response(JSON.stringify({ fallback: true, reason: (e as Error).message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});