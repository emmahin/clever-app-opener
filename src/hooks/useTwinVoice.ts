import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { twinMemoryService, type MemoryCategory } from "@/services";

export type TwinRole = "user" | "assistant";
export interface TwinTurn { id: string; role: TwinRole; text: string; ts: number }

interface UseTwinVoiceOpts {
  onError?: (msg: string) => void;
  onMemoryChange?: () => void;
  getMemoriesContext?: () => string;
  getEventsContext?: () => string;
}

/**
 * Voice loop 100% Lovable AI :
 *  - STT navigateur (Web Speech API) : reconnaissance vocale gratuite illimitée
 *  - LLM : Lovable AI Gateway (Gemini) via edge fn `twin-chat` (avec tool calling)
 *  - TTS : edge fn `twin-tts` (ElevenLabs free tier) avec fallback SpeechSynthesis
 *
 * État `status` : idle | listening | thinking | speaking
 */
export function useTwinVoice(opts: UseTwinVoiceOpts = {}) {
  const { onError, onMemoryChange, getMemoriesContext, getEventsContext } = opts;

  const [isCallActive, setIsCallActive] = useState(false);
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [transcript, setTranscript] = useState<TwinTurn[]>([]);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesRef = useRef<{ role: "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[] }[]>([]);
  const callActiveRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);

  // ─── Init recognition ───
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t + " ";
        else interimText += t;
      }
      if (interimText) setInterim(interimText);
      if (finalText.trim()) {
        setInterim("");
        handleUserUtterance(finalText.trim());
      }
    };

    rec.onerror = (e: any) => {
      // 'no-speech' arrive souvent en silence prolongé : on relancera dans onend.
      if (e.error && e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("[Twin] recognition error:", e.error);
      }
    };

    rec.onend = () => {
      // Auto-restart tant que l'appel est actif (et qu'on n'est pas en train de parler)
      if (callActiveRef.current && status !== "speaking" && status !== "thinking") {
        if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = window.setTimeout(() => {
          try { rec.start(); } catch { /* déjà démarré */ }
        }, 200) as unknown as number;
      }
    };

    recognitionRef.current = rec;
    return () => {
      try { rec.abort(); } catch { /* ignore */ }
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try { rec.start(); setStatus("listening"); } catch { /* déjà démarré */ }
  }, []);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try { rec.stop(); } catch { /* ignore */ }
  }, []);

  // ─── Tools handlers (côté client, RLS user) ───
  async function executeTool(name: string, args: any): Promise<string> {
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
        onMemoryChange?.();
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
        onMemoryChange?.();
        return `Événement ajouté pour le ${start.toLocaleString("fr-FR")}.`;
      }
      return `Tool inconnu: ${name}`;
    } catch (e: any) {
      return `Erreur tool ${name}: ${e?.message || "inconnue"}`;
    }
  }

  // ─── Loop principale ───
  async function callChat(): Promise<string> {
    const memoriesContext = getMemoriesContext?.() || "";
    const eventsContext = getEventsContext?.() || "";
    const { data, error } = await supabase.functions.invoke("twin-chat", {
      body: { messages: messagesRef.current, memoriesContext, eventsContext },
    });
    if (error) throw new Error(error.message || "Échec IA");
    if (data?.error) throw new Error(data.error);
    const message = data?.message;
    if (!message) throw new Error("Réponse vide");

    // Tool calls ?
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      messagesRef.current.push({ role: "assistant", content: message.content || "", tool_calls: message.tool_calls });
      for (const call of message.tool_calls) {
        const name = call.function?.name;
        let args: any = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch { /* ignore */ }
        const result = await executeTool(name, args);
        messagesRef.current.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      // Re-call pour la réponse finale
      return await callChat();
    }

    const text: string = message.content || "";
    messagesRef.current.push({ role: "assistant", content: text });
    return text;
  }

  async function speak(text: string): Promise<void> {
    setStatus("speaking");
    return new Promise<void>(async (resolve) => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twin-tts`;
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        });
        const ct = r.headers.get("Content-Type") || "";
        if (r.ok && ct.startsWith("audio/")) {
          const blob = await r.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audioRef.current = audio;
          audio.onended = () => { URL.revokeObjectURL(audio.src); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(audio.src); resolve(); };
          await audio.play();
          return;
        }
        // Fallback navigateur
        speakBrowser(text, resolve);
      } catch (e) {
        console.warn("[Twin] TTS server failed, fallback browser:", e);
        speakBrowser(text, resolve);
      }
    });
  }

  function speakBrowser(text: string, done: () => void) {
    if (!("speechSynthesis" in window)) { done(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 1.0;
    u.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const fr = voices.find((v) => v.lang?.startsWith("fr"));
    if (fr) u.voice = fr;
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  async function handleUserUtterance(text: string) {
    setTranscript((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text, ts: Date.now() }]);
    messagesRef.current.push({ role: "user", content: text });
    stopListening();
    setStatus("thinking");
    try {
      const reply = await callChat();
      setTranscript((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: reply, ts: Date.now() }]);
      await speak(reply);
    } catch (e: any) {
      onError?.(e?.message || "Erreur du double");
    } finally {
      if (callActiveRef.current) {
        setStatus("listening");
        startListening();
      } else {
        setStatus("idle");
      }
    }
  }

  const startCall = useCallback(async () => {
    if (!supported) {
      onError?.("Reconnaissance vocale non supportée. Utilisez Chrome, Edge ou Safari.");
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError?.("Microphone refusé.");
      return;
    }
    messagesRef.current = [];
    setTranscript([]);
    setInterim("");
    callActiveRef.current = true;
    setIsCallActive(true);
    // Petit message d'ouverture vocal pour engager
    setStatus("speaking");
    await speak("Bonjour. Je suis là, à l'écoute… De quoi as-tu envie de parler ?");
    if (callActiveRef.current) {
      setStatus("listening");
      startListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, startListening]);

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    setIsCallActive(false);
    setStatus("idle");
    stopListening();
    if (audioRef.current) { try { audioRef.current.pause(); } catch { /* ignore */ } }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [stopListening]);

  return {
    isCallActive,
    status, // idle | listening | thinking | speaking
    transcript,
    interim,
    supported,
    startCall,
    endCall,
  };
}