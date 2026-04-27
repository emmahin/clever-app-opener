import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, RefreshCw, KeyRound } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type ProbeResult = {
  ok: boolean;
  status: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  modelTested?: string;
  keyUsed: string;
  keyLabel: string;
};

type ModelEntry = { id: string; created?: number; owned_by?: string };

type ModelsForKey = {
  keyName: string;
  keyLabel: string;
  keyPrefix: string;
  ok: boolean;
  status: number;
  error: string | null;
  total: number;
  all: string[];
  grouped: Record<string, ModelEntry[]>;
};

type DiagnosticsReport = {
  ok: true;
  meta: {
    durationMs: number;
    fetchedAt: string;
    keys: {
      chat:    { configured: boolean; prefix: string | null; label: string };
      whisper: { configured: boolean; prefix: string | null; label: string };
      tts:     { configured: boolean; prefix: string | null; label: string };
    };
  };
  capabilities: { chat: ProbeResult; codex: ProbeResult; whisper: ProbeResult; tts: ProbeResult };
  modelsByKey: Record<string, ModelsForKey>;
};

const CATEGORY_LABELS: Record<string, string> = {
  chat: "Chat / Completions",
  tts: "Text-to-Speech (TTS)",
  stt: "Speech-to-Text (Whisper)",
  embeddings: "Embeddings",
  image: "Images (DALL·E)",
  moderation: "Modération",
  realtime: "Realtime",
  other: "Autres",
};

function CapabilityBadge({ label, result }: { label: string; result: ProbeResult }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 ${
              result.ok
                ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
                : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
            }`}
          >
            <div className="flex items-center gap-2">
              {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <span className="text-sm font-medium">{label}</span>
              <Badge variant="outline" className="ml-auto text-xs">{result.status || "—"}</Badge>
            </div>
            <div className="flex items-center gap-1 text-[11px] opacity-80">
              <KeyRound className="h-3 w-3" />
              <code>{result.keyLabel}</code>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-1 text-xs">
            <div><strong>Modèle testé :</strong> {result.modelTested ?? "—"}</div>
            <div><strong>Clé utilisée :</strong> {result.keyUsed}</div>
            <div><strong>HTTP :</strong> {result.status}</div>
            {result.errorCode && <div><strong>Code :</strong> {result.errorCode}</div>}
            {result.errorMessage && <div><strong>Message :</strong> {result.errorMessage}</div>}
            {result.ok && !result.errorMessage && <div>Accès confirmé.</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function KeyStatus({ label, configured, prefix }: { label: string; configured: boolean; prefix: string | null }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
      configured ? "border-green-500/30 bg-green-500/5" : "border-muted bg-muted/30 text-muted-foreground"
    }`}>
      <KeyRound className="h-3.5 w-3.5" />
      <code className="font-medium">{label}</code>
      <span className="opacity-70">{configured ? prefix : "non configurée"}</span>
    </div>
  );
}

export default function OpenAIDiagnostics() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invErr } = await supabase.functions.invoke("openai-diagnostics", { body: {} });
      if (invErr) throw invErr;
      if (!data || data.error) throw new Error(data?.error ?? "Réponse vide");
      setReport(data as DiagnosticsReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Diagnostic clés OpenAI</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Vérifie l'accès réel de chaque clé OpenAI configurée : <code>clé_chat</code> (chat + codex),{" "}
            <code>clé_whisper</code> (transcription) et <code>clé_tts</code> (synthèse vocale).
          </p>
        </div>
        <Button onClick={run} disabled={loading}>
          {loading
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Test en cours…</>
            : <><RefreshCw className="mr-2 h-4 w-4" /> Lancer le diagnostic</>}
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="pt-6 text-sm text-red-700 dark:text-red-400">
            <strong>Erreur :</strong> {error}
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Clés configurées</CardTitle>
              <CardDescription>État des trois secrets côté backend.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <KeyStatus label="clé_chat (OPENAI_API_KEY)" configured={report.meta.keys.chat.configured} prefix={report.meta.keys.chat.prefix} />
                <KeyStatus label="clé_whisper (OPENAI_WHISPER_API_KEY)" configured={report.meta.keys.whisper.configured} prefix={report.meta.keys.whisper.prefix} />
                <KeyStatus label="clé_tts (OPENAI_TTS_API_KEY)" configured={report.meta.keys.tts.configured} prefix={report.meta.keys.tts.prefix} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capacités</CardTitle>
              <CardDescription>
                Test réel sur l'API OpenAI — diagnostic effectué en {report.meta.durationMs} ms.
                Chaque badge indique la <strong>clé utilisée</strong> pour la capacité.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <CapabilityBadge label="Chat" result={report.capabilities.chat} />
                <CapabilityBadge label="Codex" result={report.capabilities.codex} />
                <CapabilityBadge label="Whisper (STT)" result={report.capabilities.whisper} />
                <CapabilityBadge label="TTS" result={report.capabilities.tts} />
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Survolez un badge pour voir le code et le message d'erreur OpenAI exact.
              </p>
            </CardContent>
          </Card>

          {Object.entries(report.modelsByKey).map(([keyLabel, info]) => (
            <Card key={keyLabel}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Modèles vus par <code className="text-base">{keyLabel}</code>
                </CardTitle>
                <CardDescription>
                  <code>{info.keyName}</code> · préfixe <code>{info.keyPrefix}</code> ·{" "}
                  {info.ok ? `${info.total} modèle${info.total > 1 ? "s" : ""}` : <span className="text-red-600">erreur {info.status} : {info.error}</span>}
                </CardDescription>
              </CardHeader>
              {info.ok && (
                <CardContent className="space-y-4">
                  {Object.entries(info.grouped)
                    .filter(([, list]) => list.length > 0)
                    .map(([cat, list]) => (
                      <div key={cat}>
                        <div className="flex items-baseline justify-between mb-2">
                          <h3 className="text-sm font-semibold">{CATEGORY_LABELS[cat] ?? cat}</h3>
                          <Badge variant="secondary">{list.length}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((m) => (
                            <TooltipProvider key={m.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="font-mono text-xs cursor-help">{m.id}</Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs space-y-0.5">
                                    <div><strong>ID :</strong> {m.id}</div>
                                    {m.owned_by && <div><strong>Propriétaire :</strong> {m.owned_by}</div>}
                                    {m.created && <div><strong>Créé :</strong> {new Date(m.created * 1000).toLocaleDateString()}</div>}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        </div>
                      </div>
                    ))}
                </CardContent>
              )}
            </Card>
          ))}

          <Card>
            <CardHeader className="cursor-pointer" onClick={() => setShowRaw((v) => !v)}>
              <CardTitle className="text-base">{showRaw ? "▼" : "▶"} Réponse brute (debug)</CardTitle>
            </CardHeader>
            {showRaw && (
              <CardContent>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-96">
                  {JSON.stringify(report, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
