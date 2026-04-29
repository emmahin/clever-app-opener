import { forwardRef, useEffect, useRef, useState } from "react";
import { X, PhoneOff, Minimize2, Mic } from "lucide-react";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";
import { twinMemoryService, type MemoryCategory } from "@/services";
import { useLanguage } from "@/i18n/LanguageProvider";
import { toast } from "sonner";
import { ChatOrb } from "@/components/chatbot/ChatOrb";

export interface VoiceTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Appelé pour chaque nouveau tour de parole (utilisateur ou IA) afin de l'enregistrer dans le chat. */
  onTurn?: (turn: VoiceTurn) => void;
  /**
   * Appelé quand on détecte que l'utilisateur a demandé vocalement quelque chose
   * d'affichable (agenda, actus, marchés, paramètres…). Le parent peut alors
   * minimiser l'overlay et afficher le widget correspondant dans le chat.
   * Retourner `true` pour signaler que l'intention a été prise en charge
   * (le composant déclenchera alors `setMinimized(true)` automatiquement).
   */
  onVoiceIntent?: (intent: VoiceIntent) => boolean | void | Promise<boolean | void>;
}

export type VoiceIntent =
  | { kind: "agenda"; rangeLabel?: string }
  | { kind: "news" }
  | { kind: "stocks" }
  | { kind: "route"; path: string; label: string }
  | { kind: "settings" }
  | { kind: "notifications" }
  | { kind: "n8n"; prompt: string };

/**
 * Détecte si la requête vocale demande l'affichage de quelque chose
 * (agenda, actus, marchés…). Retourne l'intention ou `null`.
 * On reste volontairement permissif : "montre-moi mon agenda", "c'est quoi mon
 * agenda", "qu'est-ce que j'ai aujourd'hui", "les news", "le cours du Bitcoin"…
 */
function detectVoiceIntent(text: string): VoiceIntent | null {
  const t = text.toLowerCase();
  // n8n : "lance le workflow ...", "déclenche n8n ...", "exécute mon automatisation ..."
  if (/\b(n8n|workflow|automatisation|automation)\b/.test(t) ||
      /\b(lance|d[ée]clenche|ex[ée]cute|envoie)\b.*\b(workflow|automatisation|n8n|webhook)\b/.test(t)) {
    return { kind: "n8n", prompt: text };
  }
  const wantsDirectRoute = /\b(ouvre|ouvrir|va|vas|aller|redirige|redirection|am[eè]ne|emm[eè]ne|acc[eè]de|affiche|montrer?|montre|page|menu)\b/.test(t);
  const routes: Array<{ path: string; label: string; re: RegExp }> = [
    { path: "/dashboard", label: "Tableau de bord", re: /\b(tableau de bord|dashboard)\b/ },
    { path: "/analytics", label: "Analytics", re: /\b(analytics|analyses?|statistiques?|stats)\b/ },
    { path: "/documents", label: "Documents", re: /\b(documents?|fichiers?)\b/ },
    { path: "/video", label: "Éditeur vidéo", re: /\b(vid[ée]o|montage|[ée]diteur vid[ée]o)\b/ },
    { path: "/billing", label: "Facturation", re: /\b(facturation|abonnement|billing|cr[ée]dits?)\b/ },
    { path: "/agenda", label: "Agenda", re: /\b(agenda|calendrier|planning|emploi du temps)\b/ },
    { path: "/settings", label: "Paramètres", re: /\b(param[èe]tres?|r[ée]glages?|settings?|pr[ée]f[ée]rences?)\b/ },
    { path: "/notifications", label: "Notifications", re: /\b(notifications?|alertes?)\b/ },
  ];
  const directRoute = routes.find((route) => route.re.test(t));
  if (directRoute && wantsDirectRoute) {
    return { kind: "route", path: directRoute.path, label: directRoute.label };
  }
  // Agenda / planning
  if (/\b(agenda|calendrier|planning|emploi du temps|rendez[-\s]?vous|rdv|prochain|évén?ements?|aujourd['’]hui|demain|cette semaine|prochaine semaine|ce week[-\s]?end|ce mois|libre|disponible|réuni(?:on|ons))\b/.test(t)) {
    if (wantsDirectRoute && /\b(agenda|calendrier|planning|emploi du temps)\b/.test(t)) {
      return { kind: "route", path: "/agenda", label: "Agenda" };
    }
    let rangeLabel: string | undefined;
    if (/\baujourd['’]hui\b/.test(t)) rangeLabel = "Aujourd'hui";
    else if (/\bdemain\b/.test(t)) rangeLabel = "Demain";
    else if (/\bcette semaine\b/.test(t)) rangeLabel = "Cette semaine";
    else if (/\bce week[-\s]?end\b/.test(t)) rangeLabel = "Ce week-end";
    else if (/\bce mois\b/.test(t)) rangeLabel = "Ce mois";
    return { kind: "agenda", rangeLabel };
  }
  // News
  if (/\b(actu(?:s|alit[ée]s?)?|news|nouvelles|infos?|journal)\b/.test(t)) {
    return { kind: "news" };
  }
  // Bourse / marchés
  if (/\b(bourse|march[ée]s?|stock|action|cac\s?40|nasdaq|s&p|bitcoin|crypto|cours)\b/.test(t)) {
    return { kind: "stocks" };
  }
  // Notifications
  if (/\b(notifications?|alertes?)\b/.test(t)) {
    return wantsDirectRoute ? { kind: "route", path: "/notifications", label: "Notifications" } : { kind: "notifications" };
  }
  // Paramètres
  if (/\b(param[èe]tres?|r[ée]glages?|settings?|pr[ée]f[ée]rences?)\b/.test(t)) {
    return wantsDirectRoute ? { kind: "route", path: "/settings", label: "Paramètres" } : { kind: "settings" };
  }
  return null;
}

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  habit: "Habitude",
  preference: "Préférence",
  goal: "Objectif",
  fact: "Fait",
  emotion: "Émotion",
  relationship: "Relation",
};

export const VoiceCallMode = forwardRef<HTMLDivElement, Props>(function VoiceCallMode(
  { open, onClose, onTurn, onVoiceIntent }: Props,
  ref,
) {
  const { t } = useLanguage();
  const {
    isCallActive,
    status,
    transcript,
    startCall,
    endCall,
    clearTranscript,
    setContextProviders,
    audioLevel,
  } = useTwinVoiceContext();

  const [starting, setStarting] = useState(false);
  // Permet de masquer l'overlay plein écran tout en GARDANT l'appel actif
  // (l'utilisateur revient au menu principal mais Lia continue à parler/écouter).
  const [minimized, setMinimized] = useState(false);
  // Niveau audio lissé via interpolation (lerp) — évite tout pic brusque.
  const [smoothedLevel, setSmoothedLevel] = useState(0);
  const smoothedRef = useRef(0);
  const memoriesContextRef = useRef<string>("");
  const eventsContextRef = useRef<string>("");
  const sentTurnSigsRef = useRef<Map<string, string>>(new Map());
  const handledIntentIdsRef = useRef<Set<string>>(new Set());

  // Boucle d'interpolation : on rapproche en douceur le niveau affiché du
  // niveau réel (montée plus lente que la descente pour un rendu organique).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target = audioLevel || 0;
      const cur = smoothedRef.current;
      // Lerp asymétrique : montée 0.08, descente 0.05 → mouvement "respirant".
      const k = target > cur ? 0.08 : 0.05;
      const next = cur + (target - cur) * k;
      smoothedRef.current = next;
      setSmoothedLevel(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioLevel]);

  // Notifie le parent à chaque nouveau turn (user ou assistant) — pour persistance dans le chat
  useEffect(() => {
    if (transcript.length === 0) return;

    // Important : React peut regrouper l'ajout du message utilisateur et du
    // message assistant vide. Si on ne regarde que le dernier élément, on rate
    // alors complètement l'intention utilisateur, donc plus aucune redirection.
    transcript.forEach((turn) => {
      const text = turn.text?.trim();
      if (!text) return;

      if (onTurn) {
        const sig = `${turn.id}:${text.length}`;
        if (sentTurnSigsRef.current.get(turn.id) !== sig) {
          sentTurnSigsRef.current.set(turn.id, sig);
          onTurn({ id: turn.id, role: turn.role, text: turn.text, ts: turn.ts });
        }
      }

      // Détection d'intention SUR TOUS les messages utilisateur non traités,
      // même s'ils ne sont déjà plus le dernier message du transcript.
      if (turn.role !== "user" || !onVoiceIntent || handledIntentIdsRef.current.has(turn.id)) return;
      handledIntentIdsRef.current.add(turn.id);
      const intent = detectVoiceIntent(turn.text);
      if (!intent) return;

      try {
        const handled = onVoiceIntent(intent);
        if (handled instanceof Promise) {
          setMinimized(true);
          handled.catch((err) => console.warn("[VoiceCallMode] voice intent failed", err));
        } else if (handled !== false) {
          setMinimized(true);
        }
      } catch (err) {
        console.warn("[VoiceCallMode] voice intent failed", err);
      }
    });
  }, [transcript, onTurn, onVoiceIntent]);

  // Charge le contexte mémoire/agenda à l'ouverture
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [memories, events] = await Promise.all([
          twinMemoryService.listMemories(),
          twinMemoryService.listEvents(60),
        ]);
        if (cancelled) return;
        memoriesContextRef.current = memories
          .slice(0, 30)
          .map((m) => `- [${CATEGORY_LABEL[m.category]}] ${m.content}`)
          .join("\n");
        eventsContextRef.current = events
          .slice(0, 15)
          .map((e) => {
            const d = new Date(e.start_iso);
            return `- ${d.toLocaleString("fr-FR")} : ${e.title}${e.location ? ` (${e.location})` : ""}`;
          })
          .join("\n");
      } catch (err) {
        console.warn("[VoiceCallMode] context load failed", err);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Branche les providers de contexte + handler d'erreur
  useEffect(() => {
    setContextProviders({
      getMemoriesContext: () => memoriesContextRef.current,
      getEventsContext: () => eventsContextRef.current,
      onError: (msg) => toast.error(msg),
    });
  }, [setContextProviders]);

  // Démarre l'appel automatiquement à l'ouverture
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      clearTranscript();
      setStarting(true);
      try {
        await startCall();
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      endCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Quand on ferme l'overlay, on remet aussi l'état "non minimisé" pour le prochain appel.
  useEffect(() => {
    if (!open) setMinimized(false);
  }, [open]);

  if (!open) return null;

  const phase: "idle" | "listening" | "thinking" | "speaking" =
    starting ? "thinking" : status;

  // Waveform centrée style "audio wave" : nombreuses barres fines, enveloppe
  // en cloche (plus hautes au centre), modulation pseudo-aléatoire animée
  // multipliée par le niveau audio réel du micro.
  const BAR_COUNT = 27;

  // ─── Mode RÉDUIT : pastille flottante en bas à droite, l'appel reste actif ───
  if (minimized) {
    // Tout en violet : on ne change que la luminosité selon la phase.
    const ringColor =
      phase === "speaking" ? "hsl(270 95% 70%)"
        : phase === "thinking" ? "hsl(270 80% 55%)"
        : "hsl(270 90% 65%)";
    return (
      <button
        ref={ref as unknown as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-full shadow-2xl bg-background/95 backdrop-blur-xl border border-border/60 hover:scale-[1.03] transition-transform"
        title={t("voiceExpand") || "Reprendre l'appel"}
        aria-label={t("voiceExpand") || "Reprendre l'appel"}
      >
        <span
          className="relative w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: `radial-gradient(circle, ${ringColor} 0%, transparent 70%)` }}
        >
          <Mic className="w-4 h-4 text-foreground" />
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: ringColor, opacity: 0.25 }}
          />
        </span>
        <span className="text-sm font-medium text-foreground">
          {phase === "speaking" ? (t("voiceSpeaking") || "Lia parle…")
            : phase === "thinking" ? (t("voiceThinking") || "Réflexion…")
            : (t("voiceListening") || "À l'écoute")}
        </span>
      </button>
    );
  }

  return (
    <div ref={ref} className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-2xl flex flex-col items-center justify-between py-12 px-6">
      {/* Bouton "Réduire" : revient au menu principal SANS couper l'appel. */}
      <button
        onClick={() => setMinimized(true)}
        className="absolute top-6 left-6 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"
        aria-label={t("voiceMinimize") || "Réduire"}
        title={t("voiceMinimize") || "Réduire"}
      >
        <Minimize2 className="w-5 h-5" />
      </button>
      {/* Bouton "Fermer" : ferme l'overlay (l'appel sera coupé par le cleanup useEffect). */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      <div />

      <div className="flex-1 flex flex-col items-center justify-center gap-8 w-full max-w-xl">
        <div className="relative w-80 h-80">
          <div
            className="absolute -inset-20 rounded-full pointer-events-none blur-[72px] opacity-90"
            style={{
              background:
                phase === "listening"
                  ? "conic-gradient(from 0deg, hsl(280 95% 65% / 0.55), hsl(270 90% 60% / 0.45), hsl(260 95% 65% / 0.55), hsl(280 95% 65% / 0.55))"
                  : phase === "thinking"
                  ? "conic-gradient(from 0deg, hsl(285 90% 65% / 0.5), hsl(270 85% 55% / 0.45), hsl(260 90% 60% / 0.5), hsl(285 90% 65% / 0.5))"
                  : phase === "speaking"
                  ? "conic-gradient(from 0deg, hsl(270 95% 65% / 0.55), hsl(310 90% 65% / 0.5), hsl(250 95% 65% / 0.55), hsl(270 95% 65% / 0.55))"
                  : "radial-gradient(circle at center, hsl(270 80% 50% / 0.35), transparent 70%)",
            }}
          />
          {/* Cercle + étoiles en orbite (même visuel que l'écran d'accueil) */}
          <div
            className="relative w-full h-full flex items-center justify-center transition-transform duration-700"
            style={{
              animation:
                phase === "listening"
                  ? "galaxy-listening 7s ease-in-out infinite"
                  : phase === "speaking"
                  ? "galaxy-speaking 5s ease-in-out infinite"
                  : phase === "thinking"
                  ? "galaxy-thinking 8s ease-in-out infinite"
                  : "galaxy-idle 40s ease-in-out infinite",
            }}
          >
            <div className="scale-[1.6]">
              <ChatOrb isLoading={phase === "thinking"} />
            </div>
          </div>
        </div>

        {/* Indicateur de volume — hauteurs pilotées par le niveau audio réel */}
        <div
          className="flex items-center justify-center gap-[3px] h-24 w-full max-w-md"
          aria-label={t("voiceListening")}
        >
          {Array.from({ length: BAR_COUNT }).map((_, i) => {
            const center = (BAR_COUNT - 1) / 2;
            const dist = Math.abs(i - center) / center;
            const envelope = Math.pow(1 - dist, 1.6) * 0.85 + 0.15;
            // Oscillation très lente : impression de respiration organique.
            const t1 = Date.now() / 600 + i * 0.45;
            const wiggle = 0.55 + 0.18 * Math.sin(t1) * Math.cos(t1 * 0.5 + i * 0.3);
            // Respiration de fond permanente (très subtile) pour ne jamais figer.
            const breath = 0.025 + 0.012 * Math.sin(Date.now() / 1400 + i * 0.2);
            // Le niveau lissé (smoothedLevel) intègre l'inertie : pas de pic
            // brusque, transitions fluides via lerp ci-dessous.
            const active = phase === "listening" && smoothedLevel > 0.08;
            const signal = active ? Math.min(smoothedLevel * 0.09, 0.11) : 0;
            const amp = envelope * (wiggle * (signal + breath));
            const h = 2 + amp * 14;
            const color =
              phase === "speaking"
                ? "hsl(280 95% 70%)"
                : phase === "thinking"
                ? "hsl(270 80% 60%)"
                : "hsl(270 90% 65%)";
            return (
              <span
                key={i}
                className="block w-[3px] rounded-full transition-[height] duration-300 ease-out"
                style={{ height: `${h}px`, background: color }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => { endCall(); onClose(); }}
          className="w-14 h-14 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:scale-105 transition-transform"
          title={t("voiceHangUp")}
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
});
