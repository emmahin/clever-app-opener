import { supabase } from "@/integrations/supabase/client";

export interface CloudPrefs {
  detail_level: string;
  typewriter: boolean;
  custom_instructions: string;
  ai_name: string;
  language: string;
  notification_prefs: Record<string, unknown>;
}

const MIGRATION_FLAG = "__migrated_to_cloud_v1";

export async function loadPrefs(userId: string): Promise<CloudPrefs | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("loadPrefs error", error);
    return null;
  }
  return data as CloudPrefs | null;
}

export async function savePrefs(userId: string, patch: Partial<CloudPrefs>): Promise<void> {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) console.warn("savePrefs error", error);
}

/** One-shot migration: localStorage -> cloud. Idempotent via flag. */
export async function migrateLocalToCloudOnce(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG) === "1") return;

  try {
    const raw = localStorage.getItem("app.settings.v1");
    if (raw) {
      const local = JSON.parse(raw);
      await savePrefs(userId, {
        detail_level: local.detailLevel ?? "normal",
        typewriter: local.typewriter ?? true,
        custom_instructions: local.customInstructions ?? "",
        ai_name: local.aiName ?? "Nex",
      });
    }
  } catch (e) {
    console.warn("migration error", e);
  } finally {
    localStorage.setItem(MIGRATION_FLAG, "1");
  }
}
