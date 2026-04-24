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
  schedule?: Array<{ title: string; start_iso: string; end_iso?: string; location?: string; notes?: string }>;
  timezone?: string;
  scheduleRelevant?: boolean;
}): string {
  const name = LANG_NAMES[opts.lang] || "français";
  const detail = DETAIL_STYLES[opts.detailLevel || "normal"] || DETAIL_STYLES.normal;
  const aiNameFinal = opts.aiName?.trim() || "Jarvis";
  const aiIdentity = `Tu t'appelles "${aiNameFinal}". Présente-toi sous ce nom si on te le demande.`;
  const userCustom = opts.customInstructions?.trim()
    ? `\n\nINSTRUCTIONS PERSONNALISÉES DE L'UTILISATEUR (à respecter en priorité tant qu'elles ne contredisent pas les règles ci-dessus) :\n${opts.customInstructions.trim()}`
    : "";
  const tz = opts.timezone && typeof opts.timezone === "string" ? opts.timezone : "UTC";
  const now = new Date();
  const nowIsoUtc = now.toISOString();
  let nowLocalReadable = nowIsoUtc;
  let tzOffsetStr = "+00:00";
  try {
    // Human-readable local time in user's timezone, e.g. "lundi 21 avril 2026 23:42"
    nowLocalReadable = new Intl.DateTimeFormat("fr-FR", {
      timeZone: tz,
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(now);
    // Compute offset in minutes for that timezone
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = Object.fromEntries(dtf.formatToParts(now).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const offsetMin = Math.round((asUtc - now.getTime()) / 60000);
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    tzOffsetStr = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  } catch { /* fallback to UTC */ }
  const sched = (opts.schedule || []).slice().sort((a, b) => Date.parse(a.start_iso) - Date.parse(b.start_iso));
  // Planning : injecté UNIQUEMENT si la requête en parle (économie de tokens).
  const schedBlock = (sched.length && opts.scheduleRelevant)
    ? `\n\nEMPLOI DU TEMPS (${sched.length} évt) :\n` +
      sched.map((e) => `- ${e.start_iso}${e.end_iso ? `→${e.end_iso}` : ""}: ${e.title}${e.location ? ` @${e.location}` : ""}`).join("\n")
    : "";
  const webHint = opts.webSearch
    ? `\n\nMODE RECHERCHE WEB ACTIVÉ : utilise OBLIGATOIREMENT l'outil web_search pour appuyer ta réponse sur des sources web fraîches. Cite les sources dans ta réponse.`
    : "";
  const forceHint = opts.forceTool === "image"
    ? `\n\nL'UTILISATEUR DEMANDE UNE IMAGE : appelle OBLIGATOIREMENT generate_image avec un prompt riche et descriptif (en anglais de préférence), puis ajoute une courte légende.`
    : opts.forceTool === "code"
    ? `\n\nMODE CODE : réponds avec du code propre et complet dans des blocs \`\`\`langue. Explique brièvement avant et après.`
    : "";

  return `Assistant IA analyste pour un dashboard.
${aiIdentity}
Réponds TOUJOURS en ${name}, en markdown.
Heure locale: ${nowLocalReadable} (${tz}, ${tzOffsetStr}). UTC: ${nowIsoUtc}.
Quand l'utilisateur dit une heure, c'est l'heure LOCALE. Format ISO 8601 avec offset ${tzOffsetStr} (jamais "Z").${schedBlock}

RÈGLES OUTILS (n'utilise un outil QUE si la demande l'exige) :
- Données fraîches/web/actu/finance → fetch_news / fetch_stocks / web_search.
- Image générée / photos d'exemples / vidéo → generate_image / search_images / search_videos.
- "Envoie/écris à X" → send_whatsapp_message. "Rappelle-moi…" → create_reminder.
- Planning : add_schedule_event UNIQUEMENT sur demande EXPLICITE ("ajoute/note/planifie/enregistre dans mon agenda"). Une simple mention ("je vais voir Léa demain") N'EST PAS une demande — n'appelle RIEN. En doute, demande confirmation. list_schedule pour afficher, remove_schedule_event pour annuler.
- Sinon, réponds directement sans outil.

STYLE :
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
  {
    type: "function",
    function: {
      name: "search_videos",
      description:
        "Cherche des vidéos YouTube à partir de mots-clés OU intègre une vidéo précise depuis son URL " +
        "(YouTube, Vimeo, TikTok, Instagram, X/Twitter, MP4 direct). " +
        "Renvoie un widget avec lecteur intégré + lien vers la source. " +
        "Donne le paramètre 'url' si l'utilisateur a collé un lien vidéo, sinon 'query' avec des mots-clés.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Mots-clés de recherche (ex: 'tutoriel pâte à pizza', 'react useEffect explained')" },
          url: { type: "string", description: "URL d'une vidéo YouTube/Vimeo/TikTok/Instagram/X/MP4 à intégrer directement" },
          count: { type: "integer", description: "Nombre de vidéos pour une recherche (1-8, défaut 4)" },
        },
      },
    },
  },
];

// Inserted after TOOLS array — extend it with the WhatsApp tool.
TOOLS.push({
  type: "function",
  function: {
    name: "send_whatsapp_message",
    description:
      "Prépare l'envoi d'un message WhatsApp à un contact local de l'utilisateur. " +
      "Le message n'est PAS envoyé directement : une carte de confirmation s'affiche dans le chat. " +
      "Utilise cet outil dès que l'utilisateur demande 'envoie un message à …', 'écris à …', 'dis à … sur WhatsApp', etc.",
    parameters: {
      type: "object",
      properties: {
        contact_name: {
          type: "string",
          description: "Nom (ou prénom) du contact tel que mentionné par l'utilisateur. Ex: 'Léa', 'Paul Martin'.",
        },
        body: {
          type: "string",
          description: "Texte exact du message à envoyer, dans la langue de l'utilisateur, prêt à l'envoi.",
        },
      },
      required: ["contact_name", "body"],
    },
  },
});

TOOLS.push({
  type: "function",
  function: {
    name: "create_reminder",
    description:
      "Programme un rappel qui s'affichera comme notification au moment voulu. " +
      "Utilise quand l'utilisateur demande 'rappelle-moi…', 'préviens-moi à…', 'dans X minutes…'. " +
      "Calcule when_iso à partir de la date/heure courante (passée dans le contexte si disponible).",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titre court du rappel (ex: 'Appeler Léa')." },
        body: { type: "string", description: "Détails optionnels (lieu, contexte, etc.)." },
        when_iso: { type: "string", description: "Date/heure du rappel au format ISO 8601 (ex: '2026-04-21T15:00:00')." },
      },
      required: ["title", "when_iso"],
    },
  },
});

TOOLS.push({
  type: "function",
  function: {
    name: "create_insight",
    description:
      "Pousse une observation ou un conseil proactif comme notification persistante. " +
      "À utiliser avec parcimonie, seulement quand tu as une vraie suggestion à valeur ajoutée " +
      "(ex: après avoir analysé des données, suggérer une action concrète).",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titre concis de l'insight." },
        body: { type: "string", description: "Description détaillée de l'observation/conseil." },
      },
      required: ["title", "body"],
    },
  },
});

TOOLS.push({
  type: "function",
  function: {
    name: "add_schedule_event",
    description:
      "Ajoute un événement à l'emploi du temps de l'utilisateur (rendez-vous, cours, réunion, sport, etc.). " +
      "Calcule start_iso en ISO 8601 à partir de la date courante. " +
      "Si la durée est précisée, fournis aussi end_iso.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titre court de l'événement (ex: 'Dentiste', 'Réunion projet X')." },
        start_iso: { type: "string", description: "Début au format ISO 8601 (ex: '2026-04-22T14:30:00')." },
        end_iso: { type: "string", description: "Fin au format ISO 8601 (optionnel)." },
        location: { type: "string", description: "Lieu (optionnel)." },
        notes: { type: "string", description: "Notes / détails (optionnel)." },
      },
      required: ["title", "start_iso"],
    },
  },
});

TOOLS.push({
  type: "function",
  function: {
    name: "list_schedule",
    description:
      "Affiche l'emploi du temps de l'utilisateur sous forme de carte. " +
      "Choisis la plage selon ce que demande l'utilisateur. " +
      "Pour répondre à une question analytique (libre ?, conflit ?, combien ?), n'appelle PAS cet outil : " +
      "utilise directement le bloc EMPLOI DU TEMPS ACTUEL fourni dans le contexte.",
    parameters: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["today", "tomorrow", "week", "month", "all"],
          description: "Plage temporelle à afficher.",
        },
      },
      required: ["range"],
    },
  },
});

TOOLS.push({
  type: "function",
  function: {
    name: "remove_schedule_event",
    description:
      "Supprime un ou plusieurs événements de l'emploi du temps dont le titre contient title_query (insensible à la casse). " +
      "Utilise un mot-clé court et discriminant (ex: 'dentiste', 'Léa').",
    parameters: {
      type: "object",
      properties: {
        title_query: { type: "string", description: "Mot-clé contenu dans le titre de l'événement à supprimer." },
      },
      required: ["title_query"],
    },
  },
});

// Catalogue d'apps connues — dupliqué côté serveur pour que l'IA puisse résoudre une app par nom.
// Doit rester aligné avec src/services/appLauncherService.ts (APP_CATALOG).
const APP_CATALOG_SERVER: Array<{
  id: string;
  name: string;
  aliases: string[];
  kind: "internal" | "web" | "deeplink";
  target: string;
  fallback_url?: string;
}> = [
  { id: "internal-dashboard", name: "Dashboard",     aliases: ["dashboard", "tableau de bord", "accueil"], kind: "internal", target: "/dashboard" },
  { id: "internal-analytics", name: "Analytics",     aliases: ["analytics", "stats", "statistiques", "analyses"], kind: "internal", target: "/analytics" },
  { id: "internal-documents", name: "Documents",     aliases: ["documents", "docs", "fichiers"], kind: "internal", target: "/documents" },
  { id: "internal-video",     name: "Éditeur vidéo", aliases: ["video", "vidéo", "editeur video", "éditeur vidéo", "montage"], kind: "internal", target: "/video" },
  { id: "internal-whatsapp",  name: "WhatsApp (app)", aliases: ["whatsapp interne", "page whatsapp", "mes messages"], kind: "internal", target: "/whatsapp" },
  { id: "internal-notifs",    name: "Notifications", aliases: ["notifications", "notifs", "alertes"], kind: "internal", target: "/notifications" },
  { id: "internal-settings",  name: "Paramètres",    aliases: ["paramètres", "parametres", "réglages", "settings"], kind: "internal", target: "/settings" },
  { id: "gmail",    name: "Gmail",           aliases: ["gmail", "mail", "email"], kind: "web", target: "https://mail.google.com" },
  { id: "gcal",     name: "Google Agenda",   aliases: ["google calendar", "agenda", "calendrier google"], kind: "web", target: "https://calendar.google.com" },
  { id: "gdrive",   name: "Google Drive",    aliases: ["drive", "google drive"], kind: "web", target: "https://drive.google.com" },
  { id: "youtube",  name: "YouTube",         aliases: ["youtube", "yt"], kind: "web", target: "https://www.youtube.com" },
  { id: "google",   name: "Google",          aliases: ["google"], kind: "web", target: "https://www.google.com" },
  { id: "chatgpt",  name: "ChatGPT",         aliases: ["chatgpt", "openai", "gpt"], kind: "web", target: "https://chat.openai.com" },
  { id: "claude",   name: "Claude",          aliases: ["claude", "anthropic"], kind: "web", target: "https://claude.ai" },
  { id: "gemini",   name: "Gemini",          aliases: ["gemini", "bard"], kind: "web", target: "https://gemini.google.com" },
  { id: "github",   name: "GitHub",          aliases: ["github", "git"], kind: "web", target: "https://github.com" },
  { id: "notion",   name: "Notion",          aliases: ["notion"], kind: "web", target: "https://www.notion.so" },
  { id: "linear",   name: "Linear",          aliases: ["linear"], kind: "web", target: "https://linear.app" },
  { id: "figma",    name: "Figma",           aliases: ["figma"], kind: "web", target: "https://www.figma.com" },
  { id: "linkedin", name: "LinkedIn",        aliases: ["linkedin"], kind: "web", target: "https://www.linkedin.com" },
  { id: "x",        name: "X (Twitter)",     aliases: ["twitter", "x.com", "x"], kind: "web", target: "https://x.com" },
  { id: "wikipedia",name: "Wikipédia",       aliases: ["wikipedia", "wikipédia", "wiki"], kind: "web", target: "https://fr.wikipedia.org" },
  { id: "maps",     name: "Google Maps",     aliases: ["maps", "google maps", "carte"], kind: "web", target: "https://maps.google.com" },
  { id: "spotify",  name: "Spotify",   aliases: ["spotify", "musique"], kind: "deeplink", target: "spotify://", fallback_url: "https://open.spotify.com" },
  { id: "discord",  name: "Discord",   aliases: ["discord"], kind: "deeplink", target: "discord://", fallback_url: "https://discord.com/app" },
  { id: "vscode",   name: "VS Code",   aliases: ["vscode", "vs code", "visual studio code"], kind: "deeplink", target: "vscode://", fallback_url: "https://vscode.dev" },
  { id: "slack",    name: "Slack",     aliases: ["slack"], kind: "deeplink", target: "slack://open", fallback_url: "https://app.slack.com" },
  { id: "zoom",     name: "Zoom",      aliases: ["zoom"], kind: "deeplink", target: "zoommtg://", fallback_url: "https://zoom.us" },
];

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function findAppServer(query: string) {
  const q = normalizeStr(query);
  if (!q) return null;
  for (const app of APP_CATALOG_SERVER) {
    if (normalizeStr(app.name) === q) return app;
    if (app.aliases.some((a) => normalizeStr(a) === q)) return app;
  }
  for (const app of APP_CATALOG_SERVER) {
    if (normalizeStr(app.name).includes(q) || q.includes(normalizeStr(app.name))) return app;
    if (app.aliases.some((a) => normalizeStr(a).includes(q) || q.includes(normalizeStr(a)))) return app;
  }
  return null;
}

TOOLS.push({
  type: "function",
  function: {
    name: "open_app",
    description:
      "Ouvre une application/page pour l'utilisateur. Trois cas :\n" +
      "1) Page interne de l'app (Dashboard, Analytics, Documents, Vidéo, WhatsApp, Notifications, Paramètres) → s'ouvre AUTOMATIQUEMENT.\n" +
      "2) Site/web app connue (Gmail, YouTube, GitHub, Notion, Spotify Web, etc.) → bouton de confirmation dans le chat.\n" +
      "3) URL libre (https://...) si l'utilisateur précise un site précis non listé.\n" +
      "Utilise app_name pour une app du catalogue (ex: 'Gmail', 'YouTube', 'Spotify'). " +
      "Utilise url SEULEMENT si l'utilisateur a donné une URL précise ou un site non listé. " +
      "N'appelle PAS cet outil pour de simples mentions ('hier j'étais sur YouTube') — uniquement sur demande explicite ('ouvre/lance/montre-moi…').",
    parameters: {
      type: "object",
      properties: {
        app_name: { type: "string", description: "Nom de l'app dans le catalogue. Ex: 'Gmail', 'YouTube', 'Spotify', 'Documents'." },
        url: { type: "string", description: "URL https complète à ouvrir si app_name n'est pas dans le catalogue." },
      },
    },
  },
});

TOOLS.push({
  type: "function",
  function: {
    name: "launch_local_app",
    description:
      "Ouvre une application installée sur l'ORDINATEUR de l'utilisateur via l'agent local Nex. " +
      "À utiliser quand l'utilisateur dit explicitement 'ouvre/lance/démarre <app>' ET que l'app est " +
      "un programme natif (Notepad, Word, Excel, Photoshop, Steam, OBS, un .exe, un dossier, etc.) " +
      "PLUTÔT qu'un site web. " +
      "Pour les apps web (Gmail, YouTube, etc.), utilise plutôt 'open_app'. " +
      "Le nom 'target' doit être : soit un nom d'exécutable connu du PATH (ex: 'notepad', 'code', " +
      "'spotify'), soit un chemin absolu fourni par l'utilisateur (ex: 'C:\\\\Users\\\\moi\\\\app.exe'). " +
      "L'agent local côté PC vérifie que l'app existe ; s'il n'est pas configuré, l'utilisateur sera invité " +
      "à le faire dans les Paramètres.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Nom d'exécutable (ex: 'notepad', 'code', 'spotify') OU chemin absolu de l'app/fichier/dossier.",
        },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Arguments optionnels passés à l'exécutable (ex: chemin de fichier à ouvrir).",
        },
        label: {
          type: "string",
          description: "Nom lisible affiché à l'utilisateur (ex: 'Notepad', 'Visual Studio Code').",
        },
      },
      required: ["target"],
    },
  },
});

TOOLS.push({
  type: "function",
  function: {
    name: "make_chart",
    description:
      "Crée un graphique inline dans la conversation pour visualiser des données chiffrées. " +
      "À UTILISER dès que tu as des données comparables (évolution dans le temps, parts d'un total, comparaisons entre catégories, etc.) " +
      "que l'utilisateur demande explicitement OU qui rendent ta réponse plus claire. " +
      "Choisis 'kind' selon le besoin : " +
      "'line' = série temporelle ou évolution continue ; " +
      "'bar' = comparaisons entre catégories ; " +
      "'pie' = répartition / parts d'un total (max 6 segments) ; " +
      "'area' = évolution avec accent sur le volume cumulé. " +
      "Tu fournis les données toi-même (faits connus, chiffres récents si tu viens d'utiliser web_search). " +
      "Pour les chiffres récents/incertains, utilise d'abord web_search. " +
      "Format des données : " +
      "- line/bar/area : tableau d'objets {<xKey>, <serie1>, <serie2>...}, ex: [{annee: '2020', revenus: 12, depenses: 9}]. xKey indique la clé d'axe X. " +
      "- pie : tableau d'objets {name, value}, ex: [{name: 'France', value: 40}, {name: 'Allemagne', value: 30}]. " +
      "Maximum 30 points pour line/area, 12 pour bar, 6 pour pie. Mentionne brièvement la source si applicable.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["line", "bar", "pie", "area"], description: "Type de graphique." },
        title: { type: "string", description: "Titre court du graphique." },
        subtitle: { type: "string", description: "Sous-titre/source (optionnel)." },
        xKey: { type: "string", description: "Pour line/bar/area : nom de la clé d'axe X dans data (ex: 'annee', 'mois')." },
        yLabel: { type: "string", description: "Étiquette de l'axe Y (optionnel)." },
        series: {
          type: "array",
          description: "Pour line/bar/area : liste des séries à tracer. Si omis, toutes les clés numériques de data (sauf xKey) sont utilisées.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nom de la série, doit correspondre à une clé dans data." },
            },
            required: ["name"],
          },
        },
        data: {
          type: "array",
          description: "Données du graphique (voir description du tool pour le format selon kind).",
          items: { type: "object" },
        },
      },
      required: ["kind", "data"],
    },
  },
});

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
    items = items.slice(0, 8);
    // Résumé compact pour l'IA (le widget contient déjà le détail visible par l'utilisateur)
    const summary = items.map((n: any, i: number) =>
      `${i + 1}. [${n.source}] ${String(n.title).slice(0, 120)}`
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
      const top = items.slice(0, 5);
      const summary = top.map((it, i) => {
        const snip = String(it.snippet || "").slice(0, 180);
        return `${i + 1}. ${String(it.title).slice(0, 100)} — ${snip} (${it.url})`;
      }).join("\n") || "Aucun résultat.";
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

  if (name === "search_videos") {
    try {
      const url = String(args.url || "").trim();
      const q = String(args.query || "").trim();
      const count = Math.min(8, Math.max(1, parseInt(args.count, 10) || 4));
      const qs = url
        ? `?url=${encodeURIComponent(url)}`
        : q
        ? `?q=${encodeURIComponent(q)}&count=${count}`
        : "";
      if (!qs) return { widget: null, summary: "Aucune requête ou URL vidéo fournie." };
      const r = await fetch(`${SUPABASE_URL}/functions/v1/video-search${qs}`, { headers });
      const data = await r.json();
      const items = data.items || [];
      const summary = items.length
        ? `${items.length} vidéo(s) ${url ? "intégrée(s)" : `trouvée(s) pour "${q}"`}. Titres : ${items.slice(0, 3).map((v: any) => v.title).join(" / ")}.`
        : `Aucune vidéo trouvée${q ? ` pour "${q}"` : ""}.`;
      return { widget: { type: "videos", query: q || undefined, items }, summary };
    } catch (e) {
      console.error("search_videos error", e);
      return { widget: null, summary: "Recherche vidéo échouée." };
    }
  }

  if (name === "send_whatsapp_message") {
    const contact_name = String(args.contact_name || "").trim();
    const body = String(args.body || "").trim();
    if (!contact_name || !body) {
      return { widget: null, summary: "Nom de contact ou message manquant." };
    }
    return {
      widget: { type: "whatsapp_send", contact_name, body },
      summary: `Message WhatsApp préparé pour ${contact_name} : « ${body} ». En attente de confirmation de l'utilisateur dans la carte.`,
    };
  }

  if (name === "create_reminder") {
    const title = String(args.title || "").trim();
    const body = args.body ? String(args.body).trim() : undefined;
    const when_iso = String(args.when_iso || "").trim();
    if (!title || !when_iso) return { widget: null, summary: "Titre ou date du rappel manquant." };
    const ts = Date.parse(when_iso);
    if (isNaN(ts)) return { widget: null, summary: `Date invalide : "${when_iso}".` };
    return {
      widget: { type: "reminder_created", title, body, when_iso },
      summary: `Rappel programmé : "${title}" pour le ${when_iso}.`,
    };
  }

  if (name === "create_insight") {
    const title = String(args.title || "").trim();
    const body = String(args.body || "").trim();
    if (!title || !body) return { widget: null, summary: "Titre ou contenu de l'insight manquant." };
    return {
      widget: { type: "insight_created", title, body },
      summary: `Insight envoyé en notification : "${title}".`,
    };
  }

  if (name === "add_schedule_event") {
    const title = String(args.title || "").trim();
    const start_iso = String(args.start_iso || "").trim();
    if (!title || !start_iso) return { widget: null, summary: "Titre ou date de début manquant." };
    if (isNaN(Date.parse(start_iso))) return { widget: null, summary: `Date invalide : "${start_iso}".` };
    const end_iso = args.end_iso ? String(args.end_iso).trim() : undefined;
    const location = args.location ? String(args.location).trim() : undefined;
    const notes = args.notes ? String(args.notes).trim() : undefined;
    return {
      widget: { type: "schedule", added: { title, start_iso, end_iso, location, notes } },
      summary: `Événement ajouté à l'emploi du temps : "${title}" le ${start_iso}.`,
    };
  }

  if (name === "list_schedule") {
    const range = String(args.range || "all").trim();
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    let from: Date | null = null;
    let to: Date | null = null;
    let label = "tout";
    if (range === "today") {
      from = startOfDay; to = new Date(startOfDay); to.setDate(to.getDate() + 1); label = "Aujourd'hui";
    } else if (range === "tomorrow") {
      from = new Date(startOfDay); from.setDate(from.getDate() + 1);
      to = new Date(from); to.setDate(to.getDate() + 1); label = "Demain";
    } else if (range === "week") {
      from = startOfDay; to = new Date(startOfDay); to.setDate(to.getDate() + 7); label = "Cette semaine";
    } else if (range === "month") {
      from = startOfDay; to = new Date(startOfDay); to.setMonth(to.getMonth() + 1); label = "Ce mois";
    }
    return {
      widget: {
        type: "schedule",
        range_label: label,
        range_start_iso: from ? from.toISOString() : undefined,
        range_end_iso: to ? to.toISOString() : undefined,
      },
      summary: `Affichage de l'emploi du temps : ${label}.`,
    };
  }

  if (name === "remove_schedule_event") {
    const q = String(args.title_query || "").trim();
    if (!q) return { widget: null, summary: "Mot-clé manquant pour la suppression." };
    return {
      widget: { type: "schedule", remove_query: q } as any,
      summary: `Suppression demandée pour les événements contenant "${q}". Le widget effectue la suppression côté client.`,
    };
  }

  if (name === "open_app") {
    const appName = String(args.app_name || "").trim();
    const url = String(args.url || "").trim();

    // Match catalogue d'abord
    if (appName) {
      const found = findAppServer(appName);
      if (found) {
        return {
          widget: {
            type: "open_app",
            app_id: found.id,
            app_name: found.name,
            kind: found.kind,
            target: found.target,
            fallback_url: found.fallback_url,
            // Routes internes : on déclenche l'ouverture auto côté client
            auto_opened: found.kind === "internal",
          },
          summary:
            found.kind === "internal"
              ? `Page "${found.name}" ouverte (route ${found.target}).`
              : `Carte d'ouverture affichée pour ${found.name}. L'utilisateur clique pour confirmer.`,
        };
      }
    }

    // Fallback URL libre
    if (url && /^https?:\/\//i.test(url)) {
      let host = url;
      try { host = new URL(url).hostname; } catch { /* ignore */ }
      return {
        widget: {
          type: "open_app",
          app_name: host,
          kind: "web" as const,
          target: url,
          auto_opened: false,
        },
        summary: `Carte d'ouverture affichée pour ${host}.`,
      };
    }

    return {
      widget: null,
      summary: appName
        ? `App "${appName}" introuvable dans le catalogue. Demande à l'utilisateur de préciser une URL ou un nom plus connu.`
        : "Nom d'app ou URL manquant.",
    };
  }

  if (name === "launch_local_app") {
    const target = String(args.target || "").trim();
    if (!target) {
      return { widget: null, summary: "Cible manquante pour launch_local_app." };
    }
    const argList = Array.isArray(args.args)
      ? args.args.map((a: any) => String(a)).filter((s: string) => s.length > 0)
      : [];
    const label = args.label ? String(args.label).trim() : undefined;
    return {
      widget: {
        type: "launch_local_app",
        target,
        args: argList.length ? argList : undefined,
        label,
      },
      summary:
        `Demande de lancement local envoyée pour "${label || target}". ` +
        `Le widget côté client tente l'ouverture via l'agent Nex sur le PC de l'utilisateur. ` +
        `Si l'agent n'est pas configuré, l'utilisateur sera invité à le faire dans les Paramètres.`,
    };
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

function extractVideoUrl(text: string): string | null {
  const re = /\bhttps?:\/\/[^\s<>"']+/gi;
  const matches = text.match(re) || [];
  for (const raw of matches) {
    const url = raw.replace(/[).,;!?]+$/, "");
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (
        host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be" ||
        host === "vimeo.com" ||
        host.endsWith("tiktok.com") ||
        host.endsWith("instagram.com") ||
        host === "twitter.com" || host === "x.com" ||
        /\.(mp4|webm|mov)(\?|$)/i.test(u.pathname)
      ) {
        return url;
      }
    } catch { /* ignore */ }
  }
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

// --- Helpers d'économie de tokens ---

/** Détecte si le message courant nécessite le contexte planning. */
function needsScheduleContext(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(planning|emploi du temps|agenda|rdv|rendez[- ]?vous|réunion|reunion|cours|dispo|dispo(nibilité|nible)|libre|occup|aujourd'?hui|demain|hier|semaine|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|matin|midi|apr[èe]s[- ]midi|soir|nuit|\bh\d|\d{1,2}h\b|annul|supprim|note(r)?|planifi|ajoute|enregistre|\bmets?\b)/.test(t);
}

/**
 * Filtre les outils déclarés à l'IA selon la pertinence pour la requête courante.
 * Économise ~600-800 tokens / appel en supprimant les schémas inutiles.
 */
function filterToolsForMessage(
  text: string,
  history: any[],
  webSearch: boolean,
  forceTool: string | null,
): any[] {
  const t = text.toLowerCase();
  const histText = history.slice(-3).map((m) => {
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.map((p: any) => p?.text || "").join(" ");
    return "";
  }).join(" ").toLowerCase();
  const ctx = t + " " + histText;

  const matchers: Record<string, RegExp> = {
    fetch_news: /\b(actu|news|nouvelle|info|politique|monde|événement|evenement|à la une|breaking)\b/,
    fetch_stocks: /\b(bourse|action|stock|cours|nasdaq|cac|s&p|nvda|tesla|apple|crypto|march[ée])\b/,
    web_search: /\b(cherche|recherche|trouve|qui est|c'?est quoi|d[ée]finition|comparaison|combien|quand|où|web)\b/,
    generate_image: /\b(g[ée]n[èe]re|cr[ée]e|dessine|illustr|fais[- ]moi une image|image de|peinture)\b/,
    search_images: /\b(photo|photos|image|images|mod[èe]le|exemple|montre|visuel|r[ée]f[ée]rence)\b/,
    search_videos: /\b(vid[ée]o|youtube|tuto|tutoriel|regarde|film|clip)\b/,
    send_whatsapp_message: /\b(whatsapp|envoie|écris|ecris|dis [àa]|message [àa])\b/,
    create_reminder: /\b(rappelle|rappel|pr[ée]viens|n'?oublie|alerte|dans \d|demain [àa]|ce soir [àa])\b/,
    create_insight: /\b(conseil|suggestion|recommand|insight|observation)\b/,
    add_schedule_event: /\b(ajoute|note|planifie|enregistre|mets dans (mon )?(agenda|planning|emploi))\b/,
    list_schedule: /\b(planning|emploi du temps|agenda|qu'?est[- ]ce que j'?ai|mon planning|mes rdv)\b/,
    remove_schedule_event: /\b(annul|supprim|enl[èe]ve|retire)\b.*(rdv|rendez|r[ée]union|cours|planning|agenda)/,
    open_app: /\b(ouvre|ouvrir|lance|lancer|d[ée]marre|emm[èe]ne|am[èe]ne|va sur|navigue|montre[- ]moi (la )?(page|le site)|acc[èe]de [àa])\b/,
  };

  // Outils toujours actifs (forcés ou contextuels)
  const alwaysOn = new Set<string>();
  if (webSearch) alwaysOn.add("web_search");
  if (forceTool === "image") alwaysOn.add("generate_image");

  const filtered = TOOLS.filter((tool) => {
    const name = tool.function?.name;
    if (!name) return false;
    if (alwaysOn.has(name)) return true;
    const re = matchers[name];
    if (!re) return true; // outil sans matcher : conservé par sécurité
    return re.test(ctx);
  });

  // Garde-fou : si tout a été filtré, garder un set minimal pour ne pas bloquer.
  return filtered.length ? filtered : TOOLS.filter((t) => ["web_search", "search_images"].includes(t.function?.name));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, lang, detailLevel, customInstructions, aiName, attachments, webSearch, deepThink, forceTool, schedule } = await req.json();
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
            docTexts.push(`\n\n--- Document joint: ${a.name || "document"} ---\n${a.text.slice(0, 12000)}\n--- fin du document ---`);
          } else if (a.kind === "audio" && typeof a.text === "string") {
            docTexts.push(`\n\n--- Transcription audio: ${a.name || "audio"} ---\n${a.text.slice(0, 8000)}\n--- fin transcription ---`);
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
          const userText = latestUserText(messages);
          // Construit le prompt système en fonction du message courant (gain de tokens si planning non pertinent)
          const SYSTEM_PROMPT = buildSystemPrompt({
            lang: typeof lang === "string" ? lang : "fr",
            detailLevel: typeof detailLevel === "string" ? detailLevel : "normal",
            customInstructions: typeof customInstructions === "string" ? customInstructions : "",
            aiName: typeof aiName === "string" ? aiName : "",
            webSearch: !!webSearch,
            forceTool: typeof forceTool === "string" ? forceTool : null,
            schedule: Array.isArray(schedule) ? schedule : [],
            scheduleRelevant: needsScheduleContext(userText),
          });
          const pastedVideoUrl = extractVideoUrl(userText);
          if (pastedVideoUrl) {
            const { widget, summary } = await callTool("search_videos", { url: pastedVideoUrl });
            if (widget) send({ widgets: [widget] });
            send({ delta: `Voilà la vidéo intégrée monsieur. ${summary}` });
            send({ done: true });
            controller.close();
            return;
          }

          const inferredImageQuery = inferImageSearchQuery(userText);
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
            model: deepThink ? "google/gemini-3.1-pro-preview" : "google/gemini-3-flash-preview",
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
            tools: filterToolsForMessage(userText, messages, !!webSearch, forceTool),
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