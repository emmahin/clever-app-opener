/**
 * TwinVoiceProvider — Mode vocal GRATUIT.
 *
 * Architecture (zéro abonnement payant) :
 *   1. STT (parole→texte)  : voiceService (edge function `voice-transcribe`, Gemini via Lovable AI)
 *   2. LLM (texte→réponse) : edge function `ai-orchestrator` — MÊMES mémoires/insights que le chat texte
 *   3. TTS (texte→parole)  : OpenAI TTS (voix « shimmer ») via edge function `voice-tts`,
 *      avec repli automatique sur la voix native du navigateur en cas d'erreur.
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

/**
 * Détecte les transcriptions parasites typiques quand l'audio est vide ou
 * inintelligible. Whisper et Gemini ont tendance à inventer ces phrases
 * (souvent dans une autre langue) sur du silence/bruit, ce qui faisait
 * répondre l'IA à côté ou en anglais/japonais.
 */
function isLikelySttHallucination(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 2) return true;
  // Mots/sons isolés sans contenu réel
  if (/^[\.\!\?…,;:\-\s]+$/.test(t)) return true;
  if (/^(merci|thanks|thank you|ok|okay|hum+|euh+|mmh+|ah+)[\.\!\?…\s]*$/i.test(t)) return true;
  // Hallucinations Whisper célèbres
  const knownHallucinations = [
    "sous-titres réalisés",
    "sous-titrage",
    "sous-titres",
    "merci d'avoir regardé",
    "merci à tous",
    "thanks for watching",
    "subtitles by",
    "amara.org",
    "御視聴",
    "ご視聴",
    "字幕",
    "感謝",
    "다음 영상",
    "구독",
  ];
  if (knownHallucinations.some((h) => t.includes(h.toLowerCase()))) return true;
  return false;
}

interface TwinVoiceContextValue {
  isCallActive: boolean;
  status: "idle" | "listening" | "thinking" | "speaking";
  transcript: TwinTurn[];
  interim: string;
  supported: boolean;
  /** Niveau audio normalisé (0..1) — micro en écoute, sortie TTS en parole. */
  audioLevel: number;
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
  const [audioLevel, setAudioLevel] = useState(0);
  const audioLevelRafRef = useRef<number | null>(null);
  const audioLevelCleanupRef = useRef<(() => void) | null>(null);
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
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const interruptedRef = useRef<boolean>(false);
  const bargeInStreamRef = useRef<MediaStream | null>(null);
  const bargeInCtxRef = useRef<AudioContext | null>(null);
  const bargeInRafRef = useRef<number | null>(null);
  // Stream micro persistant utilisé pour alimenter l'indicateur de niveau audio
  // EN CONTINU (écoute, réflexion ET pendant que Lia parle). L'utilisateur voit
  // ainsi à tout moment si son micro le capte bien.
  const monitorStreamRef = useRef<MediaStream | null>(null);
  const monitorCtxRef = useRef<AudioContext | null>(null);
  const monitorRafRef = useRef<number | null>(null);

  /** Stoppe le moniteur micro permanent. */
  const stopMicMonitor = useCallback(() => {
    if (monitorRafRef.current != null) {
      cancelAnimationFrame(monitorRafRef.current);
      monitorRafRef.current = null;
    }
    try { monitorCtxRef.current?.close(); } catch { /* ignore */ }
    monitorCtxRef.current = null;
    try { monitorStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    monitorStreamRef.current = null;
    setAudioLevel(0);
  }, []);

  /** Démarre un moniteur micro permanent qui alimente `audioLevel` en continu. */
  const startMicMonitor = useCallback(async () => {
    if (monitorStreamRef.current) return; // déjà actif
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        } as MediaTrackConstraints,
      });
      monitorStreamRef.current = stream;
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new Ctx();
      monitorCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      // FFT plus grosse = meilleure résolution de la mesure RMS sur la trame.
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0; // on lisse nous-mêmes, plus précisément
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      // Deux niveaux de lissage :
      //  - attack très rapide (montée quasi instantanée → réactif aux pics de voix)
      //  - release plus doux (descente progressive → barre lisible)
      let displayed = 0;
      // Plancher de bruit dynamique : on apprend en continu le niveau de
      // silence ambiant, et on l'utilise comme zéro de l'indicateur. Sans ça
      // un faible bruit de fond fait croire que le micro "entend" quelque chose.
      let noiseFloor = 0.005;
      const tick = () => {
        if (!monitorCtxRef.current) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
          const av = Math.abs(v);
          if (av > peak) peak = av;
        }
        const rms = Math.sqrt(sum / buf.length);
        // Apprentissage du plancher de bruit : si le RMS courant est sous
        // le plancher actuel, on s'y adapte rapidement (silence). Sinon, on
        // remonte très lentement pour ne pas absorber la voix elle-même.
        if (rms < noiseFloor) noiseFloor = noiseFloor * 0.9 + rms * 0.1;
        else noiseFloor = noiseFloor * 0.999 + rms * 0.001;
        // On combine RMS (énergie moyenne) et peak (transitoires des consonnes)
        // pour mieux refléter ce que Whisper entend réellement.
        const energy = Math.max(0, rms - noiseFloor * 1.5);
        // Échelle perceptuelle (racine carrée) : la barre bouge dès qu'on
        // chuchote, sans saturer dès qu'on parle normalement.
        const norm = Math.min(1, Math.sqrt(energy * 12) + peak * 0.25);
        // Attack rapide / release lente : la barre suit instantanément les
        // mots et redescend doucement entre les syllabes.
        if (norm > displayed) displayed = displayed * 0.3 + norm * 0.7;
        else displayed = displayed * 0.85 + norm * 0.15;
        setAudioLevel(displayed);
        monitorRafRef.current = requestAnimationFrame(tick);
      };
      monitorRafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("[mic-monitor] unavailable", e);
    }
  }, []);

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

  /** Stoppe toute mesure de niveau en cours. */
  const stopAudioLevel = useCallback(() => {
    if (audioLevelRafRef.current != null) {
      cancelAnimationFrame(audioLevelRafRef.current);
      audioLevelRafRef.current = null;
    }
    if (audioLevelCleanupRef.current) {
      try { audioLevelCleanupRef.current(); } catch { /* ignore */ }
      audioLevelCleanupRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  /** Mesure le RMS d'un AnalyserNode et alimente `audioLevel` (0..1). */
  const runAnalyserLoop = useCallback((analyser: AnalyserNode) => {
    const buf = new Uint8Array(analyser.fftSize);
    let smoothed = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Normalise (RMS typique 0..0.3) puis lisse pour un rendu fluide.
      const norm = Math.min(1, rms * 3.2);
      smoothed = smoothed * 0.7 + norm * 0.3;
      setAudioLevel(smoothed);
      audioLevelRafRef.current = requestAnimationFrame(tick);
    };
    audioLevelRafRef.current = requestAnimationFrame(tick);
  }, []);

  /** Coupe la lecture en cours (utilisé par barge-in). */
  const stopSpeaking = useCallback(() => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = "";
        currentAudioRef.current = null;
      }
      if (currentUtteranceRef.current && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        currentUtteranceRef.current = null;
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
      // Anti-faux-positifs : seuil élevé + nombreuses frames consécutives requises +
      // période de grâce au démarrage (le temps que le HP se stabilise et que
      // l'echo-cancellation s'adapte). Sans ça, la voix de l'IA s'auto-coupe et
      // l'utilisateur perçoit un "bug".
      const BARGE_THRESHOLD = 0.12;
      const REQUIRED_FRAMES = 10;
      const GRACE_MS = 600;
      const startedAt = performance.now();
      let aboveCount = 0;
      const tick = () => {
        if (!bargeInCtxRef.current) return;
        // Période de grâce : on ignore le micro tant que la lecture vient de démarrer.
        if (performance.now() - startedAt < GRACE_MS) {
          bargeInRafRef.current = requestAnimationFrame(tick);
          return;
        }
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
          // Décroissance plus rapide pour exiger un signal vraiment continu.
          aboveCount = Math.max(0, aboveCount - 2);
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
      const speakWithBrowserVoice = () => {
        if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        utterance.voice =
          voices.find((v) => v.lang.toLowerCase().startsWith("fr") && /female|femme|hortense|amelie|audrey|julie|marie/i.test(v.name)) ||
          voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ||
          null;
        utterance.lang = "fr-FR";
        utterance.rate = 0.96;
        utterance.pitch = 1.08;
        utterance.volume = 1;
        currentUtteranceRef.current = utterance;
        const cleanup = () => {
          currentUtteranceRef.current = null;
          stopBargeInDetector();
          resolve();
        };
        utterance.onend = cleanup;
        utterance.onerror = cleanup;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        // Barge-in désactivé : on n'écoute PAS le micro pendant que Lia parle.
        // Le micro ne sera réarmé qu'une fois la lecture terminée (cleanup → resolve()).
        return true;
      };
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
        const contentType = resp.headers.get("Content-Type") || "";
        if (!contentType.startsWith("audio/")) {
          const payload = await resp.json().catch(() => null);
          if (payload?.fallback === "browser") throw new Error(payload.reason || "TTS browser fallback requested");
          throw new Error("TTS response is not audio");
        }
        const blob = await resp.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.volume = 1;
        audio.muted = false;
        audio.preload = "auto";
        currentAudioRef.current = audio;
        // L'indicateur de niveau audio reste piloté par le moniteur micro
        // permanent (voir startMicMonitor) — l'utilisateur voit en continu si
        // son micro le capte, même pendant que Lia parle.
        const cleanup = () => {
          URL.revokeObjectURL(audioUrl);
          if (currentAudioRef.current === audio) currentAudioRef.current = null;
          stopBargeInDetector();
          resolve();
        };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        try {
          await audio.play();
        } catch (err) {
          console.warn("[TTS] play failed", err);
          cleanup();
          return;
        }
        // Barge-in désactivé : aucun détecteur d'interruption n'est armé pendant
        // la lecture TTS. Le micro reste FERMÉ tant que Lia parle, et ne sera
        // réouvert qu'au tour d'écoute suivant (après audio.onended).
      } catch (e) {
        console.error("TTS speak error:", e);
        if (!speakWithBrowserVoice()) resolve();
      }
    });
  }, [startBargeInDetector, stopBargeInDetector, runAnalyserLoop, stopAudioLevel, setAudioLevel]);

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
    // L'indicateur visuel est géré par le moniteur permanent (startMicMonitor).
    // On utilise ici l'analyser uniquement pour la détection de fin de parole.

    // Détection de fin de parole — réglée pour ATTENDRE que l'utilisateur ait
    // vraiment terminé sa phrase, plutôt que de couper à la moindre micro-pause.
    // Sans ça, on transcrit des bouts de phrase incomplets et l'IA répond à
    // côté (voire dans une autre langue si l'audio est trop court/silencieux).
    // Seuils ajustés pour mieux capter les phrases longues, les voix calmes
    // et les hésitations sans couper l'utilisateur en plein milieu.
    const SILENCE_THRESHOLD = 0.018;       // un peu plus permissif (capte voix faibles)
    const SILENCE_DURATION_MS = 1500;      // 1.5s de silence = fin de phrase (laisse le temps de réfléchir)
    const MAX_DURATION_MS = 30000;         // 30s max par tour (phrases longues OK)
    const MIN_SPEECH_MS = 400;             // au moins 0.4s de voix réelle
    // Délai d'attente AVANT la première parole : on laisse l'utilisateur le
    // temps de réfléchir avant de parler. S'il ne dit rien du tout, on
    // re-déclenche un cycle propre (aucune transcription bidon envoyée).
    const INITIAL_SILENCE_TIMEOUT_MS = 8000;

    const start = Date.now();
    let lastVoiceAt = Date.now();
    let hasSpoken = false;
    // Cumule la durée totale de signal vocal détecté (pour exiger une vraie phrase
    // et non un simple "tic" parasite avant de couper.
    let voicedMs = 0;
    let lastTickAt = start;

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
        const dt = now - lastTickAt;
        lastTickAt = now;
        if (rms > SILENCE_THRESHOLD) {
          lastVoiceAt = now;
          hasSpoken = true;
          voicedMs += dt;
        }
        const elapsed = now - start;
        const silentFor = now - lastVoiceAt;
        if (elapsed > MAX_DURATION_MS) return resolve();
        // Fin de parole : on a entendu assez de voix ET un silence soutenu.
        if (hasSpoken && voicedMs >= MIN_SPEECH_MS && silentFor > SILENCE_DURATION_MS) return resolve();
        // L'utilisateur n'a strictement rien dit après plusieurs secondes →
        // on coupe et le caller détectera un texte vide (=> nouveau cycle).
        if (!hasSpoken && elapsed > INITIAL_SILENCE_TIMEOUT_MS) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });

    try { ctx.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
    // Si on n'a JAMAIS détecté de parole, on ne perd pas un appel STT (qui
    // hallucinerait souvent un "Merci.", "Sous-titres réalisés par...", etc.
    // dans une langue aléatoire) — on stoppe le mediaRecorder et on retourne "".
    if (!hasSpoken) {
      try { await webVoiceService.stopAndTranscribe(); } catch { /* ignore */ }
      return "";
    }
    return webVoiceService.stopAndTranscribe();
  }, [runAnalyserLoop, stopAudioLevel]);

  /**
   * Appelle ai-orchestrator en streaming.
   * `onSentence` est appelé à chaque phrase complète (pour démarrer le TTS
   * en parallèle, pendant que le LLM continue d'écrire). Retourne la réponse
   * complète à la fin pour mise à jour du transcript.
   */
  const askAI = useCallback(async (
    userText: string,
    onSentence?: (sentence: string) => void,
    onDelta?: (chunk: string) => void,
  ): Promise<string> => {
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
    // Tampon pour découper en phrases au fil de l'eau.
    let sentenceBuf = "";
    const MIN_SENTENCE_LEN = 12; // évite de TTS-er "Ok." tout seul
    const flushSentences = (force = false) => {
      // Cherche une fin de phrase : . ! ? … suivi d'un espace ou fin.
      // On n'envoie que si la phrase a un minimum de contenu pour limiter
      // le nombre d'appels TTS et garder une intonation naturelle.
      const re = /([^.!?…]+[.!?…]+)(\s+|$)/g;
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sentenceBuf)) !== null) {
        const s = m[1].trim();
        if (s.length >= MIN_SENTENCE_LEN) {
          onSentence?.(s);
          lastIdx = re.lastIndex;
        }
      }
      if (lastIdx > 0) sentenceBuf = sentenceBuf.slice(lastIdx);
      if (force && sentenceBuf.trim().length > 0) {
        onSentence?.(sentenceBuf.trim());
        sentenceBuf = "";
      }
    };
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
          if (j.delta) {
            full += j.delta;
            sentenceBuf += j.delta;
            onDelta?.(j.delta);
            flushSentences(false);
          }
        } catch { /* ignore parse errors mid-stream */ }
      }
    }
    // Flush du reste (dernière phrase sans ponctuation finale).
    flushSentences(true);
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
      // Filtre anti-hallucinations connues des moteurs STT (Whisper/Gemini
      // produisent souvent ces phrases sur du silence ou du bruit blanc, parfois
      // dans une autre langue → l'IA répondrait alors à côté).
      if (isLikelySttHallucination(userText)) {
        console.warn("[voice] STT hallucination ignorée:", userText);
        continue;
      }

      setTranscript((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: userText, ts: Date.now() }]);

      // 2. Réflexion + parole en parallèle
      // On streame la réponse phrase par phrase. Dès qu'une phrase est complète,
      // on l'envoie à la file TTS qui la lit pendant que le LLM continue
      // d'écrire la suite. Lia commence donc à parler quasi instantanément.
      setPhase("thinking");
      interruptedRef.current = false;

      // File d'attente TTS séquentielle.
      const ttsQueue: string[] = [];
      let ttsRunning = false;
      let firstSpoken = false;
      const drainQueue = async () => {
        if (ttsRunning) return;
        ttsRunning = true;
        while (ttsQueue.length > 0 && !cycleAbortRef.current.aborted) {
          const next = ttsQueue.shift()!;
          if (!firstSpoken) {
            firstSpoken = true;
            setPhase("speaking");
          }
          await speak(next);
        }
        ttsRunning = false;
      };

      // ID de message assistant qu'on met à jour au fur et à mesure du stream.
      const assistantId = crypto.randomUUID();
      let assistantText = "";
      setTranscript((prev) => [...prev, { id: assistantId, role: "assistant", text: "", ts: Date.now() }]);

      let answer = "";
      try {
        answer = await askAI(
          userText,
          (sentence) => {
            ttsQueue.push(sentence);
            void drainQueue();
          },
          (chunk) => {
            assistantText += chunk;
            setTranscript((prev) => prev.map((m) => m.id === assistantId ? { ...m, text: assistantText } : m));
          },
        );
      } catch (e: any) {
        providersRef.current.onError?.(e?.message || "L'IA n'a pas répondu");
        setPhase("idle");
        break;
      }
      if (cycleAbortRef.current.aborted) break;
      if (!answer) {
        // Retire le message assistant vide
        setTranscript((prev) => prev.filter((m) => m.id !== assistantId));
        continue;
      }
      // Garantit que le texte final est bien complet dans le transcript.
      setTranscript((prev) => prev.map((m) => m.id === assistantId ? { ...m, text: answer } : m));

      // Attend la fin de la file TTS (les dernières phrases sont peut-être
      // encore en lecture).
      while ((ttsRunning || ttsQueue.length > 0) && !cycleAbortRef.current.aborted) {
        await new Promise((r) => setTimeout(r, 100));
      }
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
    // Précharge les voix navigateur pour le repli local si le service TTS externe refuse la requête.
    try { window.speechSynthesis?.getVoices(); } catch { /* ignore */ }
    cycleAbortRef.current = { aborted: false };
    conversationHistoryRef.current = [];
    setIsCallActive(true);
    // Démarre le moniteur micro permanent : l'indicateur reflète TON volume
    // en continu pendant tout l'appel (écoute, réflexion, et parole de Lia).
    startMicMonitor();
    // Lance la boucle (non-bloquant)
    runConversationLoop().finally(() => setIsCallActive(false));
  }, [supported, runConversationLoop, startMicMonitor]);

  const endCall = useCallback(() => {
    cycleAbortRef.current.aborted = true;
    setIsCallActive(false);
    setPhase("idle");
    stopBargeInDetector();
    stopAudioLevel();
    stopMicMonitor();
    try {
      currentAudioRef.current?.pause();
      currentAudioRef.current = null;
      window.speechSynthesis?.cancel();
      currentUtteranceRef.current = null;
    } catch { /* ignore */ }
    try {
      // Si un enregistrement est en cours, on coupe le micro brutalement
      const stream = webVoiceService.getStream();
      stream?.getTracks().forEach((t) => t.stop());
    } catch { /* ignore */ }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
  }, [stopBargeInDetector, stopAudioLevel, stopMicMonitor]);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  // Cleanup global au démontage
  useEffect(() => {
    return () => { endCall(); };
  }, [endCall]);

  const value: TwinVoiceContextValue = {
    isCallActive, status, transcript, interim, supported, audioLevel,
    startCall, endCall, clearTranscript, setContextProviders,
  };

  return <TwinVoiceContext.Provider value={value}>{children}</TwinVoiceContext.Provider>;
}

export function useTwinVoiceContext() {
  const ctx = useContext(TwinVoiceContext);
  if (!ctx) throw new Error("useTwinVoiceContext must be used inside <TwinVoiceProvider>");
  return ctx;
}