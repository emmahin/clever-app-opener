import { Monitor, Loader2, Check, AlertTriangle, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { localAgentService } from "@/services";

interface Props {
  target: string;
  args?: string[];
  label?: string;
}

type Status = "idle" | "launching" | "ok" | "error" | "not-configured";

/**
 * Widget affiché quand l'IA demande "lance l'app X sur le PC".
 * Tente d'ouvrir AUTOMATIQUEMENT via l'agent local si configuré.
 * Sinon, affiche un message guidant l'utilisateur vers les Paramètres.
 */
export function LocalAppLaunchWidget({ target, args, label }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [detail, setDetail] = useState<string>("");
  const triedRef = useRef(false);

  const displayName = label || target;

  const launch = async () => {
    if (!localAgentService.isConfigured()) {
      setStatus("not-configured");
      return;
    }
    setStatus("launching");
    setDetail("");
    const r = await localAgentService.launch(target, args || []);
    if (r.ok) {
      setStatus("ok");
      setDetail(r.target ? `via ${r.method || "agent"}` : "");
    } else {
      setStatus("error");
      setDetail(r.detail || "Erreur inconnue");
    }
  };

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;
    launch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Monitor className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{displayName}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            App PC · {target}
            {args && args.length > 0 ? ` ${args.join(" ")}` : ""}
          </div>
        </div>
        <StatusBadge status={status} onRetry={launch} />
      </div>

      {status === "error" && detail && (
        <p className="text-[11px] text-destructive/80 mt-2 leading-relaxed">
          ⚠️ {detail}
        </p>
      )}

      {status === "not-configured" && (
        <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
          L'agent local n'est pas configuré. Ouvre{" "}
          <a
            href="/settings"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Paramètres → Agent local PC
            <ExternalLink className="w-2.5 h-2.5" />
          </a>{" "}
          pour activer le contrôle des applications de ton ordinateur.
        </div>
      )}

      {status === "ok" && (
        <p className="text-[10px] text-emerald-400/80 mt-2">
          Lancé sur ton PC{detail ? ` · ${detail}` : ""}.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status === "launching") {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Lancement…
      </div>
    );
  }
  if (status === "ok") {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium">
        <Check className="w-3.5 h-3.5" />
        Lancé
      </div>
    );
  }
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-medium hover:bg-destructive/25 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Réessayer
      </button>
    );
  }
  if (status === "not-configured") {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        Non configuré
      </div>
    );
  }
  return null;
}