import { useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, Loader2, Link2, AlertCircle, CheckCircle2, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import {
  icalSubscriptionsService,
  IcalSubscription,
} from "@/services/icalSubscriptionsService";

export function IcalSubscriptionsSection() {
  const [subs, setSubs] = useState<IcalSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setSubs(await icalSubscriptionsService.list());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onAdd = async () => {
    if (!url.trim().startsWith("http")) {
      toast.error("Colle une URL iCal valide (commence par https://).");
      return;
    }
    setSubmitting(true);
    try {
      const sub = await icalSubscriptionsService.add({
        label: label.trim() || "Pronote",
        url: url.trim(),
        provider: "pronote",
      });
      toast.success("Calendrier ajouté. Synchronisation en cours…");
      setAdding(false);
      setLabel("");
      setUrl("");
      await refresh();
      // Sync auto immédiate
      onSync(sub.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onRemove = async (id: string) => {
    if (!confirm("Supprimer cet abonnement et tous ses événements importés ?")) return;
    try {
      await icalSubscriptionsService.remove(id);
      toast.success("Supprimé.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onSync = async (id: string) => {
    setSyncingId(id);
    try {
      const res = await icalSubscriptionsService.sync(id);
      const r = res.results?.[0];
      if (r?.ok) {
        toast.success(
          `Sync OK : ${r.inserted ?? 0} ajouté(s), ${r.updated ?? 0} mis à jour, ${r.total ?? 0} évén. au total.`,
        );
      } else {
        toast.error(r?.error ?? "Échec de la synchronisation.");
      }
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : subs.length === 0 ? (
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Aucun calendrier connecté. Pour Pronote : <span className="font-medium text-foreground">Mes données → Mon compte → ⋯ → Récupérer un lien iCal</span>, copie l'URL et colle-la ci-dessous.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {subs.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-3 px-3 py-3 rounded-lg bg-secondary/40 border border-border/60"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{s.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {s.provider} · {s.events_count} évén.
                  {s.last_synced_at && (
                    <> · sync {new Date(s.last_synced_at).toLocaleString()}</>
                  )}
                </div>
                {s.last_error ? (
                  <div className="mt-1 text-xs text-destructive flex items-start gap-1">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span className="break-all">{s.last_error}</span>
                  </div>
                ) : s.last_synced_at ? (
                  <div className="mt-1 text-xs text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> À jour
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onSync(s.id)}
                  disabled={syncingId === s.id}
                  className="p-2 rounded-lg hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                  title="Synchroniser maintenant"
                >
                  {syncingId === s.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => onRemove(s.id)}
                  className="p-2 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="px-4 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Ajouter un calendrier iCal
        </button>
      ) : (
        <div className="space-y-2 p-3 rounded-lg border border-border/60 bg-secondary/30">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Libellé
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Pronote"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border/60 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" /> URL iCal
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://….index-education.net/pronote/ical/…"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border/60 text-sm focus:outline-none focus:border-primary font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Le lien est privé : il identifie ton compte. Stocké uniquement pour toi.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                setAdding(false);
                setLabel("");
                setUrl("");
              }}
              className="px-3 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={onAdd}
              disabled={submitting || !url.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Ajouter et synchroniser
            </button>
          </div>
        </div>
      )}
    </div>
  );
}