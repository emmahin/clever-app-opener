import { useEffect, useState } from "react";
import { n8nService, type N8nConfig, type N8nAction } from "@/services";
import { Loader2, Check, AlertTriangle, Eye, EyeOff, Plus, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";

type TestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; status?: number }
  | { kind: "error"; message: string };

export function N8nSection() {
  const [cfg, setCfg] = useState<N8nConfig>(() => n8nService.loadConfig());
  const [showToken, setShowToken] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  useEffect(() => {
    n8nService.saveConfig(cfg);
  }, [cfg]);

  const updateAction = (i: number, patch: Partial<N8nAction>) => {
    setCfg({
      ...cfg,
      actions: cfg.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    });
  };

  const addAction = () => {
    setCfg({
      ...cfg,
      actions: [...cfg.actions, { id: "", description: "" }],
    });
  };

  const removeAction = (i: number) => {
    setCfg({ ...cfg, actions: cfg.actions.filter((_, idx) => idx !== i) });
  };

  const runTest = async () => {
    setTest({ kind: "loading" });
    n8nService.saveConfig(cfg);
    const r = await n8nService.ping();
    if (r.ok) {
      setTest({ kind: "ok", status: r.status });
      toast.success("Webhook n8n joignable ✅");
    } else {
      setTest({ kind: "error", message: r.detail || "Erreur inconnue" });
      toast.error(r.detail || "n8n injoignable");
    }
  };

  return (
    <div className="space-y-5" translate="no">
      <div className="rounded-lg bg-secondary/40 border border-border/60 p-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connecte un <strong className="text-foreground">webhook n8n unique</strong> qui reçoit{" "}
          <code>{`{ action, params }`}</code>. Côté n8n, utilise un nœud{" "}
          <strong className="text-foreground">Switch</strong> sur <code>$json.action</code> pour router
          vers le bon workflow. L'IA déclenchera l'action correspondante quand sa description
          correspond à ta demande.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-2">
          ⚠️ Si n8n tourne en <strong>local</strong> (<code>localhost:5678</code>), ton PC doit être
          allumé et le navigateur doit pouvoir l'atteindre.
        </p>
      </div>

      <ToggleRow
        label="Activer n8n"
        description="Quand actif, l'IA peut déclencher les actions listées ci-dessous."
        checked={cfg.enabled}
        onChange={(v) => setCfg({ ...cfg, enabled: v })}
      />

      <div>
        <label className="text-sm font-medium block mb-2">URL du webhook</label>
        <input
          type="text"
          value={cfg.webhookUrl}
          onChange={(e) => setCfg({ ...cfg, webhookUrl: e.target.value })}
          placeholder="http://localhost:5678/webhook/nex"
          spellCheck={false}
          className="w-full px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-sm font-mono focus:outline-none focus:border-primary"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Crée un nœud <strong>Webhook</strong> (POST) dans n8n et colle son URL ici.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium block mb-2">
          Token (optionnel) <span className="text-muted-foreground font-normal">— envoyé en Bearer</span>
        </label>
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            value={cfg.token}
            onChange={(e) => setCfg({ ...cfg, token: e.target.value })}
            placeholder="laisser vide si pas d'auth"
            spellCheck={false}
            autoComplete="off"
            className="w-full px-3 py-2 pr-10 rounded-lg bg-secondary/40 border border-border/60 text-sm font-mono focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setShowToken((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label={showToken ? "Masquer" : "Afficher"}
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={runTest}
          disabled={!cfg.webhookUrl || test.kind === "loading"}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
        >
          {test.kind === "loading" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Test en cours…
            </>
          ) : (
            "Tester le webhook"
          )}
        </button>
        {test.kind === "ok" && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium">
            <Check className="w-3.5 h-3.5" />
            Joignable{test.status ? ` · ${test.status}` : ""}
          </div>
        )}
        {test.kind === "error" && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-medium max-w-full">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{test.message}</span>
          </div>
        )}
      </div>

      {/* Actions disponibles */}
      <div className="rounded-lg bg-secondary/30 border border-border/40 p-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-medium flex items-center gap-2">
              <Workflow className="w-4 h-4 text-primary" />
              Actions disponibles
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Décris chaque workflow en français. L'IA choisit l'action selon la description.
            </p>
          </div>
          <button
            type="button"
            onClick={addAction}
            className="px-3 py-2 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </button>
        </div>

        {cfg.actions.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Aucune action déclarée. Sans action, l'IA ne déclenchera jamais n8n.
          </p>
        )}

        <div className="space-y-2">
          {cfg.actions.map((a, i) => (
            <div key={i} className="rounded-md border border-border/40 bg-background/40 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={a.id}
                  onChange={(e) => updateAction(i, { id: e.target.value })}
                  placeholder="action_id (ex: add_expense)"
                  spellCheck={false}
                  className="flex-1 px-2.5 py-1.5 rounded-md bg-secondary/60 border border-border/40 text-xs font-mono focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => removeAction(i)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={a.description}
                onChange={(e) => updateAction(i, { description: e.target.value })}
                placeholder="Description claire de ce que fait ce workflow (ex: « Ajoute une ligne dans mon Google Sheet de dépenses avec montant et catégorie »)"
                rows={2}
                className="w-full px-2.5 py-1.5 rounded-md bg-secondary/60 border border-border/40 text-xs focus:outline-none focus:border-primary resize-y"
              />
            </div>
          ))}
        </div>
      </div>

      <details className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-3 border border-border/40">
        <summary className="cursor-pointer font-medium text-foreground">Comment configurer côté n8n ?</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1.5 leading-relaxed">
          <li>Crée un workflow avec un nœud <strong>Webhook</strong> (méthode POST).</li>
          <li>Copie l'URL du webhook et colle-la ci-dessus.</li>
          <li>Ajoute un nœud <strong>Switch</strong> sur <code>{`{{ $json.body.action }}`}</code>.</li>
          <li>Pour chaque action déclarée ici, branche une route qui exécute ton workflow.</li>
          <li>Active le workflow (toggle en haut à droite de n8n).</li>
        </ol>
      </details>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
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
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? "bg-primary" : "bg-secondary"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
