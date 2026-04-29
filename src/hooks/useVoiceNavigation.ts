import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";

/**
 * Routes accessibles par commande vocale.
 * L'ordre compte : on prend le 1er match. Patterns spécifiques AVANT les génériques.
 * Note : tout le texte est normalisé sans accents avant le test, donc les patterns
 * doivent être écrits SANS accents (ex: "reglages" et non "réglages").
 */
const VOICE_ROUTES: { path: string; label: string; patterns: RegExp[] }[] = [
  {
    path: "/admin/voice",
    label: "l'admin vocal",
    patterns: [/\b(admin (vocal|voix|voice)|configuration vocale|elevenlabs|reglages? (vocal|voix))\b/i],
  },
  {
    path: "/admin/users",
    label: "l'admin utilisateurs",
    patterns: [/\b(admin (users?|utilisateurs?)|gestion (des )?utilisateurs?)\b/i],
  },
  { path: "/dashboard",     label: "le tableau de bord", patterns: [/\b(dashboard|tableau de bord)\b/i] },
  { path: "/analytics",     label: "les analyses",       patterns: [/\b(analytics?|analyses?|statistiques?|stats)\b/i] },
  { path: "/agenda",        label: "l'agenda",            patterns: [/\b(agenda|calendrier|planning|rendez[- ]?vous)\b/i] },
  { path: "/documents",     label: "les documents",       patterns: [/\b(documents?|fichiers?|dossiers?)\b/i] },
  { path: "/notifications", label: "les notifications",   patterns: [/\b(notifications?|alertes?)\b/i] },
  { path: "/video",         label: "l'éditeur vidéo",      patterns: [/\b(video|montage|editeur video)\b/i] },
  { path: "/billing",       label: "la facturation",       patterns: [/\b(facturation|abonnement|billing|paiement)\b/i] },
  { path: "/settings",      label: "les réglages",         patterns: [/\b(reglages?|parametres?|settings|configuration)\b/i] },
  { path: "/home",          label: "l'accueil classique",  patterns: [/\b(home|page principale|tableau principal|interface chat)\b/i] },
  {
    path: "/",
    label: "le menu vocal",
    patterns: [
      /\bmenu (principal|vocal|d[''e]?accueil)?\b/i,
      /\b(orbe?|sphere|page d[''e]?accueil|accueil|voice ?orb)\b/i,
      /\bretour (?:au|a la|a l[''e]?) (?:menu|accueil|principal)\b/i,
    ],
  },
];

/**
 * Verbes d'intention. OPTIONNEL : si présent on navigue toujours, sinon on
 * navigue uniquement si la phrase est COURTE (≤ 6 mots) — typique d'une
 * commande directe ("menu principal", "agenda", "tableau de bord").
 */
const INTENT_RE =
  /\b(ouvre|ouvrir|affiche|afficher|montre|montrer|va |aller |amene|emmene|emmenes|lance|lancer|demarre|demarrer|navigue|retourne|retour|passe|bascule)\b/i;

/** Retire accents + ponctuation finale + espaces multiples. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[.,!?;:…"]+/g, " ")
    // "ouvre-slash-home" / "slash home" → on retire le mot "slash" et les "/"
    .replace(/\bslash\b/g, " ")
    .replace(/\//g, " ")
    // tirets entre mots (souvent ajoutés par STT) → espaces
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hook global : écoute les nouveaux messages user et navigue si une intention est détectée. */
export function useVoiceNavigation() {
  const { transcript, stopSpeaking } = useTwinVoiceContext();
  const navigate = useNavigate();
  const lastHandledIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (last.role !== "user") return;
    if (lastHandledIdRef.current === last.id) return;
    lastHandledIdRef.current = last.id;

    const raw = last.text;
    const text = normalize(raw);
    if (!text) return;

    const wordCount = text.split(" ").length;
    const hasIntent = INTENT_RE.test(text);
    const isShortCommand = wordCount <= 6;

    // On accepte la commande si : verbe d'intention présent, OU phrase très courte.
    if (!hasIntent && !isShortCommand) {
      console.debug("[voice-nav] ignoré (pas d'intention, phrase trop longue):", raw);
      return;
    }

    const match = VOICE_ROUTES.find((r) => r.patterns.some((p) => p.test(text)));
    if (!match) {
      console.debug("[voice-nav] aucune route ne correspond:", text);
      return;
    }

    if (window.location.pathname === match.path) {
      console.debug("[voice-nav] déjà sur", match.path);
      toast.info(`Tu es déjà sur ${match.label}`, { duration: 1500 });
      return;
    }

    console.info("[voice-nav] navigation:", match.path, "←", raw);
    navigate(match.path);
    // Coupe immédiatement la voix de l'IA pour éviter qu'elle dise "je ne peux pas".
    try { stopSpeaking(); } catch { /* ignore */ }
    toast.success(`Ouverture de ${match.label}`, { duration: 1800 });
  }, [transcript, navigate, stopSpeaking]);
}
