const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * voice-transcribe — transcription audio.
 *
 * Stratégie (en cascade) :
 *   1. Si `OPENAI_WHISPER_API_KEY` est configurée → on utilise Whisper d'OpenAI
 *      (modèle `whisper-1`) via /v1/audio/transcriptions. Réponse rapide, qualité top.
 *   2. Sinon, ou si Whisper renvoie une erreur d'accès, on bascule sur le
 *      Lovable AI Gateway (Gemini 2.5 Flash multimodal audio) qui ne demande
 *      aucune clé OpenAI.
 *
 * Le client envoie de l'audio en base64 (data URI ou brut). Réponse JSON :
 *   { text: string, provider: "openai_whisper" | "lovable_gemini", keyUsed?: string }
 */

const WHISPER_KEY = Deno.env.get("OPENAI_WHISPER_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function transcribeWithWhisper(base64Audio: string, mime: string): Promise<{ text: string }> {
  const bytes = base64ToBytes(base64Audio);
  const fd = new FormData();
  // L'extension a peu d'importance pour Whisper, mais on met une cohérente avec le mime.
  const ext = mime.includes("mp3") ? "mp3"
    : mime.includes("mp4") || mime.includes("m4a") ? "m4a"
    : mime.includes("wav") ? "wav"
    : mime.includes("ogg") ? "ogg"
    : "webm";
  fd.append("file", new Blob([bytes], { type: mime || "audio/webm" }), `audio.${ext}`);
  fd.append("model", "whisper-1");
  // On laisse Whisper auto-détecter la langue (meilleur que de forcer "fr" si l'utilisateur
  // mélange parfois l'anglais).

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${WHISPER_KEY}` },
    body: fd,
  });

  if (!r.ok) {
    const errText = await r.text();
    const err = new Error(`whisper ${r.status}: ${errText}`) as Error & { status: number; rawBody: string };
    err.status = r.status;
    err.rawBody = errText;
    throw err;
  }
  const data = await r.json();
  return { text: typeof data?.text === "string" ? data.text.trim() : "" };
}

async function transcribeWithGemini(base64Audio: string): Promise<{ text: string }> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Tu es un moteur de transcription audio. Retourne UNIQUEMENT le texte exact prononcé en français, sans ponctuation décorative, sans guillemets, sans préfixe, sans commentaire. Si l'audio est vide ou inintelligible, réponds par une chaîne vide.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcris cet audio en français :" },
            { type: "input_audio", input_audio: { data: base64Audio, format: "webm" } },
          ],
        },
      ],
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    const err = new Error(`gemini ${r.status}: ${t}`) as Error & { status: number };
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  return { text: ((data?.choices?.[0]?.message?.content as string) ?? "").trim() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const audio: string | undefined = body?.audio;
    if (!audio || typeof audio !== "string") {
      return new Response(JSON.stringify({ error: "audio (base64) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extrait le mime depuis le data URI si présent.
    let mime = "audio/webm";
    let base64Audio = audio;
    if (audio.startsWith("data:")) {
      const m = audio.match(/^data:([^;]+);base64,(.*)$/);
      if (m) { mime = m[1]; base64Audio = m[2]; }
    }

    // 1) Whisper en priorité si la clé est configurée
    if (WHISPER_KEY) {
      try {
        const { text } = await transcribeWithWhisper(base64Audio, mime);
        return new Response(JSON.stringify({ text, provider: "openai_whisper", keyUsed: "OPENAI_WHISPER_API_KEY" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        const err = e as Error & { status?: number; rawBody?: string };
        console.warn("Whisper failed, falling back to Gemini:", err.status, err.message);
        // Si l'erreur est un 4xx (auth, accès modèle, fichier invalide…), on bascule.
        // Si c'est un 5xx OpenAI, on bascule aussi.
      }
    }

    // 2) Fallback Lovable AI Gateway (Gemini)
    try {
      const { text } = await transcribeWithGemini(base64Audio);
      return new Response(JSON.stringify({ text, provider: "lovable_gemini" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      console.error("Gemini transcribe error:", err.status, err.message);
      if (err.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans un instant." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (err.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits Lovable AI épuisés." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Transcription failed", details: err.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("voice-transcribe error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
