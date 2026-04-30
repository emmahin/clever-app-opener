import { Monitor, Loader2, Check, AlertTriangle, ExternalLink, Play } from "lucide-react";
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
  const [logs, setLogs] = useState<string[]>([]);
  const triedRef = useRef(false);
  // Usage unique : une fois cliqué, on n'autorise plus de nouveau lancement.
  const [used, setUsed] = useState(false);

  const displayName = label || target;

  const addLog = (line: string) => {
    const stamped = `${new Date().toLocaleTimeString()} · ${line}`;
    console.debug("[nex:local-app-widget]", { line, target, args, label, status });
    setLogs((prev) => [...prev.slice(-5), stamped]);
  };

  const launch = async () => {
    if (used) {
      addLog("Tentative bloquée : ce widget est à usage unique.");
      return;
    }
    addLog(`Demande d'ouverture reçue: ${displayName}`);
    if (!localAgentService.isConfigured()) {
      addLog("Agent local non configuré: affichage du panneau de configuration.");
      setStatus("not-configured");
      return;
    }
    setStatus("launching");
    setDetail("");
    setUsed(true);
    addLog(`Envoi à l'agent local: target=${target}${args?.length ? ` args=${args.join(" ")}` : ""}`);
    const r = await localAgentService.launch(target, args || []);
    addLog(`Réponse agent: ok=${r.ok} method=${r.method || "n/a"} target=${r.target || "n/a"} detail=${r.detail || "n/a"}`);
    if (r.ok) {
      setStatus("ok");
      setDetail(r.target ? `via ${r.method || "agent"}` : "");
    } else {
      setStatus("error");
      setDetail(r.detail || "Erreur inconnue");
    }
  };

  // Plus d'auto-lancement : usage unique, déclenché par clic utilisateur.

  // Mode compact : si tout va bien (lancement réussi ou en cours), on affiche
  // juste une petite ligne discrète. Le panneau complet n'apparaît qu'en cas
  // d'erreur ou si l'agent local n'est pas configuré.
  if (status === "ok" || status === "launching") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-border/40 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground">
        {status === "launching" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        )}
        <span className="truncate">
          {status === "launching" ? `Ouverture de ${displayName}…` : `${displayName} lancé sur ton PC`}
        </span>
      </div>
    );
  }

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
        {status === "idle" && !used ? (
          <button
            type="button"
            onClick={launch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Play className="w-3.5 h-3.5" />
            Lancer
          </button>
        ) : (
          <StatusBadge status={status} onRetry={launch} used={used} />
        )}
      </div>

      {status === "error" && !used && (
        <button
          type="button"
          onClick={launch}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Play className="h-3.5 w-3.5" />
          Réessayer
        </button>
      )}

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

      {status === "error" && logs.length > 0 && (
        <div className="mt-3 rounded-lg border border-border/40 bg-secondary/30 px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Logs ouverture app
          </div>
          <div className="space-y-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {logs.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, onRetry, used }: { status: Status; onRetry: () => void; used?: boolean }) {
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
    if (used) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-medium">
          <AlertTriangle className="w-3.5 h-3.5" />
          Échec
        </div>
      );
    }
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