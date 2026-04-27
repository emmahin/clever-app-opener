import { useEffect, useRef, useState } from "react";
import { X, PhoneOff } from "lucide-react";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";
import { twinMemoryService, type MemoryCategory } from "@/services";
import { useSettings } from "@/contexts/SettingsProvider";
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
}

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  habit: "Habitude",
  preference: "Préférence",
  goal: "Objectif",
  fact: "Fait",
  emotion: "Émotion",
  relationship: "Relation",
};

export function VoiceCallMode({ open, onClose, onTurn }: Props) {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const {
    isCallActive,
    status,
    transcript,
    startCall,
    endCall,
    clearTranscript,
    setContextProviders,
  } = useTwinVoiceContext();

  const [starting, setStarting] = useState(false);
  const memoriesContextRef = useRef<string>("");
  const eventsContextRef = useRef<string>("");
  const lastTurnIdRef = useRef<string | null>(null);

  // Notifie le parent à chaque nouveau turn (user ou assistant) — pour persistance dans le chat
  useEffect(() => {
    if (!onTurn || transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (last.id === lastTurnIdRef.current) return;
    lastTurnIdRef.current = last.id;
    onTurn({ id: last.id, role: last.role, text: last.text, ts: last.ts });
  }, [transcript, onTurn]);

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

  if (!open) return null;

  const lastAssistant = [...transcript].reverse().find((m) => m.role === "assistant")?.text;
  const lastUser = [...transcript].reverse().find((m) => m.role === "user")?.text;

  const phase: "idle" | "listening" | "thinking" | "speaking" =
    starting ? "thinking" : status;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-2xl flex flex-col items-center justify-between py-12 px-6">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Double numérique</p>
        <h2 className="text-2xl font-semibold mt-1">{settings.aiName || "Jarvis"}</h2>
        <p className="text-xs text-muted-foreground mt-1">Voix locale · gratuite</p>
      </div>

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

        <div className="text-center min-h-[80px] max-w-md">
          {phase === "thinking" && !isCallActive && (
            <p className="text-lg text-amber-400">Connexion…</p>
          )}
          {phase === "listening" && (
            <div className="flex items-center justify-center gap-1.5 h-12" aria-label={t("voiceListening")}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span
                  key={i}
                  className="block w-1.5 rounded-full bg-primary"
                  style={{
                    animation: `voice-wave 1s ease-in-out ${i * 0.12}s infinite`,
                    height: "8px",
                  }}
                />
              ))}
            </div>
          )}
          {phase === "speaking" && (
            <p className="text-lg text-emerald-400 line-clamp-3">{lastAssistant || "…"}</p>
          )}
          {phase === "idle" && (
            <p className="text-lg text-muted-foreground">{t("voiceIdle")}</p>
          )}
          {lastUser && phase === "listening" && (
            <p className="text-sm text-muted-foreground mt-3 italic">"{lastUser}"</p>
          )}
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
