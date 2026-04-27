const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { audio } = await req.json();
    if (!audio || typeof audio !== "string") {
      return new Response(JSON.stringify({ error: "audio (base64) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip data URI prefix if present — Gemini accepte du base64 brut
    const base64Audio = audio.startsWith("data:") ? audio.split(",")[1] : audio;

    // Transcription via Lovable AI Gateway (Gemini multimodal audio).
    // Pas besoin de clé OpenAI : la quota Lovable AI couvre l'usage.
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              {
                type: "input_audio",
                input_audio: { data: base64Audio, format: "webm" },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Lovable AI transcribe error:", response.status, text);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Trop de requêtes, réessayez dans un instant." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Crédits Lovable AI épuisés. Ajoutez des crédits dans Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Transcription failed", details: text }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = (data?.choices?.[0]?.message?.content as string)?.trim() ?? "";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("voice-transcribe error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
