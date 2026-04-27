import { ChatMessage, ChatWidget } from "./types";
import { supabase } from "@/integrations/supabase/client";

export type ChatAttachment =
  | { kind: "image"; name: string; mime: string; dataUrl: string }
  | { kind: "document"; name: string; mime: string; text: string }
  | { kind: "audio"; name: string; mime: string; text: string };

export interface StreamChatParams {
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  onDelta: (chunk: string) => void;
  onWidgets?: (widgets: ChatWidget[]) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
  lang?: string;
  detailLevel?: "short" | "normal" | "detailed";
  customInstructions?: string;
  aiName?: string;
  attachments?: ChatAttachment[];
  webSearch?: boolean;
  deepThink?: boolean;
  forceTool?: "image" | "code" | null;
  schedule?: { title: string; start_iso: string; end_iso?: string; location?: string; notes?: string }[];
  /** Tendance émotionnelle récente (7 derniers jours) injectée dans le system prompt. */
  moodContext?: { dominantMood: string; trend: string; topThemes: string[]; sampleSize: number } | null;
  /** Mémoires utilisateur (top par importance) — déjà filtrées/tronquées côté client pour économiser les tokens. */
  memories?: { category: string; content: string; importance: number }[];
  /** Insights émotionnels hebdo non-dismissés (top 3). */
  insights?: { category: string; insight: string }[];
}

export interface IChatService {
  streamChat(params: StreamChatParams): Promise<void>;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-orchestrator`;

export const webChatService: IChatService = {
  async streamChat({ messages, onDelta, onWidgets, onDone, onError, signal, lang, detailLevel, customInstructions, aiName, attachments, webSearch, deepThink, forceTool, schedule, moodContext, memories, insights }) {
    try {
      // Récupère le JWT utilisateur (nécessaire pour identifier le user côté serveur — débit crédits).
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages,
          lang,
          detailLevel,
          customInstructions,
          aiName,
          attachments,
          webSearch,
          deepThink,
          forceTool,
          schedule,
          moodContext,
          memories,
          insights,
          // Donne au backend le fuseau horaire du navigateur pour qu'il
          // injecte l'heure locale + le jour de la semaine dans le system prompt.
          timezone: (() => {
            try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
            catch { return "UTC"; }
          })(),
        }),
        signal,
      });

      if (resp.status === 429) return onError(new Error("Trop de requêtes — réessayez dans un instant."));
      if (resp.status === 402) {
        let msg = "Crédits insuffisants pour cette requête.";
        try {
          const j = await resp.json();
          if (j?.code === "insufficient_credits") {
            msg = `Crédits insuffisants (solde ${j.balance ?? 0}, requis ${j.required ?? "?"}). Rechargez votre compte.`;
          } else if (j?.error) {
            msg = j.error;
          }
        } catch { /* ignore */ }
        const err = new Error(msg);
        (err as any).code = "insufficient_credits";
        return onError(err);
      }
      if (resp.status === 401) return onError(new Error("Session expirée — reconnectez-vous."));
      if (!resp.ok || !resp.body) return onError(new Error("Échec de la connexion à l'IA."));

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          try {
            const parsed = JSON.parse(json);
            if (parsed.error) { onError(new Error(parsed.error)); return; }
            if (parsed.widgets && onWidgets) onWidgets(parsed.widgets);
            if (parsed.delta) onDelta(parsed.delta);
            // parsed.done: end signal
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
      onDone();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      onError(e as Error);
    }
  },
};

export type { ChatMessage };
