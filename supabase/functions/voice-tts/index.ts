const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Provider par défaut : OpenAI TTS (Whisper family) ───────────────
// L'utilisateur veut explicitement rester sur l'écosystème OpenAI/Whisper.
// Voix par défaut : « shimmer » (féminine, douce et aérienne).
const OPENAI_DEFAULT_VOICE = "shimmer";
const OPENAI_ALLOWED_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer", "sage", "coral"]);

// ─── Fallback ElevenLabs (uniquement si OpenAI échoue) ───────────────
const ELEVEN_DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah
const ELEVEN_MODEL = "eleven_turbo_v2_5";
const MAX_TEXT_LEN = 4000;
const OPENAI_TTS_MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"];

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
    let body: any = null;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "JSON body required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const text = body?.text;
    const voice = body?.voice;
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeText = text.trim().slice(0, MAX_TEXT_LEN);
    const isElevenVoiceId = typeof voice === "string" && /^[a-zA-Z0-9]{18,}$/.test(voice);
    const elevenVoiceId = isElevenVoiceId ? voice : ELEVEN_DEFAULT_VOICE_ID;
    const openaiVoice = typeof voice === "string" && OPENAI_ALLOWED_VOICES.has(voice) ? voice : OPENAI_DEFAULT_VOICE;

    // ─── 1) OpenAI TTS en priorité ──────────────────────────────────────
    const OPENAI_TTS_KEY = Deno.env.get("OPENAI_TTS_API_KEY") || Deno.env.get("OPENAI_API_KEY");
    const KEY_USED = Deno.env.get("OPENAI_TTS_API_KEY") ? "OPENAI_TTS_API_KEY" : "OPENAI_API_KEY";
    let openaiLastError: { status: number; body: string; code?: string } | null = null;
    if (OPENAI_TTS_KEY) {
      for (const model of OPENAI_TTS_MODELS) {
        const response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_TTS_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            voice: openaiVoice,
            input: safeText,
            response_format: "mp3",
            speed: 1.15,
          }),
        });
        if (response.ok) {
          return new Response(response.body, {
            headers: {
              ...corsHeaders,
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
              "X-TTS-Provider": "openai",
              "X-TTS-Model": model,
              "X-TTS-Voice": openaiVoice,
              "X-TTS-Key-Used": KEY_USED,
            },
          });
        }
        const errText = await response.text();
        const openAIError = parseOpenAIError(errText);
        openaiLastError = { status: response.status, body: errText, code: openAIError?.code };
        console.error("OpenAI TTS error:", response.status, model, errText);
        const isAccessIssue =
          response.status === 403 ||
          response.status === 404 ||
          openAIError?.code === "model_not_found" ||
          (typeof openAIError?.message === "string" &&
            openAIError.message.toLowerCase().includes("does not have access"));
        if (!isAccessIssue) break;
      }
    }

    // ─── 2) Fallback ElevenLabs (seulement si OpenAI a échoué) ─────────
    const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (ELEVEN_KEY) {
      try {
        const elevenResp = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}/stream?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVEN_KEY,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: safeText,
              model_id: ELEVEN_MODEL,
              voice_settings: {
                stability: 0.45,
                similarity_boost: 0.8,
                style: 0.35,
                use_speaker_boost: true,
                speed: 1.0,
              },
              language_code: "fr",
            }),
          },
        );
        if (elevenResp.ok && elevenResp.body) {
          return new Response(elevenResp.body, {
            headers: {
              ...corsHeaders,
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
              "X-TTS-Provider": "elevenlabs",
              "X-TTS-Model": ELEVEN_MODEL,
              "X-TTS-Voice": elevenVoiceId,
              "X-TTS-Fallback": "true",
            },
          });
        }
        const errText = await elevenResp.text();
        console.error("ElevenLabs TTS error:", elevenResp.status, errText);
      } catch (e) {
        console.error("ElevenLabs TTS exception:", e);
      }
    }

    return new Response(JSON.stringify({
      fallback: "browser",
      reason: openaiLastError?.code === "model_not_found" ? "openai_tts_model_unavailable" : "openai_tts_unavailable",
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