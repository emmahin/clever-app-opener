const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const LANG_NAMES: Record<string, string> = {
  fr: "français",
  en: "English",
  es: "español",
  de: "Deutsch",
};

const DETAIL_STYLES: Record<string, string> = {
  short: "TRÈS COURT : 2-3 phrases maximum, droit au but.",
  normal: "COURT : 4-6 phrases ou 3-4 puces, dégage les grandes tendances.",
  detailed:
    "DÉTAILLÉ : analyse complète avec sections, exemples concrets et chiffres clés. Reste structuré.",
};

function buildSystemPrompt(opts: {
  lang: string;
  detailLevel?: string;
  customInstructions?: string;
  aiName?: string;
  webSearch?: boolean;
  forceTool?: string | null;
}): string {
  const name = LANG_NAMES[opts.lang] || "français";
  const detail = DETAIL_STYLES[opts.detailLevel || "normal"] || DETAIL_STYLES.normal;
  const aiNameFinal = opts.aiName?.trim() || "Jarvis";
  const aiIdentity = `Tu t'appelles "${aiNameFinal}". Présente-toi sous ce nom si on te le demande.`;
  const userCustom = opts.customInstructions?.trim()
    ? `\n\nINSTRUCTIONS PERSONNALISÉES DE L'UTILISATEUR (à respecter en priorité tant qu'elles ne contredisent pas les règles ci-dessus) :\n${opts.customInstructions.trim()}`
    : "";
  const webHint = opts.webSearch
    ? `\n\nMODE RECHERCHE WEB ACTIVÉ : utilise OBLIGATOIREMENT l'outil web_search pour appuyer ta réponse sur des sources web fraîches. Cite les sources dans ta réponse.`
    : "";
  const forceHint = opts.forceTool === "image"
    ? `\n\nL'UTILISATEUR DEMANDE UNE IMAGE : appelle OBLIGATOIREMENT generate_image avec un prompt riche et descriptif (en anglais de préférence), puis ajoute une courte légende.`
    : opts.forceTool === "code"
    ? `\n\nMODE CODE : réponds avec du code propre et complet dans des blocs \`\`\`langue. Explique brièvement avant et après.`
    : "";

  return `Tu es un assistant IA analyste pour un dashboard.
${aiIdentity}
IMPORTANT : tu réponds TOUJOURS en ${name}, en markdown. Even if the user writes in another language, answer in ${name}.

Tu disposes d'OUTILS pour récupérer des données réelles :
- fetch_news : dernières actualités (catégories: à_la_une, tech, économie, international, all)
- fetch_stocks : cours boursiers et performance 6 mois
- web_search : recherche web instantanée (DuckDuckGo) pour faits récents, définitions, comparaisons
- generate_image : génère une image à partir d'un prompt descriptif
- search_images : cherche des PHOTOS RÉELLES sur Pixabay (modèles, exemples, produits, lieux). À utiliser dès que l'utilisateur demande "montre-moi", "exemples de", "photos de", "modèles de", "à quoi ressemble"…

RÈGLES :
1. Si l'utilisateur demande une vue d'ensemble / "que se passe-t-il" / "situation actuelle" → appelle fetch_news ET fetch_stocks.
2. Question finance/marché → fetch_stocks.
3. Question actu/politique/évènements → fetch_news.
4. Question nécessitant des faits récents/inconnus → web_search.
5. Demande explicite d'image / illustration / dessin / photo → generate_image.
6. Demande d'EXEMPLES VISUELS / MODÈLES / RÉFÉRENCES (ex: "models de jordans", "photos de chats", "exemples de logos minimalistes") → search_images.
7. Sinon, réponds directement sans outils.

DÉSAMBIGUÏSATION DU CONTEXTE (TRÈS IMPORTANT pour search_images et generate_image) :
- Avant d'appeler un outil visuel, analyse l'INTENTION RÉELLE de l'utilisateur en t'appuyant sur tout l'historique de conversation et le sens commun.
- Beaucoup de termes sont AMBIGUS — choisis le sens le plus probable selon le contexte (mode, sport, tech, animaux, lieux, cuisine…) et précise-le dans la requête.
  Exemples concrets de pièges à éviter :
    • "Air Force One" / "Air Force 1" / "AF1" → sneakers Nike, PAS l'avion présidentiel américain. Requête : "Nike Air Force 1 sneakers shoes white".
    • "Jordan" (sans contexte politique/pays) → baskets Air Jordan. Requête : "Air Jordan basketball sneakers".
    • "Yeezy" → sneakers Adidas Yeezy.
    • "Apple" sans contexte tech → fruit ; avec contexte tech → produits Apple. Précise "fruit" ou "iPhone/MacBook".
    • "Mustang" → cheval OU voiture Ford selon contexte. Précise "horse" ou "Ford Mustang car".
    • "Jaguar" → animal OU voiture. Précise.
    • "Puma" / "Cougar" → animal OU marque sportswear.
    • "Galaxy" → cosmos OU smartphone Samsung.
    • "Surface" → tablette Microsoft OU surface géométrique.
    • Marques de mode (Off-White, Supreme, Balenciaga…) → vêtements/accessoires, jamais le sens littéral.
- Si l'utilisateur a déjà mentionné le contexte plus tôt (ex: il parlait de chaussures puis dit "montre-moi des Air Force One"), GARDE ce contexte.
- Si vraiment ambigu et que tu ne peux pas trancher, demande UNE question courte de précision AVANT d'appeler l'outil (ex: "Tu veux dire les sneakers Nike Air Force 1 ou l'avion présidentiel ?").
- Pour search_images, formule TOUJOURS la requête en anglais avec des mots-clés précis (marque + type de produit + détail visuel).

STYLE DE SYNTHÈSE :
- ${detail}
- Pas de titres lourds, pas de répétition des données déjà visibles dans les widgets.
- Ton fluide, naturel.
- Réponse OBLIGATOIREMENT en ${name}.${webHint}${forceHint}${userCustom}`;
}

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
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Recherche web instantanée pour récupérer faits récents, définitions, comparaisons, actualités sur un sujet précis. Renvoie des extraits + sources.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Requête de recherche" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Génère une image à partir d'un prompt descriptif. Utiliser pour toute demande visuelle.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Description détaillée de l'image (de préférence en anglais)" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_images",
      description:
        "Cherche des PHOTOS RÉELLES (Pixabay) à montrer en galerie. À utiliser pour des EXEMPLES, MODÈLES, RÉFÉRENCES VISUELLES. " +
        "AVANT d'appeler cet outil, désambiguïse le terme de l'utilisateur selon le contexte de conversation et le bon sens : " +
        "'Air Force One' = sneakers Nike (pas l'avion), 'Jordan' = baskets Air Jordan, 'Mustang' = cheval ou voiture selon contexte, 'Apple' = fruit ou produit tech, etc. " +
        "Formule la requête en ANGLAIS avec marque + type de produit + détail visuel (ex: 'Nike Air Force 1 white sneakers', 'modern minimalist kitchen interior'). " +
        "Renvoie 6-8 images.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Mots-clés EN ANGLAIS, précis et désambiguïsés (ex: 'Nike Air Force 1 sneakers', 'modern minimalist kitchen', 'bengal tiger wildlife')" },
          count: { type: "integer", description: "Nombre d'images souhaitées (4-12, défaut 8)" },
        },
        required: ["query"],
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

  if (name === "web_search") {
    try {
      const q = String(args.query || "").trim();
      if (!q) return { widget: null, summary: "Requête vide" };
      // DuckDuckGo Instant Answer + HTML scrape fallback
      const ddg = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`);
      const dj = await ddg.json().catch(() => ({}));
      const items: any[] = [];
      if (dj.AbstractText && dj.AbstractURL) {
        items.push({ title: dj.Heading || q, url: dj.AbstractURL, snippet: dj.AbstractText });
      }
      for (const t of (dj.RelatedTopics || []).slice(0, 8)) {
        if (t.FirstURL && t.Text) {
          items.push({ title: t.Text.split(" - ")[0].slice(0, 120), url: t.FirstURL, snippet: t.Text });
        }
      }
      // Fallback: scrape HTML SERP if no instant answer
      if (items.length < 3) {
        try {
          const html = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
            headers: { "User-Agent": "Mozilla/5.0" },
          }).then((r) => r.text());
          const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
          let m: RegExpExecArray | null;
          let count = 0;
          while ((m = re.exec(html)) && count < 8) {
            let url = m[1];
            // unwrap duckduckgo redirect
            const u = new URL(url, "https://duckduckgo.com");
            const real = u.searchParams.get("uddg") || url;
            const decoded = decodeURIComponent(real);
            const title = m[2].replace(/<[^>]+>/g, "").trim();
            const snippet = m[3].replace(/<[^>]+>/g, "").trim();
            if (decoded.startsWith("http")) {
              items.push({ title, url: decoded, snippet });
              count++;
            }
          }
        } catch (e) { console.error("ddg html error", e); }
      }
      const top = items.slice(0, 8);
      const summary = top.map((it, i) => `${i + 1}. ${it.title} — ${it.snippet || ""} (${it.url})`).join("\n") || "Aucun résultat.";
      return { widget: { type: "web_sources", items: top }, summary };
    } catch (e) {
      console.error("web_search error", e);
      return { widget: null, summary: "Recherche web échouée." };
    }
  }

  if (name === "generate_image") {
    try {
      const prompt = String(args.prompt || "").trim();
      if (!prompt) return { widget: null, summary: "Prompt vide" };
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        console.error("image gen error", r.status, t);
        return { widget: null, summary: "Génération d'image échouée." };
      }
      const data = await r.json();
      const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!url) return { widget: null, summary: "Aucune image renvoyée." };
      return { widget: { type: "image", url, prompt }, summary: `Image générée pour : "${prompt}".` };
    } catch (e) {
      console.error("generate_image error", e);
      return { widget: null, summary: "Erreur génération image." };
    }
  }

  if (name === "search_images") {
    try {
      const q = String(args.query || "").trim();
      if (!q) return { widget: null, summary: "Requête vide" };
      const count = Math.min(12, Math.max(4, parseInt(args.count, 10) || 8));
      const r = await fetch(
        `${SUPABASE_URL}/functions/v1/image-search?q=${encodeURIComponent(q)}&per_page=${count}`,
        { headers },
      );
      const data = await r.json();
      const items = data.items || [];
      const summary = items.length
        ? `${items.length} image(s) trouvée(s) pour "${q}". Tags : ${items.slice(0, 3).map((i: any) => i.tags).join(" / ")}.`
        : `Aucune image trouvée pour "${q}".`;
      return { widget: { type: "image_gallery", query: q, items }, summary };
    } catch (e) {
      console.error("search_images error", e);
      return { widget: null, summary: "Recherche d'images échouée." };
    }
  }

  return { widget: null, summary: "Outil inconnu" };
}

function latestUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .filter((p: any) => p?.type === "text" && typeof p.text === "string")
        .map((p: any) => p.text)
        .join("\n");
    }
  }
  return "";
}

function inferImageSearchQuery(text: string): string | null {
  const raw = text.toLowerCase();
  const asksForRealImages = /\b(photo|photos|image|images|mod[eè]le|mod[eè]les|exemple|exemples|montre|voir|visuel|r[ée]f[ée]rence|r[ée]f[ée]rences)\b/i.test(raw);
  if (!asksForRealImages) return null;

  if (/\b(air\s*force\s*(one|1)?|af1)\b/i.test(raw)) return "Nike Air Force 1 sneakers shoes white";
  if (/\b(jordan|jordans|air\s*jordan)\b/i.test(raw)) return "Air Jordan basketball sneakers shoes";
  if (/\b(yeezy|yeezys)\b/i.test(raw)) return "Adidas Yeezy sneakers shoes";

  return null;
}

async function streamModelResponse(body: any, send: (obj: any) => void): Promise<string> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!response.ok || !response.body) throw new Error(`IA ${response.status}`);

  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let fullText = "";
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
      if (!json || json === "[DONE]") continue;
      try {
        const p = JSON.parse(json);
        const delta =
          p.choices?.[0]?.delta?.content ??
          p.choices?.[0]?.message?.content ??
          p.delta ??
          p.content ??
          "";
        if (delta) {
          fullText += delta;
          send({ delta });
        }
      } catch { /* ignore partial */ }
    }
  }
  return fullText;
}

async function completeModelResponse(body: any): Promise<string> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`IA ${response.status}`);
  const data = await response.json();
  return String(data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, lang, detailLevel, customInstructions, aiName, attachments, webSearch, deepThink, forceTool } = await req.json();
    const SYSTEM_PROMPT = buildSystemPrompt({
      lang: typeof lang === "string" ? lang : "fr",
      detailLevel: typeof detailLevel === "string" ? detailLevel : "normal",
      customInstructions: typeof customInstructions === "string" ? customInstructions : "",
      aiName: typeof aiName === "string" ? aiName : "",
      webSearch: !!webSearch,
      forceTool: typeof forceTool === "string" ? forceTool : null,
    });
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Inject attachments (images + extracted text from documents/audio) into the last user message
    // as multimodal content for Gemini.
    const atts = Array.isArray(attachments) ? attachments : [];
    if (atts.length > 0 && messages.length > 0) {
      const lastIdx = messages.length - 1;
      const last = messages[lastIdx];
      if (last?.role === "user") {
        const parts: any[] = [{ type: "text", text: String(last.content || "") }];
        const docTexts: string[] = [];
        for (const a of atts) {
          if (a.kind === "image" && typeof a.dataUrl === "string") {
            parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
          } else if (a.kind === "document" && typeof a.text === "string") {
            docTexts.push(`\n\n--- Document joint: ${a.name || "document"} ---\n${a.text.slice(0, 60000)}\n--- fin du document ---`);
          } else if (a.kind === "audio" && typeof a.text === "string") {
            docTexts.push(`\n\n--- Transcription audio: ${a.name || "audio"} ---\n${a.text}\n--- fin transcription ---`);
          }
        }
        if (docTexts.length) parts[0].text = String(last.content || "") + docTexts.join("");
        messages[lastIdx] = { role: "user", content: parts };
      }
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        try {
          const inferredImageQuery = inferImageSearchQuery(latestUserText(messages));
          if (inferredImageQuery) {
            const { widget, summary } = await callTool("search_images", { query: inferredImageQuery, count: 8 });
            if (widget) send({ widgets: [widget] });
            send({ delta: `Bien sûr monsieur — j’ai compris que vous parlez des sneakers Nike Air Force 1. Voici des exemples visuels pertinents.\n\n${summary}` });
            send({ done: true });
            controller.close();
            return;
          }

          // Force tool choice when user explicitly clicked a tool button
          let phase1ToolChoice: any = "auto";
          if (forceTool === "image") {
            phase1ToolChoice = { type: "function", function: { name: "generate_image" } };
          } else if (webSearch) {
            phase1ToolChoice = { type: "function", function: { name: "web_search" } };
          }
          const phase1Body: any = {
            model: deepThink ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
            tools: TOOLS,
            tool_choice: phase1ToolChoice,
          };
          if (deepThink) phase1Body.reasoning = { effort: "medium" };
          // Phase 1: tool-call detection (non-streaming)
          const phase1 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(phase1Body),
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
            const phase3Body = {
                model: "google/gemini-3-flash-preview",
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  ...messages,
                  { role: "assistant", content: msg.content || "", tool_calls: toolCalls },
                  ...toolResults,
                ],
            };
            const streamed = await streamModelResponse(phase3Body, send);
            if (!streamed.trim()) send({ delta: `Voilà monsieur.\n\n${toolResults.map((r) => r.content).join("\n")}` });
          } else {
            // No tools: stream the direct response token by token
            // Re-call with stream=true (since phase1 was not streamed)
            const directBody = {
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
            };
            const streamed = await streamModelResponse(directBody, send);
            if (!streamed.trim()) {
              const fallback = await completeModelResponse({ ...directBody, model: "google/gemini-2.5-flash" });
              send({ delta: fallback || "Je suis là monsieur, mais je n’ai pas reçu de contenu exploitable. Reformulez votre demande en une phrase et je m’en occupe." });
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