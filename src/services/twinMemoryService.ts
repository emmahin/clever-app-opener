/**
 * Twin Memory service — handles facts/habits/preferences and schedule for the
 * "double numérique" (digital twin). All persisted in Supabase so the data
 * follows the user across devices and the AI can read/write it via tools.
 */
import { supabase } from "@/integrations/supabase/client";

export type MemoryCategory =
  | "habit"
  | "preference"
  | "goal"
  | "fact"
  | "emotion"
  | "relationship";

export interface UserMemory {
  id: string;
  user_id: string;
  category: MemoryCategory;
  content: string;
  importance: number;
  source: string;
  metadata: Record<string, unknown>;
  last_referenced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary {
  id: string;
  user_id: string;
  period: "daily" | "weekly" | "session";
  period_start: string;
  period_end: string;
  summary: string;
  patterns: Record<string, unknown>;
  emotional_tone: string | null;
  created_at: string;
}

export interface ScheduleEventDB {
  id: string;
  user_id: string;
  title: string;
  start_iso: string;
  end_iso: string | null;
  location: string | null;
  notes: string | null;
  source: string;
  external_id: string | null;
  external_provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface ITwinMemoryService {
  listMemories(category?: MemoryCategory): Promise<UserMemory[]>;
  addMemory(input: {
    category: MemoryCategory;
    content: string;
    importance?: number;
    source?: string;
  }): Promise<UserMemory>;
  updateMemory(id: string, patch: Partial<Pick<UserMemory, "content" | "importance" | "category">>): Promise<UserMemory>;
  deleteMemory(id: string): Promise<void>;

  listEvents(rangeDays?: number): Promise<ScheduleEventDB[]>;
  addEvent(input: {
    title: string;
    start_iso: string;
    end_iso?: string;
    location?: string;
    notes?: string;
    source?: string;
  }): Promise<ScheduleEventDB>;
  deleteEvent(id: string): Promise<void>;

  listSummaries(limit?: number): Promise<ConversationSummary[]>;
  addSummary(input: Omit<ConversationSummary, "id" | "user_id" | "created_at">): Promise<ConversationSummary>;
}

async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");
  return user.id;
}

class TwinMemoryService implements ITwinMemoryService {
  async listMemories(category?: MemoryCategory) {
    const uid = await requireUserId();
    let q = supabase.from("user_memories").select("*").eq("user_id", uid).order("importance", { ascending: false }).order("updated_at", { ascending: false });
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as UserMemory[];
  }

  async addMemory({ category, content, importance = 3, source = "manual" }) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("user_memories")
      .insert({ user_id: uid, category, content, importance, source })
      .select("*")
      .single();
    if (error) throw error;
    return data as UserMemory;
  }

  async updateMemory(id, patch) {
    const { data, error } = await supabase
      .from("user_memories")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as UserMemory;
  }

  async deleteMemory(id) {
    const { error } = await supabase.from("user_memories").delete().eq("id", id);
    if (error) throw error;
  }

  async listEvents(rangeDays = 30) {
    const uid = await requireUserId();
    const from = new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString();
    const to = new Date(Date.now() + rangeDays * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("schedule_events")
      .select("*")
      .eq("user_id", uid)
      .gte("start_iso", from)
      .lte("start_iso", to)
      .order("start_iso", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ScheduleEventDB[];
  }

  async addEvent({ title, start_iso, end_iso, location, notes, source = "manual" }) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("schedule_events")
      .insert({ user_id: uid, title, start_iso, end_iso, location, notes, source })
      .select("*")
      .single();
    if (error) throw error;
    return data as ScheduleEventDB;
  }

  async deleteEvent(id) {
    const { error } = await supabase.from("schedule_events").delete().eq("id", id);
    if (error) throw error;
  }

  async listSummaries(limit = 10) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("conversation_summaries")
      .select("*")
      .eq("user_id", uid)
      .order("period_start", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ConversationSummary[];
  }

  async addSummary(input) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("conversation_summaries")
      .insert({ ...input, user_id: uid })
      .select("*")
      .single();
    if (error) throw error;
    return data as ConversationSummary;
  }
}

export const twinMemoryService: ITwinMemoryService = new TwinMemoryService();