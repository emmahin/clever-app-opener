import { useEffect, useRef, useState } from "react";
import { Workflow, Loader2, Check, AlertTriangle, ExternalLink } from "lucide-react";
import { n8nService } from "@/services";

interface Props {
  action: string;
  params?: Record<string, unknown>;
  label?: string;
}

type Status = "idle" | "running" | "ok" | "error" | "not-configured";

/**
 * Widget chat : déclenche le webhook n8n configuré quand l'IA appelle l'outil.
 * Comme LocalAppLaunchWidget : l'appel est lancé automatiquement côté navigateur.
 */
export function N8nTriggerWidget({ action, params, label }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [detail, setDetail] = useState<string>("");
  const triedRef = useRef(false);

  const display = label || action;

  const run = async () => {
    if (!n8nService.isConfigured()) {
      setStatus("not-configured");
      return;
    }
    setStatus("running");
    setDetail("");
    const r = await n8nService.trigger(action, params || {});
    if (r.ok) {
      setStatus("ok");
      setDetail(r.status ? `n8n a répondu ${r.status}` : "");
    } else {
      setStatus("error");
      setDetail(r.detail || "Erreur inconnue");
    }
  };

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "ok" || status === "running") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-border/40 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground">
        {status === "running" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        )}
        <span className="truncate">
          {status === "running" ? `Workflow n8n « ${display} » en cours…` : `Workflow n8n « ${display} » déclenché`}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Workflow className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{display}</div>
          <div className="text-[11px] text-muted-foreground truncate">Workflow n8n · {action}</div>
        </div>
        {status === "error" && (
          <button
            type="button"
            onClick={run}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-medium hover:bg-destructive/25 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Réessayer
          </button>
        )}
        {status === "not-configured" && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            Non configuré
          </div>
        )}
      </div>
      {status === "error" && detail && (
        <p className="text-[11px] text-destructive/80 mt-2 leading-relaxed">⚠️ {detail}</p>
      )}
      {status === "not-configured" && (
        <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
          n8n n'est pas configuré. Ouvre{" "}
          <a href="/settings" className="text-primary hover:underline inline-flex items-center gap-0.5">
            Paramètres → n8n
            <ExternalLink className="w-2.5 h-2.5" />
          </a>{" "}
          pour ajouter ton webhook.
        </div>
      )}
    </div>
  );
}
