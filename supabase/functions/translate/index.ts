const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const LANG_NAMES: Record<string, string> = {
  fr: "French",
  en: "English",
  es: "Spanish",
  de: "German",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texts, target } = await req.json();
    if (!Array.isArray(texts) || !target) {
      return new Response(JSON.stringify({ error: "texts (array) and target required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langName = LANG_NAMES[target] || target;

    // Tool-calling for structured output
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a translation engine. Translate every input string into ${langName}. Preserve meaning, tone, named entities, numbers and acronyms. Do NOT add explanations. Return EXACTLY the same number of items in the same order.`,
          },
          {
            role: "user",
            content: JSON.stringify(texts),
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_translations",
              description: `Return the translations into ${langName} as a JSON array, same length and order as input.`,
              parameters: {
                type: "object",
                properties: {
                  translations: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["translations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_translations" } },
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "credits_exhausted" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("translate gateway error", r.status, t);
      return new Response(JSON.stringify({ error: "ai_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    let translations: string[] = [];
    if (tc?.function?.arguments) {
      try {
        translations = JSON.parse(tc.function.arguments).translations || [];
      } catch (e) {
        console.error("parse translations failed", e);
      }
    }
    // Fallback: if length mismatches, pad with originals
    if (translations.length !== texts.length) {
      translations = texts.map((t: string, i: number) => translations[i] ?? t);
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
