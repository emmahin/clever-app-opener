import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Prefs = {
  agenda_reminders: boolean;
  ai_suggestions: boolean;
  quiet_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
};

const DEFAULT: Prefs = {
  agenda_reminders: true,
  ai_suggestions: true,
  quiet_enabled: false,
  quiet_start: 22,
  quiet_end: 8,
};

export function ProactivePreferencesCard() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      const { data } = await supabase
        .from("user_settings")
        .select("proactive_prefs")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (data?.proactive_prefs) setPrefs({ ...DEFAULT, ...(data.proactive_prefs as any) });
      setLoading(false);
    })();
  }, []);

  const save = async (next: Prefs) => {
    setPrefs(next);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("user_settings")
      .update({ proactive_prefs: next as any })
      .eq("user_id", u.user.id);
    if (error) toast.error("Erreur d'enregistrement");
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Chargement...</div>;
  }

  return (
    <div className="space-y-4">
      <Toggle
        label="Rappels d'agenda automatiques"
        description="Nex te rappelle tes events avec un timing intelligent (lieu, type, durée)."
        checked={prefs.agenda_reminders}
        onChange={(v) => save({ ...prefs, agenda_reminders: v })}
      />
      <Toggle
        label="Suggestions proactives de Nex"
        description="Nex peut t'envoyer une suggestion utile (au plus 1 toutes les 4h)."
        checked={prefs.ai_suggestions}
        onChange={(v) => save({ ...prefs, ai_suggestions: v })}
      />
      <div>
        <Toggle
          label="Mode silencieux"
          description="Aucune notif système pendant cette plage."
          checked={prefs.quiet_enabled}
          onChange={(v) => save({ ...prefs, quiet_enabled: v })}
        />
        <div className={`mt-2 flex items-center gap-3 text-sm ${prefs.quiet_enabled ? "" : "opacity-50 pointer-events-none"}`}>
          <span className="text-muted-foreground">De</span>
          <select
            value={prefs.quiet_start}
            onChange={(e) => save({ ...prefs, quiet_start: parseInt(e.target.value, 10) })}
            className="px-2 py-1.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
          >
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}h</option>)}
          </select>
          <span className="text-muted-foreground">à</span>
          <select
            value={prefs.quiet_end}
            onChange={(e) => save({ ...prefs, quiet_end: parseInt(e.target.value, 10) })}
            className="px-2 py-1.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
          >
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}h</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-primary" : "bg-secondary"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}