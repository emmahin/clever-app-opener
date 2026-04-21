const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SYSTEM_PROMPT = `Tu es un assistant IA analyste pour un dashboard.
Tu réponds en français, en markdown très concis.

Tu disposes d'OUTILS pour récupérer des données réelles :
- fetch_news : dernières actualités (catégories: à_la_une, tech, économie, international, all)
- fetch_stocks : cours boursiers et performance 6 mois

RÈGLES :
1. Si l'utilisateur demande une vue d'ensemble / "que se passe-t-il" / "situation actuelle" → appelle fetch_news ET fetch_stocks.
2. Question finance/marché → fetch_stocks.
3. Question actu/politique/évènements → fetch_news.
4. Sinon, réponds directement sans outils.

STYLE DE SYNTHÈSE (très important) :
- COURTE : 4 à 6 phrases maximum, ou 3-4 puces.
- GÉNÉRALE : dégage les 2-3 grandes tendances, pas de détails article par article.
- Pas de titres lourds, pas de répétition des données déjà visibles dans les widgets.
- Ton fluide, naturel, pas de listing exhaustif.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "fetch_news",
      description: "Récupère les dernières actualités regroupées par catégorie depuis des sources fiables (Le Monde, BBC, Les Echos, etc.)",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["à_la_une", "tech", "économie", "international", "all"],
            description: "Catégorie d'actualités à filtrer",
          },
        },
        required: ["category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_stocks",
      description: "Récupère les cours boursiers et la performance 6 mois d'entreprises (par défaut les top tech IA: NVDA, PLTR, TSLA, META, AMD, MSFT)",
      parameters: {
        type: "object",
        properties: {
          tickers: {
            type: "array",
            items: { type: "string" },
            description: "Liste optionnelle de tickers (symboles boursiers en majuscules)",
          },
        },
      },
    },
  },
];

async function callTool(name: string, args: any): Promise<{ widget: any; summary: string }> {
  const headers = { Authorization: `Bearer ${ANON}` };

  if (name === "fetch_news") {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/news-feed`, { headers });
    const data = await r.json();
    let items = data.items || [];
    const cat = args.category;
    const map: Record<string, string> = {
      "à_la_une": "À la une",
      "tech": "Tech & IA",
      "économie": "Économie",
      "international": "International",
    };
    if (cat && cat !== "all" && map[cat]) {
      items = items.filter((n: any) => n.category === map[cat]);
    }
    items = items.slice(0, 12);
    const summary = items.map((n: any, i: number) =>
      `${i + 1}. [${n.source}] ${n.title}${n.summary ? " — " + n.summary : ""}`
    ).join("\n");
    return { widget: { type: "news", items }, summary };
  }

  if (name === "fetch_stocks") {
    const qs = args.tickers?.length ? `?tickers=${args.tickers.join(",")}` : "";
    const r = await fetch(`${SUPABASE_URL}/functions/v1/stock-data${qs}`, { headers });
    const data = await r.json();
    const stocks = data.stocks || [];
    const summary = stocks.map((s: any) =>
      `${s.symbol} (${s.name}): ${s.price.toFixed(2)} ${s.currency}, ${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(1)}% sur 6 mois`
    ).join("\n");
    return { widget: { type: "stocks", items: stocks }, summary };
  }

  return { widget: null, summary: "Outil inconnu" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        try {
          // Phase 1: tool-call detection (non-streaming)
          const phase1 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
              tools: TOOLS,
              tool_choice: "auto",
            }),
          });

          if (phase1.status === 429) {
            send({ error: "Trop de requêtes, réessayez dans un instant." });
            controller.close(); return;
          }
          if (phase1.status === 402) {
            send({ error: "Crédits IA épuisés." });
            controller.close(); return;
          }
          if (!phase1.ok) {
            const t = await phase1.text();
            console.error("phase1 error", phase1.status, t);
            send({ error: "Erreur IA." });
            controller.close(); return;
          }

          const phase1Data = await phase1.json();
          const msg = phase1Data.choices?.[0]?.message;
          const toolCalls = msg?.tool_calls || [];

          // Phase 2: execute tools if any
          const widgets: any[] = [];
          const toolResults: any[] = [];

          if (toolCalls.length > 0) {
            for (const tc of toolCalls) {
              try {
                const args = JSON.parse(tc.function.arguments || "{}");
                const { widget, summary } = await callTool(tc.function.name, args);
                if (widget) widgets.push(widget);
                toolResults.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: summary,
                });
              } catch (e) {
                console.error("tool error:", e);
                toolResults.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: "Erreur lors de l'appel de l'outil.",
                });
              }
            }

            // Send widgets to client immediately
            send({ widgets });

            // Phase 3: streaming synthesis with tool results
            const phase3 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  ...messages,
                  { role: "assistant", content: msg.content || "", tool_calls: toolCalls },
                  ...toolResults,
                ],
                stream: true,
              }),
            });

            if (!phase3.ok || !phase3.body) {
              send({ error: "Erreur lors de la synthèse." });
              controller.close(); return;
            }

            const reader = phase3.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let nl;
              while ((nl = buf.indexOf("\n")) !== -1) {
                const line = buf.slice(0, nl).replace(/\r$/, "");
                buf = buf.slice(nl + 1);
                if (!line.startsWith("data: ")) continue;
                const json = line.slice(6).trim();
                if (json === "[DONE]") continue;
                try {
                  const p = JSON.parse(json);
                  const delta = p.choices?.[0]?.delta?.content;
                  if (delta) send({ delta });
                } catch { /* ignore partial */ }
              }
            }
          } else {
            // No tools: stream the direct response token by token
            // Re-call with stream=true (since phase1 was not streamed)
            const phaseDirect = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
                stream: true,
              }),
            });

            if (!phaseDirect.ok || !phaseDirect.body) {
              send({ error: "Erreur IA." });
              controller.close(); return;
            }
            const reader = phaseDirect.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let nl;
              while ((nl = buf.indexOf("\n")) !== -1) {
                const line = buf.slice(0, nl).replace(/\r$/, "");
                buf = buf.slice(nl + 1);
                if (!line.startsWith("data: ")) continue;
                const json = line.slice(6).trim();
                if (json === "[DONE]") continue;
                try {
                  const p = JSON.parse(json);
                  const delta = p.choices?.[0]?.delta?.content;
                  if (delta) send({ delta });
                } catch { /* ignore */ }
              }
            }
          }

          send({ done: true });
          controller.close();
        } catch (e) {
          console.error("orchestrator error:", e);
          const enc = new TextEncoder();
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-orchestrator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});