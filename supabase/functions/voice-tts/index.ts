const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Voix OpenAI TTS — « shimmer » : féminine, chaleureuse, naturelle en français.
// Voix dispo : alloy, echo, fable, onyx, nova, shimmer.
const DEFAULT_VOICE = "shimmer";
const TTS_MODELS = ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"];

const parseOpenAIError = (raw: string) => {
  try {
    return JSON.parse(raw)?.error ?? null;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, voice } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const selectedVoice = voice || DEFAULT_VOICE;
    let lastError: { status: number; body: string; code?: string } | null = null;

    for (const model of TTS_MODELS) {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice: selectedVoice,
          input: text.slice(0, 4000),
          response_format: "mp3",
          speed: 1.0,
        }),
      });

      if (response.ok) {
        // Stream direct au client pour lecture quasi instantanée.
        return new Response(response.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
            "X-TTS-Model": model,
          },
        });
      }

      const errText = await response.text();
      const openAIError = parseOpenAIError(errText);
      lastError = { status: response.status, body: errText, code: openAIError?.code };
      console.error("OpenAI TTS error:", response.status, model, errText);

      if (openAIError?.code !== "model_not_found") break;
    }

    return new Response(JSON.stringify({
      fallback: "browser",
      reason: lastError?.code === "model_not_found" ? "openai_tts_model_unavailable" : "openai_tts_unavailable",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("voice-tts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});