/**
 * Mood service — analyse émotionnelle des messages user + insights hebdo.
 *
 * Toutes les opérations ici sont "fire-and-forget" : elles ne doivent JAMAIS
 * casser le chat ou bloquer l'UI. En cas d'erreur, on log et on continue.
 *
 * Conformément à l'architecture du projet, AUCUN composant ne doit toucher
 * directement aux tables `message_moods` ou `mood_insights` — tout passe par ici.
 */
import { supabase } from "@/integrations/supabase/client";

export type Mood =
  | "joyful" | "calm" | "neutral" | "tired" | "stressed"
  | "anxious" | "sad" | "angry" | "frustrated" | "excited" | "reflective";

export interface MoodEntry {
  id: string;
  message_id: string;
  conversation_id: string;
  mood: Mood;
  intensity: number;
  themes: string[];
  summary: string;
  created_at: string;
}

export type InsightCategory = "pattern" | "positive" | "concern" | "suggestion";

export interface MoodInsight {
  id: string;
  period_start: string;
  period_end: string;
  insight: string;
  category: InsightCategory;
  themes: string[];
  suggested_action: string | null;
  dismissed: boolean;
  read_at: string | null;
  created_at: string;
}

export interface IMoodService {
  /** Lance l'analyse d'un message user en arrière-plan. Ne throw jamais. */
  tagMessage(args: { messageId: string; conversationId: string; content: string }): Promise<void>;
  /** Récupère les N derniers moods de l'utilisateur. */
  recent(limit?: number): Promise<MoodEntry[]>;
  /** Calcule un résumé de la tendance émotionnelle des N derniers jours. */
  recentContext(days?: number): Promise<{ dominantMood: string; trend: string; topThemes: string[]; sampleSize: number } | null>;
  /** Demande la génération des insights hebdo (idempotent côté serveur). */
  generateWeeklyInsights(): Promise<{ ok: boolean; insights?: MoodInsight[] }>;
  /** Liste les insights non-dismissés, plus récents d'abord. */
  listInsights(limit?: number): Promise<MoodInsight[]>;
  /** Marque un insight comme lu. */
  markRead(id: string): Promise<void>;
  /** Marque un insight comme ignoré (n'apparaît plus). */
  dismiss(id: string): Promise<void>;
}

class MoodService implements IMoodService {
  async tagMessage(args: { messageId: string; conversationId: string; content: string }) {
    try {
      // On n'attend pas la fin : fire-and-forget total.
      void supabase.functions
        .invoke("analyze-mood", {
          body: {
            message_id: args.messageId,
            conversation_id: args.conversationId,
            content: args.content,
          },
        })
        .catch((e) => {
          console.warn("[mood] tag failed (silent)", e);
        });
    } catch (e) {
      console.warn("[mood] tag invoke threw (silent)", e);
    }
  }

  async recent(limit = 30) {
    const { data, error } = await supabase
      .from("message_moods")
      .select("id, message_id, conversation_id, mood, intensity, themes, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[mood] recent failed", error);
      return [];
    }
    return (data ?? []) as MoodEntry[];
  }

  async recentContext(days = 7) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("message_moods")
        .select("mood, intensity, themes, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error || !data || data.length < 3) return null;
      // Dominant mood (par fréquence pondérée par l'intensité)
      const moodScore = new Map<string, number>();
      const themeCount = new Map<string, number>();
      for (const r of data) {
        moodScore.set(r.mood, (moodScore.get(r.mood) ?? 0) + (Number(r.intensity) || 0.5));
        for (const th of (r.themes ?? [])) {
          themeCount.set(th, (themeCount.get(th) ?? 0) + 1);
        }
      }
      const dominantMood = [...moodScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";
      const topThemes = [...themeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
      // Tendance : compare la moitié récente vs l'ancienne par intensité moyenne
      const half = Math.floor(data.length / 2);
      const avg = (slice: typeof data) =>
        slice.reduce((s, r) => s + (Number(r.intensity) || 0), 0) / Math.max(1, slice.length);
      const recentAvg = avg(data.slice(0, half));
      const olderAvg = avg(data.slice(half));
      const delta = recentAvg - olderAvg;
      const trend = delta > 0.1 ? "intensifying" : delta < -0.1 ? "calming" : "stable";
      return { dominantMood, trend, topThemes, sampleSize: data.length };
    } catch (e) {
      console.warn("[mood] recentContext failed", e);
      return null;
    }
  }

  async generateWeeklyInsights() {
    try {
      const { data, error } = await supabase.functions.invoke("weekly-insight", { body: {} });
      if (error) {
        console.warn("[mood] weekly insights failed", error);
        return { ok: false };
      }
      return { ok: true, insights: (data?.insights ?? []) as MoodInsight[] };
    } catch (e) {
      console.warn("[mood] weekly insights threw", e);
      return { ok: false };
    }
  }

  async listInsights(limit = 10) {
    const { data, error } = await supabase
      .from("mood_insights")
      .select("id, period_start, period_end, insight, category, themes, suggested_action, dismissed, read_at, created_at")
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[mood] listInsights failed", error);
      return [];
    }
    return (data ?? []) as MoodInsight[];
  }

  async markRead(id: string) {
    const { error } = await supabase
      .from("mood_insights")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.warn("[mood] markRead failed", error);
  }

  async dismiss(id: string) {
    const { error } = await supabase
      .from("mood_insights")
      .update({ dismissed: true })
      .eq("id", id);
    if (error) console.warn("[mood] dismiss failed", error);
  }
}

export const moodService: IMoodService = new MoodService();