import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, X, Loader2, Volume2, PhoneOff } from "lucide-react";
import { voiceService } from "@/services";
import { supabase } from "@/integrations/supabase/client";
import { twinMemoryService, type MemoryCategory } from "@/services";
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

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  habit: "Habitude",
  preference: "Préférence",
  goal: "Objectif",
  fact: "Fait",
  emotion: "Émotion",
  relationship: "Relation",
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const speechDetectedRef = useRef<boolean>(false);
  // Contexte du double numérique : mémoires + agenda chargés à l'ouverture
  const memoriesContextRef = useRef<string>("");
  const eventsContextRef = useRef<string>("");
  // Historique LLM enrichi avec tool_calls (séparé de l'historique d'affichage)
  const llmMessagesRef = useRef<{ role: "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[] }[]>([]);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { historyRef.current = history; }, [history]);

  // Charge mémoire + agenda à l'ouverture pour fournir le contexte au double
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

  const stopAll = useCallback(() => {
    closedRef.current = true;
    try { window.speechSynthesis.cancel(); } catch {}
    if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
    vadRafRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
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
      const langPrefix = (LANG_TO_BCP47[lang] || "fr").slice(0, 2).toLowerCase();
      const langVoices = voices.filter((v) =>
        v.lang?.toLowerCase().startsWith(langPrefix)
      );
      // Mots-cl\u00e9s indiquant une voix masculine selon les OS / moteurs TTS
      const maleHints = [
        "male", "homme", "thomas", "daniel", "paul", "henri", "nicolas",
        "jean", "google fran\u00e7ais", "fred", "alex", "george", "james",
        "diego", "jorge", "stefan", "markus", "yannick"
      ];
      const femaleHints = ["female", "femme", "amelie", "marie", "audrey", "virginie", "samantha", "victoria", "karen"];
      const maleVoice =
        langVoices.find((v) => maleHints.some((h) => v.name.toLowerCase().includes(h))) ||
        langVoices.find((v) => !femaleHints.some((h) => v.name.toLowerCase().includes(h))) ||
        langVoices[0];
      if (maleVoice) u.voice = maleVoice;
      u.rate = 1.25; // d\u00e9bit plus rapide
      u.pitch = 0.9; // l\u00e9g\u00e8rement plus grave
      u.onend = () => resolve();
      u.onerror = () => resolve();
      utteranceRef.current = u;
      window.speechSynthesis.speak(u);
    });
  }, [lang]);

  // Exécute les tool calls renvoyés par le double (mémoire + agenda)
  const executeTool = useCallback(async (name: string, args: any): Promise<string> => {
    try {
      if (name === "remember_fact") {
        const valid: MemoryCategory[] = ["habit", "preference", "goal", "fact", "emotion", "relationship"];
        const cat = (valid.includes(args.category) ? args.category : "fact") as MemoryCategory;
        await twinMemoryService.addMemory({
          category: cat,
          content: String(args.content || "").trim(),
          importance: Math.min(5, Math.max(1, Number(args.importance) || 3)),
          source: "voice",
        });
        return `OK, mémorisé (${cat}).`;
      }
      if (name === "add_schedule_event") {
        const start = new Date(args.start_iso);
        if (isNaN(start.getTime())) return "Date invalide.";
        await twinMemoryService.addEvent({
          title: String(args.title || "").trim() || "Événement",
          start_iso: start.toISOString(),
          end_iso: args.end_iso ? new Date(args.end_iso).toISOString() : undefined,
          location: args.location,
          notes: args.notes,
          source: "ai",
        });
        return `Événement ajouté pour le ${start.toLocaleString("fr-FR")}.`;
      }
      return `Tool inconnu: ${name}`;
    } catch (e: any) {
      return `Erreur tool ${name}: ${e?.message || "inconnue"}`;
    }
  }, []);

  // Appel récursif du double via twin-chat (gère le tool calling)
  const callTwinChat = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("twin-chat", {
      body: {
        messages: llmMessagesRef.current,
        memoriesContext: memoriesContextRef.current,
        eventsContext: eventsContextRef.current,
      },
    });
    if (error) throw new Error(error.message || "Échec IA");
    if (data?.error) throw new Error(data.error);
    const message = data?.message;
    if (!message) throw new Error("Réponse vide");

    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      llmMessagesRef.current.push({
        role: "assistant",
        content: message.content || "",
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        const name = call.function?.name;
        let args: any = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch { /* ignore */ }
        const result = await executeTool(name, args);
        llmMessagesRef.current.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      return await callTwinChat();
    }

    const text: string = message.content || "";
    llmMessagesRef.current.push({ role: "assistant", content: text });
    return text;
  }, [executeTool]);

  const askAI = useCallback(async (userText: string) => {
    llmMessagesRef.current.push({ role: "user", content: userText });
    return await callTwinChat();
  }, [callTwinChat]);

  const stopVAD = useCallback(() => {
    if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
    vadRafRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
  }, []);

  // Forward declare stopTurn for VAD callback
  const stopTurnRef = useRef<() => void>(() => {});

  const startVAD = useCallback(() => {
    const stream = voiceService.getStream?.();
    if (!stream) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const SILENCE_THRESHOLD = 0.018;
      const SILENCE_DURATION_MS = 900;
      const MIN_SPEECH_MS = 350;
      let speechStart: number | null = null;
      speechDetectedRef.current = false;
      silenceStartRef.current = null;

      const tick = () => {
        if (closedRef.current || phaseRef.current !== "listening") return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > SILENCE_THRESHOLD) {
          if (speechStart == null) speechStart = now;
          if (!speechDetectedRef.current && now - speechStart > MIN_SPEECH_MS) {
            speechDetectedRef.current = true;
          }
          silenceStartRef.current = null;
        } else {
          if (speechDetectedRef.current) {
            if (silenceStartRef.current == null) silenceStartRef.current = now;
            else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
              stopVAD();
              stopTurnRef.current();
              return;
            }
          }
        }
        vadRafRef.current = requestAnimationFrame(tick);
      };
      vadRafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("VAD init failed", e);
    }
  }, [stopVAD]);

  const runTurn = useCallback(async () => {
    if (closedRef.current) return;
    try {
      setPhase("listening");
      setPartial("");
      await voiceService.startRecording();
      // Petit délai pour laisser le stream s'établir
      setTimeout(() => startVAD(), 150);
    } catch (e: any) {
      toast.error(e?.message || "Mic error");
      setPhase("idle");
    }
  }, [startVAD]);

  const stopTurn = useCallback(async () => {
    if (phaseRef.current !== "listening") return;
    stopVAD();
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
  }, [askAI, speak, runTurn, stopVAD]);

  // Keep ref synced so VAD tick can call latest stopTurn
  useEffect(() => { stopTurnRef.current = stopTurn; }, [stopTurn]);

  // Auto-start listening when modal opens
  useEffect(() => {
    if (open) {
      closedRef.current = false;
      setHistory([]);
      setPartial("");
      llmMessagesRef.current = [];
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
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Double numérique</p>
        <h2 className="text-2xl font-semibold mt-1">{settings.aiName || "Jarvis"}</h2>
        <p className="text-xs text-muted-foreground mt-1">Avec accès à votre mémoire & agenda</p>
      </div>

      {/* Orb */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 w-full max-w-xl">
        <div className="relative w-80 h-80">
          {/* Fixed gradient halo */}
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
          {/* Galaxy with soft feathered edges (no hard circle) */}
          <img
            src={galaxyOrb}
            alt=""
            className="relative w-full h-full object-cover transition-all duration-700"
            style={{
              WebkitMaskImage:
                "radial-gradient(circle at center, black 40%, transparent 75%)",
              maskImage:
                "radial-gradient(circle at center, black 40%, transparent 75%)",
              animation:
                phase === "listening"
                  ? "galaxy-listening 7s ease-in-out infinite"
                  : phase === "speaking"
                  ? "galaxy-speaking 5s ease-in-out infinite"
                  : phase === "idle"
                  ? "galaxy-idle 40s ease-in-out infinite"
                  :
                phase === "thinking"
                  ? "galaxy-thinking 8s ease-in-out infinite"
                  : "galaxy-idle 40s ease-in-out infinite",
              filter: "drop-shadow(0 0 60px rgba(168,85,247,0.45))",
            }}
          />
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
            title="Envoyer maintenant (sinon envoi automatique après silence)"
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
