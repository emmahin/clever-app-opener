/**
 * Gère les abonnements iCal (Pronote, EDT universitaire, etc.).
 * Les events parsés atterrissent dans `schedule_events` via la edge function `ical-sync`.
 */
import { supabase } from "@/integrations/supabase/client";

export type IcalProvider = "pronote" | "edt" | "ical" | string;

export interface IcalSubscription {
  id: string;
  user_id: string;
  label: string;
  provider: IcalProvider;
  url: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  events_count: number;
  created_at: string;
  updated_at: string;
}

export interface IcalSyncResult {
  ok: boolean;
  results: Array<{
    id: string;
    label: string;
    ok: boolean;
    inserted?: number;
    updated?: number;
    total?: number;
    error?: string;
  }>;
}

async function uid(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");
  return user.id;
}

class IcalSubscriptionsService {
  async list(): Promise<IcalSubscription[]> {
    const { data, error } = await supabase
      .from("ical_subscriptions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as IcalSubscription[];
  }

  async add(input: {
    label: string;
    url: string;
    provider?: IcalProvider;
  }): Promise<IcalSubscription> {
    const u = await uid();
    const { data, error } = await supabase
      .from("ical_subscriptions")
      .insert({
        user_id: u,
        label: input.label.trim() || "Pronote",
        url: input.url.trim(),
        provider: input.provider ?? "pronote",
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as IcalSubscription;
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("ical_subscriptions").delete().eq("id", id);
    if (error) throw error;
  }

  async toggleActive(id: string, is_active: boolean): Promise<void> {
    const { error } = await supabase
      .from("ical_subscriptions")
      .update({ is_active })
      .eq("id", id);
    if (error) throw error;
  }

  /** Lance la sync : si `subscriptionId` est fourni, ne sync que celui-là, sinon tous ceux du user. */
  async sync(subscriptionId?: string): Promise<IcalSyncResult> {
    const { data, error } = await supabase.functions.invoke("ical-sync", {
      body: subscriptionId ? { subscription_id: subscriptionId } : {},
    });
    if (error) throw error;
    return data as IcalSyncResult;
  }
}

export const icalSubscriptionsService = new IcalSubscriptionsService();