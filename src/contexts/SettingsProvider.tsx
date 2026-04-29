import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadPrefs, savePrefs, migrateLocalToCloudOnce } from "@/services/userPreferencesService";

export const AI_NAME = "Nex";

export type DetailLevel = "short" | "normal" | "detailed";

export interface Settings {
  detailLevel: DetailLevel;
  typewriter: boolean;
  customInstructions: string;
  /** Si vrai, ouvre automatiquement le mode vocal au lancement de l'app. */
  autoOpenVoice: boolean;
  readonly aiName: string;
}

const DEFAULTS: Settings = {
  detailLevel: "normal",
  typewriter: true,
  customInstructions: "",
  autoOpenVoice: false,
  aiName: AI_NAME,
};

const STORAGE_KEY = "app.settings.v1";

type Ctx = {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
};

const SettingsContext = createContext<Ctx | null>(null);

function loadLocal(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw), aiName: AI_NAME };
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadLocal);
  const userIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror to localStorage (offline fallback)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
  }, [settings]);

  // Sync with cloud when auth state changes
  useEffect(() => {
    let active = true;

    const hydrate = async (uid: string) => {
      await migrateLocalToCloudOnce(uid);
      const cloud = await loadPrefs(uid);
      if (!active || !cloud) return;
      setSettings({
        detailLevel: (cloud.detail_level as DetailLevel) ?? "normal",
        typewriter: cloud.typewriter ?? true,
        customInstructions: cloud.custom_instructions ?? "",
        // autoOpenVoice reste local (pas de colonne cloud) → on garde la valeur courante.
        autoOpenVoice: loadLocal().autoOpenVoice,
        aiName: AI_NAME,
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      userIdRef.current = uid;
      if (uid) hydrate(uid);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      userIdRef.current = uid;
      if (uid) hydrate(uid);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      // Debounced cloud save
      if (userIdRef.current) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          savePrefs(userIdRef.current!, {
            detail_level: next.detailLevel,
            typewriter: next.typewriter,
            custom_instructions: next.customInstructions,
            ai_name: next.aiName,
          });
        }, 500);
      }
      return next;
    });
  };

  const reset = () => {
    setSettings(DEFAULTS);
    if (userIdRef.current) {
      savePrefs(userIdRef.current, {
        detail_level: DEFAULTS.detailLevel,
        typewriter: DEFAULTS.typewriter,
        custom_instructions: DEFAULTS.customInstructions,
        ai_name: DEFAULTS.aiName,
      });
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
