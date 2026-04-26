/**
 * Google Calendar service (front).
 *
 * 🔄 MIGRATION FUTURE :
 * Si on bascule sur le connecteur Lovable un jour, seules les edge functions
 * `gcal-oauth-start`, `gcal-oauth-callback` et la table `google_oauth_tokens`
 * disparaissent. L'API publique de ce service (connect/disconnect/sync) reste
 * identique → l'UI ne change pas.
 */
import { supabase } from "@/integrations/supabase/client";

export interface GCalStatus {
  connected: boolean;
  google_email?: string | null;
  scope?: string;
  updated_at?: string;
}

export interface GCalSyncResult {
  imported: number;
  updated: number;
  total: number;
}

class GoogleCalendarService {
  async getStatus(): Promise<GCalStatus> {
    const { data, error } = await supabase.functions.invoke("gcal-sync", {
      body: { action: "status" },
    });
    if (error) throw error;
    return data as GCalStatus;
  }

  /** Lance le flow OAuth — redirige le navigateur vers Google. */
  async connect(): Promise<void> {
    const { data, error } = await supabase.functions.invoke("gcal-oauth-start", {
      body: { origin: window.location.origin },
    });
    if (error) throw error;
    if (!data?.authUrl) throw new Error("Pas d'URL d'autorisation reçue");
    window.location.href = data.authUrl as string;
  }

  async disconnect(): Promise<void> {
    const { error } = await supabase.functions.invoke("gcal-sync", {
      body: { action: "disconnect" },
    });
    if (error) throw error;
  }

  async pushEvent(eventId: string): Promise<{ google_event_id: string }> {
    const { data, error } = await supabase.functions.invoke("gcal-sync", {
      body: { action: "push", event_id: eventId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async pull(): Promise<GCalSyncResult> {
    const { data, error } = await supabase.functions.invoke("gcal-sync", {
      body: { action: "pull" },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }
}

export const googleCalendarService = new GoogleCalendarService();