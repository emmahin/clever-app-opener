/**
 * Service pour gérer les règles d'emploi du temps récurrentes (cours, etc.)
 * et lancer l'auto-complétion (génère les events des prochains jours).
 */
import { supabase } from "@/integrations/supabase/client";

export interface RecurringRule {
  id: string;
  user_id: string;
  title: string;
  day_of_week: number; // 0=dimanche, 6=samedi
  start_time: string; // HH:MM:SS
  end_time: string | null;
  location: string | null;
  notes: string | null;
  active_from: string;
  active_until: string | null;
  is_active: boolean;
  skip_school_holidays: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutofillResult {
  ok: boolean;
  inserted: number;
  skipped: number;
}

async function uid(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");
  return user.id;
}

class RecurringScheduleService {
  async list(): Promise<RecurringRule[]> {
    const u = await uid();
    const { data, error } = await supabase
      .from("recurring_schedule_rules")
      .select("*")
      .eq("user_id", u)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw error;
    return (data ?? []) as RecurringRule[];
  }

  async add(input: {
    title: string;
    day_of_week: number;
    start_time: string;
    end_time?: string;
    location?: string;
    notes?: string;
    active_from?: string;
    active_until?: string;
    skip_school_holidays?: boolean;
  }): Promise<RecurringRule> {
    const u = await uid();
    const { data, error } = await supabase
      .from("recurring_schedule_rules")
      .insert({
        user_id: u,
        title: input.title,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        end_time: input.end_time ?? null,
        location: input.location ?? null,
        notes: input.notes ?? null,
        active_from: input.active_from ?? new Date().toISOString().slice(0, 10),
        active_until: input.active_until ?? null,
        skip_school_holidays: input.skip_school_holidays ?? true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as RecurringRule;
  }

  async update(id: string, patch: Partial<Omit<RecurringRule, "id" | "user_id" | "created_at" | "updated_at">>): Promise<RecurringRule> {
    const { data, error } = await supabase
      .from("recurring_schedule_rules")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as RecurringRule;
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("recurring_schedule_rules").delete().eq("id", id);
    if (error) throw error;
  }

  /** Déclenche l'auto-complétion pour le user courant sur N jours. */
  async runAutofill(daysAhead = 7): Promise<AutofillResult> {
    const { data, error } = await supabase.functions.invoke("schedule-autofill", {
      body: { days_ahead: daysAhead },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as AutofillResult;
  }
}

export const recurringScheduleService = new RecurringScheduleService();

export const DAY_LABELS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];