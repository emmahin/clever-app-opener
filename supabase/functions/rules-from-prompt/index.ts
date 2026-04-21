const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Tu convertis une demande en français en règles de tri de fichiers structurées.
Tu reçois une phrase de l'utilisateur ET la liste des extensions présentes dans son dossier (pas les noms de fichiers).
Tu réponds UNIQUEMENT en JSON strict, sans texte autour.

Format :
{
  "rules": [
    { "keywords": ["facture", "invoice"], "extensions": ["pdf"], "target": "Comptabilité/Factures" }
  ],
  "groupByYear": false,
  "summary": "Brève phrase en français résumant ce que tu as compris."
}

Règles :
- "keywords" : mots-clés en minuscules à chercher dans les noms de fichiers (facultatif, [] si non pertinent).
- "extensions" : extensions sans le point, en minuscules (facultatif, [] = toutes).
- "target" : chemin du dossier cible avec "/" (ex: "Photos/Vacances"). Pas d'espaces inutiles.
- Si l'utilisateur veut grouper par année, mets "groupByYear": true.
- L'ordre des règles compte (les premières sont prioritaires).
- Sois exhaustif mais reste fidèle à la demande. N'invente pas de catégories non demandées.
- Si la demande est vague ("organise tout"), renvoie { "rules": [], "groupByYear": false, "summary": "..." } pour laisser le tri par défaut faire le travail.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, extensions } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const exts = Array.isArray(extensions) ? extensions.slice(0, 50).join(", ") : "(non fournies)";
    const userPrompt = `Demande utilisateur : "${prompt}"\n\nExtensions présentes dans le dossier : ${exts}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
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
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { rules: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});