/**
 * Conversation persistence service.
 * Stocke conversations + messages de chat dans Supabase, par utilisateur.
 * Tout passe par ce service — aucun composant ne doit toucher la table directement.
 */
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage, ChatWidget } from "./types";

export interface Conversation {
  id: string;
  title: string;
  last_message_at: string;
  created_at: string;
}

export interface IConversationService {
  /** Liste les conversations de l'utilisateur, plus récente d'abord. */
  list(): Promise<Conversation[]>;
  /** Crée une nouvelle conversation vide (sans messages). */
  create(title?: string): Promise<Conversation>;
  /** Renomme une conversation. */
  rename(id: string, title: string): Promise<void>;
  /** Supprime une conversation et ses messages (cascade). */
  remove(id: string): Promise<void>;
  /** Récupère tous les messages d'une conversation, ordonnés. */
  getMessages(conversationId: string): Promise<ChatMessage[]>;
  /** Ajoute un message. Met aussi à jour `last_message_at`. */
  addMessage(conversationId: string, msg: ChatMessage): Promise<void>;
  /** Met à jour le contenu/widgets d'un message existant (utilisé pendant le streaming). */
  updateMessage(messageId: string, patch: { content?: string; widgets?: ChatWidget[] }): Promise<void>;
}

async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");
  return user.id;
}

function smartTitleFrom(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Nouveau chat";
  return cleaned.slice(0, 60) + (cleaned.length > 60 ? "…" : "");
}

class ConversationService implements IConversationService {
  async list() {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, last_message_at, created_at")
      .eq("user_id", uid)
      .order("last_message_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Conversation[];
  }

  async create(title = "Nouveau chat") {
    const uid = await requireUserId();
    const safeTitle = (typeof title === "string" && title.trim() ? title.trim() : "Nouveau chat").slice(0, 120);
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: uid, title: safeTitle })
      .select("id, title, last_message_at, created_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Création de la conversation impossible");
    return data as Conversation;
  }

  async rename(id: string, title: string) {
    if (!id) throw new Error("id requis");
    const safeTitle = (typeof title === "string" ? title.trim() : "").slice(0, 120) || "Sans titre";
    const { error } = await supabase
      .from("conversations")
      .update({ title: safeTitle })
      .eq("id", id);
    if (error) throw error;
  }

  async remove(id: string) {
    if (!id) throw new Error("id requis");
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) throw error;
  }

  async getMessages(conversationId: string) {
    if (!conversationId) return [];
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, widgets, position, created_at")
      .eq("conversation_id", conversationId)
      .order("position", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      role: row.role as ChatMessage["role"],
      content: row.content ?? "",
      widgets: Array.isArray(row.widgets) && row.widgets.length ? (row.widgets as ChatWidget[]) : undefined,
      createdAt: new Date(row.created_at).getTime(),
    })) as ChatMessage[];
  }

  async addMessage(conversationId: string, msg: ChatMessage) {
    if (!conversationId) throw new Error("conversationId requis");
    if (!msg?.id || !msg?.role) throw new Error("Message invalide");
    const uid = await requireUserId();
    const row = {
      id: msg.id,
      conversation_id: conversationId,
      user_id: uid,
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : "",
      widgets: (msg.widgets ?? []) as unknown as never,
      position: msg.createdAt, // simple: timestamp = position naturelle
    };
    const { error } = await supabase.from("chat_messages").insert(row as never);
    if (error) throw error;

    // Mise à jour last_message_at + auto-titre si c'est le premier message user.
    const patch: { last_message_at: string; title?: string } = {
      last_message_at: new Date().toISOString(),
    };
    if (msg.role === "user") {
      const { data: conv } = await supabase
        .from("conversations")
        .select("title")
        .eq("id", conversationId)
        .maybeSingle();
      if (conv && (conv.title === "Nouveau chat" || !conv.title)) {
        patch.title = smartTitleFrom(msg.content);
      }
    }
    await supabase.from("conversations").update(patch).eq("id", conversationId);
  }

  async updateMessage(messageId: string, patch: { content?: string; widgets?: ChatWidget[] }) {
    const update: { content?: string; widgets?: never } = {};
    if (patch.content !== undefined) update.content = patch.content;
    if (patch.widgets !== undefined) update.widgets = patch.widgets as unknown as never;
    if (Object.keys(update).length === 0) return;
    const { error } = await supabase.from("chat_messages").update(update as never).eq("id", messageId);
    if (error) throw error;
  }
}

export const conversationService: IConversationService = new ConversationService();