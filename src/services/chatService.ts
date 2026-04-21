import { ChatMessage } from "./types";

export interface StreamChatParams {
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  onDelta: (chunk: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}

export interface IChatService {
  streamChat(params: StreamChatParams): Promise<void>;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

export const webChatService: IChatService = {
  async streamChat({ messages, onDelta, onDone, onError, signal }) {
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages }),
        signal,
      });

      if (resp.status === 429) return onError(new Error("Trop de requêtes — réessayez dans un instant."));
      if (resp.status === 402) return onError(new Error("Crédits IA épuisés — ajoutez des crédits dans votre workspace."));
      if (!resp.ok || !resp.body) return onError(new Error("Échec de la connexion à l'IA."));

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
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
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) onDelta(delta);
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
