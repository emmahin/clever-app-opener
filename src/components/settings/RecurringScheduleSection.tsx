import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Wand2, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsProvider";
import { recurringScheduleService, DAY_LABELS_FR, type RecurringRule } from "@/services/recurringScheduleService";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gère l'emploi du temps récurrent (cours, sport hebdo, etc.)
 * + zone scolaire pour ignorer les vacances françaises
 * + bouton pour générer/regénérer manuellement les 7 jours à venir.
 */
export function RecurringScheduleSection() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [zone, setZone] = useState<"none" | "A" | "B" | "C">("none");
  const [autofillBusy, setAutofillBusy] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
    location: "",
    skip_school_holidays: true,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, settingsRes] = await Promise.all([
        recurringScheduleService.list(),
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (!user) return null;
          const { data } = await supabase
            .from("user_settings")
            .select("school_zone")
            .eq("user_id", user.id)
            .maybeSingle();
          return data;
        }),
      ]);
      setRules(list);
      const z = (settingsRes?.school_zone ?? "none") as "none" | "A" | "B" | "C";
      setZone(z);
    } catch (e: any) {
      toast.error(e?.message || "Impossible de charger l'emploi du temps");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const updateZone = async (newZone: "none" | "A" | "B" | "C") => {
    setZone(newZone);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("user_settings")
        .update({ school_zone: newZone })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Zone scolaire mise à jour");
    } catch (e: any) {
      toast.error(e?.message || "Échec");
    }
  };

  const addRule = async () => {
    if (!draft.title.trim()) {
      toast.error("Donne un titre au créneau");
      return;
    }
    try {
      await recurringScheduleService.add({
        title: draft.title.trim(),
        day_of_week: draft.day_of_week,
        start_time: draft.start_time + ":00",
        end_time: draft.end_time ? draft.end_time + ":00" : undefined,
        location: draft.location || undefined,
        skip_school_holidays: draft.skip_school_holidays,
      });
      setDraft({ title: "", day_of_week: 1, start_time: "08:00", end_time: "09:00", location: "", skip_school_holidays: true });
      await refresh();
      // Génère tout de suite pour les 7 jours à venir
      try {
        const r = await recurringScheduleService.runAutofill(7);
        toast.success(`Créneau ajouté · ${r.inserted} event(s) générés`);
      } catch {
        toast.success("Créneau ajouté");
      }
    } catch (e: any) {
      toast.error(e?.message || "Échec");
    }
  };

  const removeRule = async (id: string) => {
    try {
      await recurringScheduleService.remove(id);
      setRules((r) => r.filter((x) => x.id !== id));
      toast.success("Créneau supprimé");
    } catch (e: any) {
      toast.error(e?.message || "Échec");
    }
  };

  const runAutofillNow = async () => {
    setAutofillBusy(true);
    try {
      const r = await recurringScheduleService.runAutofill(7);
      toast.success(`${r.inserted} event(s) ajouté(s) · ${r.skipped} déjà présent(s)`);
    } catch (e: any) {
      toast.error(e?.message || "Échec");
    } finally {
      setAutofillBusy(false);
    }
  };

  const fmtTime = (t: string) => t.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Zone scolaire */}
      <div>
        <label className="text-sm font-medium block mb-2">Zone des vacances scolaires (France)</label>
        <div className="grid grid-cols-4 gap-2">
          {(["none", "A", "B", "C"] as const).map((z) => (
            <button
              key={z}
              onClick={() => updateZone(z)}
              className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                zone === z
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/60 bg-secondary/40 hover:bg-secondary text-muted-foreground"
              }`}
            >
              {z === "none" ? "Aucune" : `Zone ${z}`}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Si tu choisis une zone, l'IA ne te programmera pas tes cours pendant les vacances ni les jours fériés.
        </p>
      </div>

      {/* Ajouter un créneau */}
      <div className="space-y-2 border-t border-border/40 pt-4">
        <label className="text-sm font-medium block">Ajouter un créneau récurrent</label>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_100px_100px] gap-2">
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Ex : Cours de maths"
          />
          <select
            value={draft.day_of_week}
            onChange={(e) => setDraft({ ...draft, day_of_week: parseInt(e.target.value, 10) })}
            className="px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
          >
            {DAY_LABELS_FR.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
          <Input
            type="time"
            value={draft.start_time}
            onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
          />
          <Input
            type="time"
            value={draft.end_time}
            onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
          <Input
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            placeholder="Lieu (optionnel)"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground px-2">
            <input
              type="checkbox"
              checked={draft.skip_school_holidays}
              onChange={(e) => setDraft({ ...draft, skip_school_holidays: e.target.checked })}
              className="accent-primary"
            />
            Sauter vacances
          </label>
        </div>
        <Button onClick={addRule} className="w-full md:w-auto">
          <Plus className="w-4 h-4 mr-1" /> Ajouter le créneau
        </Button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : rules.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border/60 rounded-lg">
          Aucun créneau récurrent. Ajoute-en un, ou dis-le à ton double pendant un appel vocal :
          <br />« j'ai cours de maths tous les lundis de 8h à 10h ».
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {rules.length} créneau{rules.length > 1 ? "x" : ""}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runAutofillNow}
              disabled={autofillBusy}
            >
              {autofillBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
              Générer 7 jours
            </Button>
          </div>
          <ul className="space-y-1.5">
            {rules.map((r) => (
              <li key={r.id} className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/40 hover:bg-secondary/60 border border-border/40">
                <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {DAY_LABELS_FR[r.day_of_week]} · {fmtTime(r.start_time)}
                    {r.end_time ? `–${fmtTime(r.end_time)}` : ""}
                    {r.location ? ` · ${r.location}` : ""}
                    {r.skip_school_holidays && zone !== "none" ? ` · sauf vacances zone ${zone}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => removeRule(r.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/15 text-destructive transition"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">
        L'IA génère automatiquement chaque jour les événements des 7 prochains jours à partir de ces règles.
      </p>
    </div>
  );
}