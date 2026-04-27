const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Voix OpenAI TTS — « shimmer » : féminine, chaleureuse, naturelle en français.
// Voix dispo : alloy, echo, fable, onyx, nova, shimmer.
const DEFAULT_VOICE = "shimmer";
// Ordre : on tente d'abord le modèle le plus susceptible d'être autorisé sur une clé restreinte
// (gpt-4o-mini-tts), puis on dégrade vers tts-1 / tts-1-hd.
const TTS_MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"];

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

    // Clé dédiée TTS (saisie depuis platform.openai.com avec accès aux modèles audio).
    // Fallback sur OPENAI_API_KEY si jamais la clé dédiée n'est pas configurée.
    const OPENAI_TTS_KEY = Deno.env.get("OPENAI_TTS_API_KEY") || Deno.env.get("OPENAI_API_KEY");
    const KEY_USED = Deno.env.get("OPENAI_TTS_API_KEY") ? "OPENAI_TTS_API_KEY" : "OPENAI_API_KEY";
    if (!OPENAI_TTS_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_TTS_API_KEY (ni OPENAI_API_KEY) configuré" }), {
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
          Authorization: `Bearer ${OPENAI_TTS_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice: selectedVoice,
          input: text.slice(0, 4000),
          response_format: "mp3",
          speed: 1.15,
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
            "X-TTS-Key-Used": KEY_USED,
          },
        });
      }

      const errText = await response.text();
      const openAIError = parseOpenAIError(errText);
      lastError = { status: response.status, body: errText, code: openAIError?.code };
      console.error("OpenAI TTS error:", response.status, model, errText);

      // On essaie le modèle suivant si la clé n'a tout simplement pas accès à celui-ci.
      const isAccessIssue =
        response.status === 403 ||
        response.status === 404 ||
        openAIError?.code === "model_not_found" ||
        (typeof openAIError?.message === "string" &&
          openAIError.message.toLowerCase().includes("does not have access"));
      if (!isAccessIssue) break;
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