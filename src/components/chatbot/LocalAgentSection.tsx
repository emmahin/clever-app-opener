import { useEffect, useMemo, useState } from "react";
import { localAgentService, type LocalAgentConfig, type DetectedApp } from "@/services";
import { Loader2, Check, AlertTriangle, Eye, EyeOff, Download, Search, RefreshCw, Play } from "lucide-react";
import { toast } from "sonner";

type TestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; platform?: string; allowlist?: boolean }
  | { kind: "error"; message: string };

export function LocalAgentSection() {
  const [cfg, setCfg] = useState<LocalAgentConfig>(() => localAgentService.loadConfig());
  const [showToken, setShowToken] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [apps, setApps] = useState<DetectedApp[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    localAgentService.saveConfig(cfg);
  }, [cfg]);

  const runTest = async () => {
    setTest({ kind: "loading" });
    // S'assure que la config courante est bien sauvegardée avant le test
    localAgentService.saveConfig(cfg);
    try {
      const res = await localAgentService.ping();
      setTest({
        kind: "ok",
        platform: res.platform,
        allowlist: res.allowlist_active,
      });
      toast.success("Agent local joignable ✅");
    } catch (e: any) {
      setTest({ kind: "error", message: e?.message || "Erreur inconnue" });
      toast.error(e?.message || "Agent local injoignable");
    }
  };

  const downloadAgent = () => {
    fetch("/nex-local-agent.zip")
      .then((r) => {
        if (!r.ok) throw new Error(`Téléchargement impossible (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "nex-local-agent.zip";
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success("Agent téléchargé — décompresse et lance START_WINDOWS.bat");
      })
      .catch((e) => toast.error(e.message));
  };

  const scanApps = async () => {
    localAgentService.saveConfig(cfg);
    setScanning(true);
    setScanError(null);
    try {
      const res = await localAgentService.listApps();
      setApps(res.apps);
      toast.success(`${res.count} application(s) détectée(s)`);
    } catch (e: any) {
      const msg = e?.message || "Échec du scan";
      setScanError(msg);
      toast.error(msg);
    } finally {
      setScanning(false);
    }
  };

  const launchApp = async (app: DetectedApp) => {
    const r = await localAgentService.launch(app.path);
    if (r.ok) toast.success(`Lancé : ${app.name}`);
    else toast.error(r.detail || "Échec du lancement");
  };

  const filteredApps = useMemo(() => {
    if (!apps) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) => a.name.toLowerCase().includes(q));
  }, [apps, filter]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-secondary/40 border border-border/60 p-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Permet à l'IA d'<strong className="text-foreground">ouvrir n'importe quelle application
          installée sur ton PC</strong> (Notepad, Spotify, VS Code, dossiers…). Tu dois lancer
          le petit agent Python sur ton ordinateur (télécharge-le ci-dessous),
          puis coller ici son URL et le token que tu as choisi.
        </p>
        <button
          type="button"
          onClick={downloadAgent}
          className="mt-3 px-3 py-2 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors flex items-center gap-2"
        >
          <Download className="w-3.5 h-3.5" />
          Télécharger l'agent (ZIP)
        </button>
      </div>

      <ToggleRow
        label="Activer l'agent local"
        description="Quand actif, l'IA peut lancer des apps via l'agent. Désactive pour bloquer."
        checked={cfg.enabled}
        onChange={(v) => setCfg({ ...cfg, enabled: v })}
      />

      <div>
        <label className="text-sm font-medium block mb-2">URL de l'agent</label>
        <input
          type="text"
          value={cfg.url}
          onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
          placeholder="http://127.0.0.1:17345"
          spellCheck={false}
          className="w-full px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-sm font-mono focus:outline-none focus:border-primary"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Par défaut <code>http://127.0.0.1:17345</code>. Ne mets pas de slash final.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium block mb-2">Token Bearer</label>
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            value={cfg.token}
            onChange={(e) => setCfg({ ...cfg, token: e.target.value })}
            placeholder="le token défini dans NEX_AGENT_TOKEN"
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
        <p className="text-xs text-muted-foreground mt-1.5">
          Stocké uniquement dans le navigateur (localStorage). Ne le partage jamais.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={runTest}
          disabled={!cfg.url || !cfg.token || test.kind === "loading"}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
        >
          {test.kind === "loading" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Test en cours…
            </>
          ) : (
            "Tester la connexion"
          )}
        </button>

        {test.kind === "ok" && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium">
            <Check className="w-3.5 h-3.5" />
            Connecté
            {test.platform ? ` · ${test.platform}` : ""}
            {test.allowlist ? " · allowlist active" : ""}
          </div>
        )}

        {test.kind === "error" && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-medium max-w-full">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{test.message}</span>
          </div>
        )}
      </div>

      {/* Scan des applications installées */}
      <div className="rounded-lg bg-secondary/30 border border-border/40 p-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-medium">Applications détectées</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Scan du Menu Démarrer, Bureau, Program Files, LocalAppData, Téléchargements et bibliothèques de jeux.
            </p>
          </div>
          <button
            type="button"
            onClick={scanApps}
            disabled={!cfg.url || !cfg.token || scanning}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
          >
            {scanning ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scan en cours…</>
            ) : apps ? (
              <><RefreshCw className="w-3.5 h-3.5" /> Re-scanner</>
            ) : (
              <><Search className="w-3.5 h-3.5" /> Scanner mes applications</>
            )}
          </button>
        </div>

        {scanError && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-destructive/15 text-destructive text-xs">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{scanError}</span>
          </div>
        )}

        {apps && apps.length > 0 && (
          <>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filtrer parmi ${apps.length} apps…`}
                className="w-full pl-8 pr-3 py-1.5 rounded-md bg-background/60 border border-border/60 text-xs focus:outline-none focus:border-primary"
              />
            </div>
            <div
              className="max-h-72 overflow-y-auto rounded-md border border-border/40 divide-y divide-border/30"
              translate="no"
            >
              {filteredApps.slice(0, 300).map((app) => (
                <div
                  key={app.path}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      <span>{app.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate font-mono">
                      <span>{app.path}</span>
                    </div>
                  </div>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                    <span>{app.source}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => launchApp(app)}
                    className="p-1.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                    aria-label={`Lancer ${app.name}`}
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {filteredApps.length > 300 && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">
                  <span>… {filteredApps.length - 300} résultat(s) supplémentaire(s) — affine le filtre.</span>
                </div>
              )}
              {filteredApps.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  <span>Aucun résultat pour « {filter} ».</span>
                </div>
              )}
            </div>
          </>
        )}

        {apps && apps.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Aucune application détectée. Vérifie que l'agent tourne bien sur ton PC Windows.
          </p>
        )}
      </div>

      <details className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-3 border border-border/40">
        <summary className="cursor-pointer font-medium text-foreground">
          Comment lancer l'agent ?
        </summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1.5 leading-relaxed">
          <li>
            Dans le dossier <code className="text-primary">local-agent/</code> du projet :{" "}
            <code>pip install -r requirements.txt</code>
          </li>
          <li>
            Génère un token : <code>python -c "import secrets; print(secrets.token_urlsafe(32))"</code>
          </li>
          <li>
            Lance l'agent (Windows PowerShell) :
            <pre className="bg-background/60 p-2 rounded mt-1 overflow-x-auto text-[10px]">{`$env:NEX_AGENT_TOKEN="ton_token"
python agent.py`}</pre>
          </li>
          <li>Colle le même token ci-dessus, active, puis clique sur Tester.</li>
          <li>Demande à l'IA : « <em>Ouvre Notepad</em> » 🎉</li>
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