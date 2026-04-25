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

/**
 * Nettoie le texte avant TTS pour éviter que la voix lise les caractères
 * de formatage markdown (étoiles, dièses, underscores, backticks…) et
 * pour que les phrases sonnent naturelles à l'oral.
 */
function sanitizeForSpeech(input: string): string {
  let t = input;
  // Code blocks ```...``` → enlever balises
  t = t.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, " "));
  // Liens markdown [label](url) → label
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Images ![alt](url) → alt
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  // Titres en début de ligne #, ##, ###…
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  // Citations >
  t = t.replace(/^\s{0,3}>\s?/gm, "");
  // Puces - * + en début de ligne
  t = t.replace(/^\s{0,3}[-*+]\s+/gm, "");
  // Listes numérotées 1. 2.
  t = t.replace(/^\s{0,3}\d+\.\s+/gm, "");
  // Gras / italique : **x**, __x__, *x*, _x_
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2");
  t = t.replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2");
  // Inline code `x`
  t = t.replace(/`([^`]+)`/g, "$1");
  // Astérisques / dièses / backticks isolés restants
  t = t.replace(/[*_`#~]+/g, " ");
  // Émojis — facultatif : on les retire pour éviter "emoji visage souriant"
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
  // Normalisation espaces
  t = t.replace(/\s+\n/g, "\n").replace(/\n{2,}/g, ". ").replace(/[ \t]{2,}/g, " ").trim();
  // S'assurer d'une ponctuation finale pour une intonation naturelle
  if (t && !/[.!?…]$/.test(t)) t += ".";
  return t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, voiceId, modelId } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanText = sanitizeForSpeech(text);
    if (!cleanText) {
      return new Response(JSON.stringify({ error: "empty after sanitize" }), {
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
        text: cleanText,
        model_id: mid,
        // Réglages "plus humain" : moins de stability = plus d'expressivité,
        // style élevé = intonations émotionnelles, speed légèrement ralentie
        // pour un débit plus posé / naturel.
        voice_settings: {
          stability: 0.3,
          similarity_boost: 0.85,
          style: 0.6,
          use_speaker_boost: true,
          speed: 0.95,
        },
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