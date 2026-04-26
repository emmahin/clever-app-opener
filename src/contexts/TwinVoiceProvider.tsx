import { createContext, useContext, ReactNode, useCallback, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
import { twinMemoryService, type MemoryCategory } from "@/services";

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
  const supported = true; // ElevenLabs gère via WebRTC, supporté partout (Chrome, Edge, Safari, Firefox).

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

  // ─── Client tools exposés à l'agent ElevenLabs ──────────────────────────
  // Ces fonctions DOIVENT être déclarées dans le dashboard ElevenLabs (onglet Tools)
  // pour que l'agent puisse les appeler.
  const clientTools = {
    remember_fact: async (params: { category?: string; content: string; importance?: number }) => {
      try {
        const valid: MemoryCategory[] = ["habit", "preference", "goal", "fact", "emotion", "relationship"];
        const cat = (valid.includes(params.category as MemoryCategory) ? params.category : "fact") as MemoryCategory;
        await twinMemoryService.addMemory({
          category: cat,
          content: String(params.content || "").trim(),
          importance: Math.min(5, Math.max(1, Number(params.importance) || 3)),
          source: "voice",
        });
        providersRef.current.onMemoryChange?.();
        return `OK, mémorisé (${cat}).`;
      } catch (e: any) {
        return `Erreur mémorisation: ${e?.message || "inconnue"}`;
      }
    },
    add_schedule_event: async (params: { title: string; start_iso: string; end_iso?: string; location?: string; notes?: string }) => {
      try {
        const start = new Date(params.start_iso);
        if (isNaN(start.getTime())) return "Date invalide.";
        await twinMemoryService.addEvent({
          title: String(params.title || "").trim() || "Événement",
          start_iso: start.toISOString(),
          end_iso: params.end_iso ? new Date(params.end_iso).toISOString() : undefined,
          location: params.location,
          notes: params.notes,
          source: "ai",
        });
        providersRef.current.onMemoryChange?.();
        return `Événement ajouté pour le ${start.toLocaleString("fr-FR")}.`;
      } catch (e: any) {
        return `Erreur agenda: ${e?.message || "inconnue"}`;
      }
    },
    get_user_context: async () => {
      const mem = providersRef.current.getMemoriesContext?.() || "";
      const events = providersRef.current.getEventsContext?.() || "";
      return `Mémoires:\n${mem}\n\nAgenda:\n${events}`.slice(0, 4000);
    },
  };

  const conversation = useConversation({
    clientTools,
    onConnect: () => {
      console.log("[Twin] Connected to ElevenLabs agent");
    },
    onDisconnect: () => {
      setIsCallActive(false);
    },
    onMessage: (message: any) => {
      // Le SDK émet user_transcript et agent_response selon les events activés.
      const t = message?.message ?? message?.text ?? "";
      const src = message?.source ?? message?.type;
      if (!t) return;
      const role: TwinRole = src === "user" || src === "user_transcript" ? "user" : "assistant";
      setTranscript((prev) => [...prev, { id: crypto.randomUUID(), role, text: String(t), ts: Date.now() }]);
    },
    onError: (err: any) => {
      console.error("[Twin] ElevenLabs error", err);
      providersRef.current.onError?.(typeof err === "string" ? err : (err?.message || "Erreur du double"));
    },
  });

  const status: "idle" | "listening" | "thinking" | "speaking" =
    !isCallActive ? "idle" : conversation.isSpeaking ? "speaking" : "listening";

  const startCall = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      providersRef.current.onError?.("Microphone refusé.");
      return;
    }

    try {
      // Récupère un token WebRTC frais via notre edge function (clé API serveur).
      const { data, error } = await supabase.functions.invoke("elevenlabs-agent-token");
      if (error) throw new Error(error.message || "Échec récupération token");
      if (!data?.token) throw new Error("Token vide");

      // Injecte les contextes mémoire/agenda dans le system prompt à chaud.
      const memCtx = providersRef.current.getMemoriesContext?.() || "";
      const evCtx = providersRef.current.getEventsContext?.() || "";
      const contextBlock = [memCtx && `MÉMOIRES UTILISATEUR:\n${memCtx}`, evCtx && `AGENDA:\n${evCtx}`]
        .filter(Boolean)
        .join("\n\n");

      await conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
        ...(contextBlock
          ? {
              overrides: {
                agent: {
                  prompt: { prompt: contextBlock },
                },
              },
            }
          : {}),
      } as any);

      setIsCallActive(true);
    } catch (e: any) {
      providersRef.current.onError?.(e?.message || "Impossible de démarrer la conversation");
    }
  }, [conversation]);

  const endCall = useCallback(() => {
    setIsCallActive(false);
    conversation.endSession().catch(() => { /* ignore */ });
  }, [conversation]);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

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