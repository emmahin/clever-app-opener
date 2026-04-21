import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, X, Loader2, Volume2, PhoneOff } from "lucide-react";
import { voiceService, chatService } from "@/services";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useSettings } from "@/contexts/SettingsProvider";
import { toast } from "sonner";
import galaxyOrb from "@/assets/voice-orb-galaxy.png";

type Phase = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  open: boolean;
  onClose: () => void;
}

const LANG_TO_BCP47: Record<string, string> = {
  fr: "fr-FR", en: "en-US", es: "es-ES", de: "de-DE",
};

export function VoiceCallMode({ open, onClose }: Props) {
  const { t, lang } = useLanguage();
  const { settings } = useSettings();
  const [phase, setPhase] = useState<Phase>("idle");
  const [partial, setPartial] = useState("");
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const historyRef = useRef(history);
  const closedRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { historyRef.current = history; }, [history]);

  const stopAll = useCallback(() => {
    closedRef.current = true;
    try { window.speechSynthesis.cancel(); } catch {}
    if (voiceService.isRecording()) {
      voiceService.stopAndTranscribe().catch(() => {});
    }
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      try { window.speechSynthesis.cancel(); } catch {}
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANG_TO_BCP47[lang] || "fr-FR";
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang?.toLowerCase().startsWith((LANG_TO_BCP47[lang] || "fr").slice(0, 2).toLowerCase()));
      if (match) u.voice = match;
      u.rate = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      utteranceRef.current = u;
      window.speechSynthesis.speak(u);
    });
  }, [lang]);

  const askAI = useCallback(async (userText: string) => {
    return new Promise<string>((resolve, reject) => {
      let acc = "";
      chatService.streamChat({
        messages: [...historyRef.current, { role: "user", content: userText }],
        lang,
        detailLevel: "short",
        customInstructions: settings.customInstructions,
        aiName: settings.aiName,
        onDelta: (c) => { acc += c; },
        onWidgets: () => {},
        onDone: () => resolve(acc.trim()),
        onError: (e) => reject(e),
      });
    });
  }, [lang, settings.customInstructions, settings.aiName]);

  const runTurn = useCallback(async () => {
    if (closedRef.current) return;
    try {
      // 1. Listen
      setPhase("listening");
      setPartial("");
      await voiceService.startRecording();
      // wait until user clicks "stop turn" — handled below via stopTurn
    } catch (e: any) {
      toast.error(e?.message || "Mic error");
      setPhase("idle");
    }
  }, []);

  const stopTurn = useCallback(async () => {
    if (phaseRef.current !== "listening") return;
    setPhase("thinking");
    try {
      const text = (await voiceService.stopAndTranscribe()).trim();
      if (closedRef.current) return;
      if (!text) {
        setPhase("idle");
        runTurn();
        return;
      }
      setPartial(text);
      setHistory((h) => [...h, { role: "user", content: text }]);
      const reply = await askAI(text);
      if (closedRef.current) return;
      setHistory((h) => [...h, { role: "assistant", content: reply }]);
      setPhase("speaking");
      await speak(reply);
      if (closedRef.current) return;
      setPhase("idle");
      runTurn();
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
      setPhase("idle");
    }
  }, [askAI, speak, runTurn]);

  // Auto-start listening when modal opens
  useEffect(() => {
    if (open) {
      closedRef.current = false;
      setHistory([]);
      setPartial("");
      runTurn();
    } else {
      stopAll();
      setPhase("idle");
    }
    return () => { stopAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pre-warm voices
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }, []);

  if (!open) return null;

  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-2xl flex flex-col items-center justify-between py-12 px-6">
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Title */}
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("voiceCallTitle")}</p>
        <h2 className="text-2xl font-semibold mt-1">{settings.aiName || "Jarvis"}</h2>
      </div>

      {/* Orb */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 w-full max-w-xl">
        <div className="relative w-64 h-64">
          {/* Outer halo */}
          <div
            className={`absolute -inset-6 rounded-full transition-all duration-700
              ${phase === "listening" ? "bg-fuchsia-500/40 animate-pulse" : ""}
              ${phase === "thinking" ? "bg-amber-400/30 animate-pulse" : ""}
              ${phase === "speaking" ? "bg-violet-400/50 animate-pulse" : ""}
              ${phase === "idle" ? "bg-violet-600/20" : ""}`}
            style={{ filter: "blur(40px)" }}
          />
          {/* Galaxy circle */}
          <div
            className={`relative w-full h-full rounded-full overflow-hidden ring-1 ring-white/10 shadow-[0_0_80px_rgba(168,85,247,0.45)] transition-transform duration-500
              ${phase === "listening" ? "scale-110 animate-pulse" : ""}
              ${phase === "speaking" ? "scale-105" : ""}
              ${phase === "idle" ? "scale-100" : ""}`}
          >
            <img
              src={galaxyOrb}
              alt=""
              className={`w-full h-full object-cover transition-all duration-700
                ${phase === "thinking" ? "animate-spin-slow" : ""}
                ${phase === "speaking" ? "scale-110" : "scale-100"}`}
              style={phase === "thinking" ? { animation: "spin 8s linear infinite" } : undefined}
            />
            {/* Subtle inner shine overlay */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 via-transparent to-black/30 pointer-events-none" />
          </div>
          {/* Phase icon (mic hidden — galaxy speaks for itself) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {phase === "thinking" && <Loader2 className="w-12 h-12 text-white animate-spin drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]" />}
          </div>
        </div>

        <div className="text-center min-h-[80px] max-w-md">
          {phase === "listening" && <p className="text-lg text-primary">{t("voiceListening")}</p>}
          {phase === "thinking" && <p className="text-lg text-amber-400">{t("voiceThinking")}</p>}
          {phase === "speaking" && (
            <p className="text-lg text-emerald-400 line-clamp-3">{lastAssistant}</p>
          )}
          {phase === "idle" && <p className="text-lg text-muted-foreground">{t("voiceIdle")}</p>}
          {partial && phase !== "speaking" && (
            <p className="text-sm text-muted-foreground mt-3 italic">"{partial}"</p>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {phase === "listening" ? (
          <button
            onClick={stopTurn}
            className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:scale-105 transition-transform"
          >
            {t("voiceSendTurn")}
          </button>
        ) : phase === "speaking" ? (
          <button
            onClick={() => { try { window.speechSynthesis.cancel(); } catch {} }}
            className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/15 font-medium"
          >
            {t("voiceInterrupt")}
          </button>
        ) : null}

        <button
          onClick={onClose}
          className="w-14 h-14 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:scale-105 transition-transform"
          title={t("voiceHangUp")}
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
