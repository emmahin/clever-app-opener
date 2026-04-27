/**
 * TwinVoiceProvider — Mode vocal GRATUIT.
 *
 * Architecture (zéro abonnement payant) :
 *   1. STT (parole→texte)  : voiceService (edge function `voice-transcribe`, Gemini via Lovable AI)
 *   2. LLM (texte→réponse) : edge function `ai-orchestrator` — MÊMES mémoires/insights que le chat texte
 *   3. TTS (texte→parole)  : window.speechSynthesis (navigateur, 0€)
 *
 * On garde EXACTEMENT la même API publique (`useTwinVoiceContext`) pour ne rien
 * casser dans VoiceCallMode et ailleurs.
 */
import { createContext, useContext, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { webVoiceService } from "@/services/voiceService";
import { twinMemoryService } from "@/services";
import { moodService } from "@/services/moodService";

export type TwinRole = "user" | "assistant";
export interface TwinTurn { id: string; role: TwinRole; text: string; ts: number }

interface TwinVoiceContextValue {
  isCallActive: boolean;
  status: "idle" | "listening" | "thinking" | "speaking";
  transcript: TwinTurn[];
  interim: string;
  supported: boolean;
  startCall: () => Promise<void>;
  endCall: () => void;
  clearTranscript: () => void;
  /** Permet aux pages d'enrichir le contexte (mémoires & agenda) */
  setContextProviders: (providers: {
    getMemoriesContext?: () => string;
    getEventsContext?: () => string;
    onMemoryChange?: () => void;
    onError?: (msg: string) => void;
  }) => void;
}

const TwinVoiceContext = createContext<TwinVoiceContextValue | null>(null);

export function TwinVoiceProvider({ children }: { children: ReactNode }) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [transcript, setTranscript] = useState<TwinTurn[]>([]);
  const [interim] = useState("");
  const [phase, setPhase] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  // SpeechSynthesis dispo partout (Chrome, Safari, Firefox, Edge). Micro requis aussi.
  const supported = typeof window !== "undefined" && "speechSynthesis" in window && !!navigator?.mediaDevices?.getUserMedia;

  // Providers fournis par la page Twin (mémoires + agenda)
  const providersRef = useRef<{
    getMemoriesContext?: () => string;
    getEventsContext?: () => string;
    onMemoryChange?: () => void;
    onError?: (msg: string) => void;
  }>({});

  const setContextProviders: TwinVoiceContextValue["setContextProviders"] = useCallback((p) => {
    providersRef.current = { ...providersRef.current, ...p };
  }, []);

  // ─── Gestion VAD/cycle d'écoute ───────────────────────────────────────
  // Détection silence basique via Web Audio API : on coupe l'enregistrement quand
  // l'utilisateur s'arrête de parler ~1.4s — pas besoin d'appuyer sur un bouton.
  const cycleAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const conversationHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window) || !text.trim()) return resolve();
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 1.05;
      u.pitch = 1.0;
      // Choisir une voix française si dispo
      const voices = window.speechSynthesis.getVoices();
      const fr = voices.find((v) => v.lang?.startsWith("fr"));
      if (fr) u.voice = fr;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }, []);

  /** Détecte la fin de la parole via volume RMS, puis stoppe l'enregistrement. */
  const recordUntilSilence = useCallback(async (): Promise<string> => {
    await webVoiceService.startRecording();
    const stream = webVoiceService.getStream();
    if (!stream) {
      return webVoiceService.stopAndTranscribe();
    }
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    const SILENCE_THRESHOLD = 0.015;       // RMS sous lequel on considère "silence"
    const SILENCE_DURATION_MS = 1400;      // 1.4s de silence = fin de phrase
    const MAX_DURATION_MS = 15000;         // sécurité : 15s max par tour
    const MIN_SPEECH_MS = 400;             // attend au moins un peu de voix

    const start = Date.now();
    let lastVoiceAt = Date.now();
    let hasSpoken = false;

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (cycleAbortRef.current.aborted) return resolve();
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        if (rms > SILENCE_THRESHOLD) {
          lastVoiceAt = now;
          hasSpoken = true;
        }
        const elapsed = now - start;
        const silentFor = now - lastVoiceAt;
        if (elapsed > MAX_DURATION_MS) return resolve();
        if (hasSpoken && elapsed > MIN_SPEECH_MS && silentFor > SILENCE_DURATION_MS) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });

    try { ctx.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
    return webVoiceService.stopAndTranscribe();
  }, []);

  /** Appelle ai-orchestrator en streaming, accumule, retourne la réponse complète. */
  const askAI = useCallback(async (userText: string): Promise<string> => {
    // Récupère mémoires + insights compactés (mêmes règles d'économie de tokens que le chat texte)
    const [memoriesRaw, insightsRaw, moodCtx] = await Promise.all([
      twinMemoryService.listMemories().catch(() => []),
      moodService.listInsights(3).catch(() => []),
      moodService.recentContext(7).catch(() => null),
    ]);
    const memories = memoriesRaw.slice(0, 8).map((m) => ({
      category: m.category, content: m.content.slice(0, 90), importance: m.importance,
    }));
    const insights = insightsRaw.slice(0, 3).map((i) => ({
      category: i.category, insight: i.insight.slice(0, 110),
    }));

    conversationHistoryRef.current.push({ role: "user", content: userText });

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const url = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/ai-orchestrator`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        // On n'envoie que les 6 derniers tours pour limiter les tokens en vocal.
        messages: conversationHistoryRef.current.slice(-6),
        lang: "fr",
        // En vocal : réponses COURTES par défaut (économie tokens + meilleure UX vocale).
        detailLevel: "short",
        customInstructions: "Mode vocal : réponds en 1 à 3 phrases courtes, naturelles, parlées. Pas de markdown, pas de listes, pas d'émojis.",
        timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })(),
        moodContext: moodCtx,
        memories,
        insights,
      }),
    });

    if (!resp.ok || !resp.body) throw new Error(`AI HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        try {
          const j = JSON.parse(line.slice(6).trim());
          if (j.delta) full += j.delta;
        } catch { /* ignore parse errors mid-stream */ }
      }
    }
    conversationHistoryRef.current.push({ role: "assistant", content: full });
    return full.trim();
  }, []);

  /** Boucle principale d'un appel : écoute → STT → LLM → TTS → recommence. */
  const runConversationLoop = useCallback(async () => {
    while (!cycleAbortRef.current.aborted) {
      // 1. Écoute
      setPhase("listening");
      let userText = "";
      try {
        userText = (await recordUntilSilence()).trim();
      } catch (e: any) {
        providersRef.current.onError?.(e?.message || "Échec de l'écoute");
        break;
      }
      if (cycleAbortRef.current.aborted) break;
      if (!userText) continue; // rien capté → on relance le cycle

      setTranscript((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: userText, ts: Date.now() }]);

      // 2. Réflexion
      setPhase("thinking");
      let answer = "";
      try {
        answer = await askAI(userText);
      } catch (e: any) {
        providersRef.current.onError?.(e?.message || "L'IA n'a pas répondu");
        setPhase("idle");
        break;
      }
      if (cycleAbortRef.current.aborted) break;
      if (!answer) continue;

      setTranscript((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: answer, ts: Date.now() }]);

      // 3. Parole
      setPhase("speaking");
      await speak(answer);
      if (cycleAbortRef.current.aborted) break;
    }
    setPhase("idle");
  }, [askAI, recordUntilSilence, speak]);

  const status = phase;

  const startCall = useCallback(async () => {
    if (!supported) {
      providersRef.current.onError?.("Mode vocal non supporté par ce navigateur.");
      return;
    }
    try {
      // Demande micro + warm-up des voix (Safari/Chrome chargent les voix de façon async)
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      providersRef.current.onError?.("Microphone refusé.");
      return;
    }
    try { window.speechSynthesis.getVoices(); } catch { /* ignore */ }
    cycleAbortRef.current = { aborted: false };
    conversationHistoryRef.current = [];
    setIsCallActive(true);
    // Lance la boucle (non-bloquant)
    runConversationLoop().finally(() => setIsCallActive(false));
  }, [supported, runConversationLoop]);

  const endCall = useCallback(() => {
    cycleAbortRef.current.aborted = true;
    setIsCallActive(false);
    setPhase("idle");
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    try {
      // Si un enregistrement est en cours, on coupe le micro brutalement
      const stream = webVoiceService.getStream();
      stream?.getTracks().forEach((t) => t.stop());
    } catch { /* ignore */ }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  // Cleanup global au démontage
  useEffect(() => {
    return () => { endCall(); };
  }, [endCall]);

  const value: TwinVoiceContextValue = {
    isCallActive, status, transcript, interim, supported,
    startCall, endCall, clearTranscript, setContextProviders,
  };

  return <TwinVoiceContext.Provider value={value}>{children}</TwinVoiceContext.Provider>;
}

export function useTwinVoiceContext() {
  const ctx = useContext(TwinVoiceContext);
  if (!ctx) throw new Error("useTwinVoiceContext must be used inside <TwinVoiceProvider>");
  return ctx;
}