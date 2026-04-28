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
  const { data, error } = await supabase.functions.invoke("elevenlabs-usage", {
    body: {},
  });
  if (error) throw error;
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    throw new Error(String((data as Record<string, unknown>).error));
  }
  return data as ElevenLabsUsage;
}