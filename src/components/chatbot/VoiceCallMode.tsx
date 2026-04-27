import { useEffect, useRef, useState } from "react";
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
  onVoiceIntent?: (intent: VoiceIntent) => boolean | void;
}

export type VoiceIntent =
  | { kind: "agenda"; rangeLabel?: string }
  | { kind: "news" }
  | { kind: "stocks" }
  | { kind: "settings" }
  | { kind: "notifications" };

/**
 * Détecte si la requête vocale demande l'affichage de quelque chose
 * (agenda, actus, marchés…). Retourne l'intention ou `null`.
 * On reste volontairement permissif : "montre-moi mon agenda", "c'est quoi mon
 * agenda", "qu'est-ce que j'ai aujourd'hui", "les news", "le cours du Bitcoin"…
 */
function detectVoiceIntent(text: string): VoiceIntent | null {
  const t = text.toLowerCase();
  // Agenda / planning
  if (/\b(agenda|calendrier|planning|emploi du temps|rendez[-\s]?vous|rdv|prochain|évén?ements?|aujourd['’]hui|demain|cette semaine|prochaine semaine|ce week[-\s]?end|ce mois|libre|disponible|réuni(?:on|ons))\b/.test(t)) {
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
    return { kind: "notifications" };
  }
  // Paramètres
  if (/\b(param[èe]tres?|r[ée]glages?|settings?|pr[ée]f[ée]rences?)\b/.test(t)) {
    return { kind: "settings" };
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

export function VoiceCallMode({ open, onClose, onTurn, onVoiceIntent }: Props) {
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
  const memoriesContextRef = useRef<string>("");
  const eventsContextRef = useRef<string>("");
  const lastSentSigRef = useRef<string | null>(null);
  const handledIntentIdsRef = useRef<Set<string>>(new Set());

  // Notifie le parent à chaque nouveau turn (user ou assistant) — pour persistance dans le chat
  useEffect(() => {
    if (!onTurn || transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    // En streaming, le message assistant est inséré vide puis enrichi.
    // On ignore tant qu'il n'a pas de texte, et on renvoie la version mise à
    // jour à chaque changement de contenu (le parent dédoublonne par id).
    if (!last.text || !last.text.trim()) return;
    const sig = `${last.id}:${last.text.length}`;
    if (sig === lastSentSigRef.current) return;
    lastSentSigRef.current = sig;
    onTurn({ id: last.id, role: last.role, text: last.text, ts: last.ts });
    // Détection d'intention SUR LES MESSAGES UTILISATEUR uniquement.
    // Si une intention "affichable" est détectée, on minimise l'overlay
    // pour que l'utilisateur voie immédiatement le widget injecté dans le chat.
    if (
      last.role === "user" &&
      onVoiceIntent &&
      !handledIntentIdsRef.current.has(last.id)
    ) {
      handledIntentIdsRef.current.add(last.id);
      const intent = detectVoiceIntent(last.text);
      if (intent) {
        const handled = onVoiceIntent(intent);
        if (handled !== false) {
          setMinimized(true);
        }
      }
    }
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
    const ringColor =
      phase === "speaking" ? "hsl(150 80% 60%)"
        : phase === "thinking" ? "hsl(45 95% 60%)"
        : "hsl(var(--primary))";
    return (
      <button
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
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-2xl flex flex-col items-center justify-between py-12 px-6">
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
                  ? "conic-gradient(from 0deg, hsl(320 95% 60% / 0.55), hsl(280 90% 60% / 0.45), hsl(260 95% 65% / 0.55), hsl(320 95% 60% / 0.55))"
                  : phase === "thinking"
                  ? "conic-gradient(from 0deg, hsl(45 95% 60% / 0.45), hsl(285 90% 60% / 0.45), hsl(200 90% 60% / 0.45), hsl(45 95% 60% / 0.45))"
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
            const t1 = Date.now() / 220 + i * 0.8;
            const wiggle = 0.55 + 0.45 * Math.abs(Math.sin(t1) * Math.cos(t1 * 0.6 + i));
            const boosted = Math.min(1, audioLevel * 1.6 + 0.04);
            const amp = envelope * wiggle * boosted;
            const h = 4 + amp * 84;
            const color =
              phase === "speaking"
                ? "hsl(150 80% 60%)"
                : phase === "thinking"
                ? "hsl(45 95% 60%)"
                : "hsl(var(--foreground))";
            return (
              <span
                key={i}
                className="block w-[3px] rounded-full transition-[height] duration-75 ease-out"
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
}
