/**
 * Affiche les insights émotionnels hebdo générés automatiquement.
 * Permet à l'utilisateur de les marquer lus ou ignorés.
 */
import { useEffect, useState } from "react";
import { moodService, MoodInsight, InsightCategory } from "@/services/moodService";
import { Sparkles, Heart, AlertCircle, Lightbulb, X, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_META: Record<InsightCategory, { icon: typeof Sparkles; label: string; color: string }> = {
  pattern: { icon: Sparkles, label: "Tendance", color: "text-primary" },
  positive: { icon: Heart, label: "Positif", color: "text-green-400" },
  concern: { icon: AlertCircle, label: "À surveiller", color: "text-amber-400" },
  suggestion: { icon: Lightbulb, label: "Suggestion", color: "text-blue-400" },
};

export function InsightsSection() {
  const [insights, setInsights] = useState<MoodInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const reload = async () => {
    setLoading(true);
    const list = await moodService.listInsights(20);
    setInsights(list);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    const result = await moodService.generateWeeklyInsights();
    setGenerating(false);
    if (result.ok && result.insights && result.insights.length > 0) {
      toast.success(`${result.insights.length} insight(s) généré(s)`);
      reload();
    } else if (result.ok) {
      toast.info("Pas assez de données émotionnelles cette semaine — continue d'utiliser le chat.");
    } else {
      toast.error("Génération impossible pour le moment.");
    }
  };

  const handleDismiss = async (id: string) => {
    await moodService.dismiss(id);
    setInsights((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Tes humeurs sont analysées discrètement après chaque message. Une fois par semaine, tu reçois 1 à 3 insights.
        </p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Régénérer
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Chargement…</div>
      ) : insights.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
          Aucun insight pour le moment. Continue de discuter — tes patterns émotionnels apparaîtront ici.
        </div>
      ) : (
        <div className="space-y-2">
          {insights.map((ins) => {
            const meta = CATEGORY_META[ins.category] ?? CATEGORY_META.pattern;
            const Icon = meta.icon;
            return (
              <div
                key={ins.id}
                className="relative rounded-lg border border-border bg-card/40 p-3 pr-9"
                onMouseEnter={() => !ins.read_at && moodService.markRead(ins.id)}
              >
                <button
                  onClick={() => handleDismiss(ins.id)}
                  className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/5"
                  title="Ignorer"
                  aria-label="Ignorer cet insight"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                      {ins.themes.slice(0, 3).map((th) => (
                        <span key={th} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {th}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-foreground">{ins.insight}</p>
                    {ins.suggested_action && (
                      <p className="text-xs text-muted-foreground mt-1.5 italic">→ {ins.suggested_action}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}