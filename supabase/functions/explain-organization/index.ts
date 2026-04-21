const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Tu es un assistant qui explique en français, de façon claire, chaleureuse et pédagogique,
ce qu'un logiciel de tri de fichiers vient de faire. Tu reçois UNIQUEMENT des statistiques agrégées
(jamais la liste des fichiers). Tu rédiges un message court (4-7 phrases max), structuré avec des
petits titres en **gras** et des listes à puces si utile. Ton ton est amical et rassurant.
Termine par une suggestion concrète (ex: activer le regroupement par année, télécharger le ZIP, etc.).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { stats, options } = await req.json();
    if (!stats || typeof stats !== "object") {
      return new Response(JSON.stringify({ error: "stats required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userPrompt = `Voici ce que le logiciel de tri local vient de faire :

- Total de fichiers traités : ${stats.total}
- Catégories créées (avec nombre de fichiers) :
${Object.entries(stats.categories || {}).map(([k, v]) => `  • ${k} : ${v}`).join("\n")}
- Règles appliquées :
${(stats.rulesApplied || []).map((r: string) => `  • ${r}`).join("\n")}
- Options : ${options?.groupByYear ? "regroupement par année activé" : "pas de regroupement par année"}

Explique à l'utilisateur, de façon naturelle, ce qui a été fait et pourquoi cette organisation est pertinente.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "Payment required" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI gateway error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const explanation = data?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ explanation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});