import { supabase } from "@/integrations/supabase/client";

export interface ElevenLabsUsage {
  tier: string;
  status: string;
  character_count: number;
  character_limit: number;
  remaining: number;
  percent_used: number;
  next_character_count_reset_unix: number | null;
  currency: string | null;
  can_extend_character_limit: boolean;
  allowed_to_extend_character_limit: boolean;
  fetched_at: string;
}

export async function fetchElevenLabsUsage(): Promise<ElevenLabsUsage> {
  // On utilise fetch direct pour récupérer le vrai message d'erreur HTTP
  // (supabase.functions.invoke masque les erreurs non-2xx derrière "Failed to send a request to the Edge Function").
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-usage`;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${accessToken ?? anonKey}`,
    },
    body: "{}",
  });

  const text = await resp.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* not json */ }

  if (!resp.ok) {
    const errMsg =
      (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)
        ? String((parsed as Record<string, unknown>).error)
        : text) || `HTTP ${resp.status}`;
    // Cas fréquent : la clé ElevenLabs n'a pas la permission user_read.
    if (/missing_permissions|user_read/i.test(errMsg)) {
      throw new Error(
        "Clé ElevenLabs sans permission « User → Read ». Régénérez la clé sur elevenlabs.io en activant cette permission, puis mettez à jour le secret.",
      );
    }
    throw new Error(errMsg);
  }

  return parsed as ElevenLabsUsage;
}