/**
 * TwinVoiceProvider — Mode vocal GRATUIT.
 *
 * Architecture (zéro abonnement payant) :
 *   1. STT (parole→texte)  : voiceService (edge function `voice-transcribe`, Gemini via Lovable AI)
 *   2. LLM (texte→réponse) : edge function `ai-orchestrator` — MÊMES mémoires/insights que le chat texte
 *   3. TTS (texte→parole)  : OpenAI tts-1 (voix « nova ») via edge function `voice-tts`
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
  // Micro + lecture audio HTML5 requis (dispo partout).
  const supported = typeof window !== "undefined" && !!navigator?.mediaDevices?.getUserMedia;

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
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const interruptedRef = useRef<boolean>(false);
  const bargeInStreamRef = useRef<MediaStream | null>(null);
  const bargeInCtxRef = useRef<AudioContext | null>(null);
  const bargeInRafRef = useRef<number | null>(null);

  /** Joue un petit "bip" pour signaler que l'IA recommence à écouter. */
  const playListenCue = useCallback(() => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      // Petit "ding" doux à deux notes
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
      setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 400);
    } catch { /* ignore */ }
  }, []);

  /** Coupe la lecture en cours (utilisé par barge-in). */
  const stopSpeaking = useCallback(() => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = "";
        currentAudioRef.current = null;
      }
    } catch { /* ignore */ }
  }, []);

  /** Stoppe le détecteur d'interruption. */
  const stopBargeInDetector = useCallback(() => {
    if (bargeInRafRef.current != null) {
      cancelAnimationFrame(bargeInRafRef.current);
      bargeInRafRef.current = null;
    }
    try { bargeInCtxRef.current?.close(); } catch { /* ignore */ }
    bargeInCtxRef.current = null;
    try { bargeInStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    bargeInStreamRef.current = null;
  }, []);

  /** Démarre un détecteur de voix pendant que l'IA parle, pour pouvoir l'interrompre. */
  const startBargeInDetector = useCallback(async (onInterrupt: () => void) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      bargeInStreamRef.current = stream;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      bargeInCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      // Seuil un peu plus haut pour éviter les faux-positifs liés au son qui sort du HP.
      const BARGE_THRESHOLD = 0.06;
      const REQUIRED_FRAMES = 4;
      let aboveCount = 0;
      const tick = () => {
        if (!bargeInCtxRef.current) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > BARGE_THRESHOLD) {
          aboveCount++;
          if (aboveCount >= REQUIRED_FRAMES) {
            onInterrupt();
            return;
          }
        } else {
          aboveCount = Math.max(0, aboveCount - 1);
        }
        bargeInRafRef.current = requestAnimationFrame(tick);
      };
      bargeInRafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("[barge-in] mic unavailable", e);
    }
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      if (!text.trim()) return resolve();
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const url = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/voice-tts`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text }),
        });
        if (!resp.ok) throw new Error(`TTS HTTP ${resp.status}`);
        const blob = await resp.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;
        const cleanup = () => {
          URL.revokeObjectURL(audioUrl);
          if (currentAudioRef.current === audio) currentAudioRef.current = null;
          stopBargeInDetector();
          resolve();
        };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        await audio.play().catch(cleanup);
        // Démarre l'écoute d'interruption (barge-in).
        startBargeInDetector(() => {
          interruptedRef.current = true;
          try { audio.pause(); } catch { /* ignore */ }
          cleanup();
        });
      } catch (e) {
        console.error("TTS speak error:", e);
        resolve();
      }
    });
  }, [startBargeInDetector, stopBargeInDetector]);

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

    const SILENCE_THRESHOLD = 0.018;       // RMS sous lequel on considère "silence" (un peu plus sensible)
    const SILENCE_DURATION_MS = 500;       // 0.5s de silence = fin de phrase (très réactif)
    const MAX_DURATION_MS = 12000;         // sécurité : 12s max par tour
    const MIN_SPEECH_MS = 180;             // attend juste un peu de voix
    const NO_SPEECH_TIMEOUT_MS = 2200;     // si rien de clair après 2.2s → on coupe quand même

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
        // Pas de voix claire détectée pendant NO_SPEECH_TIMEOUT_MS → on stoppe quand même
        // pour laisser l'IA répondre (même si l'audio capturé est faible/bruité).
        if (!hasSpoken && elapsed > NO_SPEECH_TIMEOUT_MS) return resolve();
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
        customInstructions: "Mode vocal : réponds en 1 à 3 phrases courtes, naturelles, parlées. Pas de markdown, pas de listes, pas d'émojis. NE TERMINE JAMAIS ta réponse par une question de relance du type \"voulez-vous que je modifie votre agenda ?\", \"souhaitez-vous que je…\", \"dites-le moi si…\". NE TERMINE JAMAIS non plus par des formules de disponibilité ou d'attente du type \"je suis prêt\", \"je suis là\", \"à votre écoute\", \"dites-moi ce que vous voulez\", \"dites-moi ce qu'on fait\", \"je vous écoute\", \"n'hésitez pas\". Pas de relance, pas d'invitation à parler, pas d'offre d'aide finale. Conclus directement sur l'information utile, point final.",
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
      playListenCue();
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
      interruptedRef.current = false;
      await speak(answer);
      if (cycleAbortRef.current.aborted) break;
      // Si l'utilisateur a coupé la parole → on enchaîne immédiatement sur l'écoute.
      if (interruptedRef.current) {
        interruptedRef.current = false;
        continue;
      }
    }
    setPhase("idle");
  }, [askAI, recordUntilSilence, speak, playListenCue]);

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
    // (Plus besoin de pré-charger les voix navigateur, on utilise OpenAI TTS.)
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
    stopBargeInDetector();
    try {
      currentAudioRef.current?.pause();
      currentAudioRef.current = null;
    } catch { /* ignore */ }
    try {
      // Si un enregistrement est en cours, on coupe le micro brutalement
      const stream = webVoiceService.getStream();
      stream?.getTracks().forEach((t) => t.stop());
    } catch { /* ignore */ }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
  }, [stopBargeInDetector]);

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