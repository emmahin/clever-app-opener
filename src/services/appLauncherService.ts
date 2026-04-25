/**
 * Catalogue d'applications ouvrables depuis l'IA, et service de lancement.
 *
 * Limites du navigateur web :
 *  - "internal"  : route interne de l'app → navigation React Router (auto, instantané).
 *  - "web"       : URL https → window.open dans un nouvel onglet (auto si déclenché par l'utilisateur).
 *  - "deeplink"  : protocole custom (spotify://, vscode://, discord://) → marche uniquement si
 *                  l'app est installée sur la machine. Le navigateur affiche un popup "Ouvrir … ?".
 *  - Apps locales arbitraires (.exe, Terminal, Finder) : IMPOSSIBLE depuis le web (sandbox sécurité).
 *    Il faudrait empaqueter l'app en Electron pour ça.
 */

export type AppKind = "internal" | "web" | "deeplink";

export interface AppEntry {
  id: string;
  name: string;
  aliases: string[];        // mots-clés de matching (en minuscules, sans accents idéalement)
  kind: AppKind;
  target: string;           // route, URL https ou deep link
  fallbackUrl?: string;     // URL web à utiliser si le deep link ne marche pas
  description?: string;
}

export const APP_CATALOG: AppEntry[] = [
  // ── Routes internes de l'app ────────────────────────────────────────────
  { id: "internal-dashboard", name: "Dashboard",     aliases: ["dashboard", "tableau de bord", "accueil"], kind: "internal", target: "/dashboard" },
  { id: "internal-analytics", name: "Analytics",     aliases: ["analytics", "stats", "statistiques", "analyses"], kind: "internal", target: "/analytics" },
  { id: "internal-documents", name: "Documents",     aliases: ["documents", "docs", "fichiers"], kind: "internal", target: "/documents" },
  { id: "internal-video",     name: "Éditeur vidéo", aliases: ["video", "vidéo", "editeur video", "éditeur vidéo", "montage"], kind: "internal", target: "/video" },
  { id: "internal-whatsapp",  name: "WhatsApp (app)", aliases: ["whatsapp interne", "page whatsapp", "mes messages"], kind: "internal", target: "/whatsapp" },
  { id: "internal-notifs",    name: "Notifications", aliases: ["notifications", "notifs", "alertes"], kind: "internal", target: "/notifications" },
  { id: "internal-settings",  name: "Paramètres",    aliases: ["paramètres", "parametres", "réglages", "settings"], kind: "internal", target: "/settings" },
  { id: "internal-install",   name: "Installer Nex", aliases: ["installer", "installation", "installer l'app", "installer app", "mettre sur le bureau", "ajouter à l'écran d'accueil", "pwa", "install"], kind: "internal", target: "/install" },

  // ── Web apps (toujours fiables) ─────────────────────────────────────────
  { id: "gmail",    name: "Gmail",           aliases: ["gmail", "mail", "email", "boite mail", "boîte mail"], kind: "web", target: "https://mail.google.com" },
  { id: "gcal",     name: "Google Agenda",   aliases: ["google calendar", "agenda", "calendrier google", "gcal"], kind: "web", target: "https://calendar.google.com" },
  { id: "gdrive",   name: "Google Drive",    aliases: ["drive", "google drive", "gdrive"], kind: "web", target: "https://drive.google.com" },
  { id: "gdocs",    name: "Google Docs",     aliases: ["google docs", "docs google"], kind: "web", target: "https://docs.google.com" },
  { id: "gsheets",  name: "Google Sheets",   aliases: ["sheets", "google sheets", "tableur google"], kind: "web", target: "https://sheets.google.com" },
  { id: "youtube",  name: "YouTube",         aliases: ["youtube", "yt"], kind: "web", target: "https://www.youtube.com" },
  { id: "google",   name: "Google",          aliases: ["google", "recherche google"], kind: "web", target: "https://www.google.com" },
  { id: "chatgpt",  name: "ChatGPT",         aliases: ["chatgpt", "openai", "gpt"], kind: "web", target: "https://chat.openai.com" },
  { id: "claude",   name: "Claude",          aliases: ["claude", "anthropic"], kind: "web", target: "https://claude.ai" },
  { id: "gemini",   name: "Gemini",          aliases: ["gemini", "bard", "google ai"], kind: "web", target: "https://gemini.google.com" },
  { id: "github",   name: "GitHub",          aliases: ["github", "git"], kind: "web", target: "https://github.com" },
  { id: "notion",   name: "Notion",          aliases: ["notion"], kind: "web", target: "https://www.notion.so" },
  { id: "linear",   name: "Linear",          aliases: ["linear"], kind: "web", target: "https://linear.app" },
  { id: "figma",    name: "Figma",           aliases: ["figma"], kind: "web", target: "https://www.figma.com" },
  { id: "linkedin", name: "LinkedIn",        aliases: ["linkedin"], kind: "web", target: "https://www.linkedin.com" },
  { id: "x",        name: "X (Twitter)",     aliases: ["twitter", "x.com", "x"], kind: "web", target: "https://x.com" },
  { id: "reddit",   name: "Reddit",          aliases: ["reddit"], kind: "web", target: "https://www.reddit.com" },
  { id: "amazon",   name: "Amazon",          aliases: ["amazon"], kind: "web", target: "https://www.amazon.fr" },
  { id: "wikipedia",name: "Wikipédia",       aliases: ["wikipedia", "wikipédia", "wiki"], kind: "web", target: "https://fr.wikipedia.org" },
  { id: "maps",     name: "Google Maps",     aliases: ["maps", "google maps", "carte"], kind: "web", target: "https://maps.google.com" },
  { id: "translate",name: "Google Traduction",aliases: ["traduction", "translate", "traducteur"], kind: "web", target: "https://translate.google.com" },

  // ── Deep links vers apps natives (avec fallback web) ────────────────────
  { id: "spotify",  name: "Spotify",   aliases: ["spotify", "musique"], kind: "deeplink", target: "spotify://", fallbackUrl: "https://open.spotify.com" },
  { id: "discord",  name: "Discord",   aliases: ["discord"], kind: "deeplink", target: "discord://", fallbackUrl: "https://discord.com/app" },
  { id: "vscode",   name: "VS Code",   aliases: ["vscode", "vs code", "visual studio code", "code editor"], kind: "deeplink", target: "vscode://", fallbackUrl: "https://vscode.dev" },
  { id: "slack",    name: "Slack",     aliases: ["slack"], kind: "deeplink", target: "slack://open", fallbackUrl: "https://app.slack.com" },
  { id: "zoom",     name: "Zoom",      aliases: ["zoom"], kind: "deeplink", target: "zoommtg://", fallbackUrl: "https://zoom.us" },
  { id: "whatsapp-app", name: "WhatsApp", aliases: ["whatsapp"], kind: "deeplink", target: "whatsapp://", fallbackUrl: "https://web.whatsapp.com" },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Cherche une app dans le catalogue par nom/alias (matching tolérant). */
export function findAppInCatalog(query: string): AppEntry | null {
  const q = normalize(query);
  if (!q) return null;
  // Match exact d'abord
  for (const app of APP_CATALOG) {
    if (normalize(app.name) === q) return app;
    if (app.aliases.some((a) => normalize(a) === q)) return app;
  }
  // Puis match partiel
  for (const app of APP_CATALOG) {
    if (normalize(app.name).includes(q) || q.includes(normalize(app.name))) return app;
    if (app.aliases.some((a) => normalize(a).includes(q) || q.includes(normalize(a)))) return app;
  }
  return null;
}

/** Effectue l'ouverture côté navigateur. À appeler depuis un handler de clic utilisateur. */
export function openAppTarget(opts: {
  kind: AppKind;
  target: string;
  fallbackUrl?: string;
  navigate?: (path: string) => void;     // injecté depuis React Router
}): { ok: boolean; method: "navigate" | "tab" | "deeplink"; message: string } {
  const { kind, target, fallbackUrl, navigate } = opts;

  if (kind === "internal") {
    if (navigate) {
      navigate(target);
      return { ok: true, method: "navigate", message: `Navigué vers ${target}.` };
    }
    window.location.href = target;
    return { ok: true, method: "navigate", message: `Navigué vers ${target}.` };
  }

  if (kind === "web") {
    const w = window.open(target, "_blank", "noopener,noreferrer");
    if (!w) {
      return { ok: false, method: "tab", message: "Le navigateur a bloqué la pop-up. Autorise les pop-ups pour ce site." };
    }
    return { ok: true, method: "tab", message: `Ouvert ${target} dans un nouvel onglet.` };
  }

  // deeplink : on tente UNIQUEMENT le protocole custom.
  // On n'ouvre JAMAIS de fallback web automatique (règle utilisateur).
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = target;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 1500);
  } catch {
    /* ignore */
  }
  return {
    ok: true,
    method: "deeplink",
    message: `Tentative d'ouverture de ${target}. Si rien ne se passe, l'app n'est pas installée — pas de fallback web automatique.`,
  };
}

/** Compact summary du catalogue, pour l'injecter dans le prompt système de l'IA. */
export function buildAppCatalogHint(): string {
  return APP_CATALOG
    .map((a) => `- ${a.name} (${a.id}) [${a.kind}]`)
    .join("\n");
}
