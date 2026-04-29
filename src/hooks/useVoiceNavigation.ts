import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";

/**
 * Routes accessibles par commande vocale.
 * L'ordre compte : on prend le 1er match. Mets les patterns spécifiques avant les génériques.
 */
const VOICE_ROUTES: { path: string; label: string; patterns: RegExp[] }[] = [
  {
    path: "/",
    label: "le menu vocal",
    patterns: [
      /\b(menu (principal|vocal)|orbe?|sph[èe]re|page d['e ]?accueil|accueil)\b/,
      /\bretour (?:au|à la) (?:menu|accueil|principal)\b/,
    ],
  },
  { path: "/home", label: "l'accueil", patterns: [/\b(home|page principale|tableau principal)\b/] },
  { path: "/dashboard", label: "le tableau de bord", patterns: [/\b(dashboard|tableau de bord)\b/] },
  { path: "/analytics", label: "les analyses", patterns: [/\b(analytics?|analyses?|statistiques?|stats)\b/] },
  { path: "/agenda", label: "l'agenda", patterns: [/\b(agenda|calendrier|planning|rendez[- ]vous)\b/] },
  { path: "/documents", label: "les documents", patterns: [/\b(documents?|fichiers?|dossiers?)\b/] },
  { path: "/notifications", label: "les notifications", patterns: [/\b(notifications?|alertes?)\b/] },
  { path: "/video", label: "l'éditeur vidéo", patterns: [/\b(vid[ée]o|montage|[ée]diteur vid[ée]o)\b/] },
  { path: "/billing", label: "la facturation", patterns: [/\b(facturation|abonnement|billing|paiement)\b/] },
  { path: "/settings", label: "les réglages", patterns: [/\b(r[ée]glages?|param[èe]tres?|settings|configuration)\b/] },
  { path: "/admin/voice", label: "l'admin vocal", patterns: [/\b(admin (vocal|voix)|configuration vocale|elevenlabs)\b/] },
  { path: "/admin/users", label: "l'admin utilisateurs", patterns: [/\b(admin (users?|utilisateurs?)|gestion utilisateurs?)\b/] },
];

/** Verbes d'intention (ouvrir / aller / afficher / montrer / lance / va sur / etc.). */
const INTENT_RE =
  /\b(ouvre|ouvrir|affiche|afficher|montre|montrer|va sur|va à|va au|am[èe]ne|emm[èe]ne|emmene|lance|d[ée]marre|aller (?:sur|à|au)|navigue|retourne)\b/;

/** Hook global : écoute les nouveaux messages user et navigue si une intention est détectée. */
export function useVoiceNavigation() {
  const { transcript } = useTwinVoiceContext();
  const navigate = useNavigate();
  const lastHandledIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (last.role !== "user") return;
    if (lastHandledIdRef.current === last.id) return;
    lastHandledIdRef.current = last.id;

    const text = last.text.toLowerCase().normalize("NFC");
    if (!INTENT_RE.test(text)) return;

    const match = VOICE_ROUTES.find((r) => r.patterns.some((p) => p.test(text)));
    if (!match) return;

    if (window.location.pathname === match.path) return;
    navigate(match.path);
    toast.success(`Ouverture de ${match.label}`, { duration: 1800 });
  }, [transcript, navigate]);
}
