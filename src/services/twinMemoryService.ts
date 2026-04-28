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

const VALID_CATEGORIES: ReadonlySet<MemoryCategory> = new Set([
  "habit", "preference", "goal", "fact", "emotion", "relationship",
]);

const MAX_CONTENT_LEN = 2000;
const MAX_TITLE_LEN = 200;
const MAX_LOCATION_LEN = 200;
const MAX_NOTES_LEN = 2000;

function clampImportance(v: unknown, fallback = 3): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(5, Math.max(1, n));
}

function ensureNonEmptyString(value: unknown, label: string, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new Error(`${label} requis`);
  return s.slice(0, max);
}

function ensureIsoDate(value: unknown, label: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new Error(`${label} requis`);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) throw new Error(`${label} invalide (date attendue)`);
  return new Date(t).toISOString();
}

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
  google_event_id: string | null;
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
    if (!VALID_CATEGORIES.has(category)) throw new Error("Catégorie de mémoire invalide");
    const safeContent = ensureNonEmptyString(content, "Contenu", MAX_CONTENT_LEN);
    const safeImportance = clampImportance(importance);
    const safeSource = (typeof source === "string" && source.trim() ? source.trim() : "manual").slice(0, 60);
    const { data, error } = await supabase
      .from("user_memories")
      .insert({ user_id: uid, category, content: safeContent, importance: safeImportance, source: safeSource })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Création de la mémoire impossible");
    return data as UserMemory;
  }

  async updateMemory(id, patch) {
    if (!id) throw new Error("id requis");
    const safePatch: Record<string, unknown> = {};
    if (patch?.content !== undefined) safePatch.content = ensureNonEmptyString(patch.content, "Contenu", MAX_CONTENT_LEN);
    if (patch?.importance !== undefined) safePatch.importance = clampImportance(patch.importance);
    if (patch?.category !== undefined) {
      if (!VALID_CATEGORIES.has(patch.category as MemoryCategory)) throw new Error("Catégorie invalide");
      safePatch.category = patch.category;
    }
    if (Object.keys(safePatch).length === 0) {
      // Rien à mettre à jour : on relit la ligne pour rester cohérent.
      const { data, error } = await supabase.from("user_memories").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Mémoire introuvable");
      return data as UserMemory;
    }
    const { data, error } = await supabase
      .from("user_memories")
      .update(safePatch as never)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Mémoire introuvable");
    return data as UserMemory;
  }

  async deleteMemory(id) {
    if (!id) throw new Error("id requis");
    const { error } = await supabase.from("user_memories").delete().eq("id", id);
    if (error) throw error;
  }

  async listEvents(rangeDays = 30) {
    const uid = await requireUserId();
    const safeRange = Math.min(365, Math.max(1, Math.round(Number(rangeDays) || 30)));
    const from = new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString();
    const to = new Date(Date.now() + safeRange * 24 * 3600 * 1000).toISOString();
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
    const safeTitle = ensureNonEmptyString(title, "Titre", MAX_TITLE_LEN);
    const safeStart = ensureIsoDate(start_iso, "Date de début");
    let safeEnd: string | null = null;
    if (end_iso !== undefined && end_iso !== null && String(end_iso).trim() !== "") {
      safeEnd = ensureIsoDate(end_iso, "Date de fin");
      if (Date.parse(safeEnd) < Date.parse(safeStart)) {
        throw new Error("La date de fin doit être après la date de début");
      }
    }
    const safeLocation = location ? String(location).trim().slice(0, MAX_LOCATION_LEN) : null;
    const safeNotes = notes ? String(notes).trim().slice(0, MAX_NOTES_LEN) : null;
    const safeSource = (typeof source === "string" && source.trim() ? source.trim() : "manual").slice(0, 60);
    const { data, error } = await supabase
      .from("schedule_events")
      .insert({
        user_id: uid,
        title: safeTitle,
        start_iso: safeStart,
        end_iso: safeEnd,
        location: safeLocation,
        notes: safeNotes,
        source: safeSource,
      })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Création de l'événement impossible");
    return data as ScheduleEventDB;
  }

  async deleteEvent(id) {
    if (!id) throw new Error("id requis");
    const { error } = await supabase.from("schedule_events").delete().eq("id", id);
    if (error) throw error;
  }

  async listSummaries(limit = 10) {
    const uid = await requireUserId();
    const safeLimit = Math.min(100, Math.max(1, Math.round(Number(limit) || 10)));
    const { data, error } = await supabase
      .from("conversation_summaries")
      .select("*")
      .eq("user_id", uid)
      .order("period_start", { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    return (data ?? []) as ConversationSummary[];
  }

  async addSummary(input) {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("conversation_summaries")
      .insert({ ...input, user_id: uid })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Création du résumé impossible");
    return data as ConversationSummary;
  }
}

export const twinMemoryService: ITwinMemoryService = new TwinMemoryService();