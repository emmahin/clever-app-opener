const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const MAX_TEXT_LEN = 5000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON body required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = body?.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeText = text.trim().slice(0, MAX_TEXT_LEN);
    const voiceId =
      typeof body?.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim() : DEFAULT_VOICE_ID;
    const modelId =
      typeof body?.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : DEFAULT_MODEL_ID;
    const outputFormat =
      typeof body?.outputFormat === "string" && body.outputFormat.trim()
        ? body.outputFormat.trim()
        : DEFAULT_OUTPUT_FORMAT;

    const voiceSettings = {
      stability: typeof body?.stability === "number" ? body.stability : 0.5,
      similarity_boost: typeof body?.similarityBoost === "number" ? body.similarityBoost : 0.75,
      style: typeof body?.style === "number" ? body.style : 0.4,
      use_speaker_boost: body?.useSpeakerBoost !== false,
      speed: typeof body?.speed === "number" ? body.speed : 1.0,
    };

    const stream = body?.stream === true;
    const endpoint = stream
      ? `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`
      : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: safeText,
        model_id: modelId,
        voice_settings: voiceSettings,
      }),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "");
      console.error("ElevenLabs TTS error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "ElevenLabs TTS failed", status: response.status, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-TTS-Provider": "elevenlabs",
        "X-TTS-Voice": voiceId,
        "X-TTS-Model": modelId,
      },
    });
  } catch (e) {
    console.error("elevenlabs-tts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
