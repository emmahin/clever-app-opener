import { useEffect, useRef, useState } from "react";
import { Activity, Euro, Loader2, Play, RefreshCw, RotateCcw, Save, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  DEFAULT_VOICE_CONFIG,
  DEFAULT_PRICING,
  ElevenLabsVoiceConfig,
  ElevenLabsPricingConfig,
  loadVoiceConfig,
  loadPricing,
  savePricing,
  subscribePricing,
  MODEL_PRESETS,
  resetVoiceConfig,
  saveVoiceConfig,
  VOICE_PRESETS,
} from "@/services/elevenLabsConfig";
import { synthesizeWithElevenLabs } from "@/services/elevenLabsTtsService";
import { ElevenLabsUsage, fetchElevenLabsUsage } from "@/services/elevenLabsUsageService";

const DEMO_TEXT =
  "Bonjour ! Je suis votre assistant vocal propulsé par ElevenLabs. " +
  "Vous pouvez ajuster la voix, la stabilité, le style et la vitesse de mon élocution depuis cette interface. " +
  "Une fois sauvegardés, ces paramètres s'appliquent automatiquement à l'ensemble du projet.";

export default function VoiceAdmin() {
  const [config, setConfig] = useState<ElevenLabsVoiceConfig>(() => loadVoiceConfig());
  const [demoText, setDemoText] = useState(DEMO_TEXT);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [dirty, setDirty] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const update = <K extends keyof ElevenLabsVoiceConfig>(key: K, value: ElevenLabsVoiceConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    saveVoiceConfig(config);
    setDirty(false);
    toast({ title: "Paramètres enregistrés", description: "Appliqués à l'ensemble du projet." });
  };

  const handleReset = () => {
    const fresh = resetVoiceConfig();
    setConfig(fresh);
    setDirty(false);
    toast({ title: "Paramètres réinitialisés" });
  };

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPlaying(false);
  };

  const handlePlay = async () => {
    if (playing) {
      stopAudio();
      return;
    }
    if (!demoText.trim()) {
      toast({ title: "Texte vide", description: "Entrez un texte à lire.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // On envoie la config courante (même si non sauvegardée) pour tester en direct.
      const blob = await synthesizeWithElevenLabs({
        text: demoText,
        voiceId: config.voiceId,
        modelId: config.modelId,
        outputFormat: config.outputFormat,
        stability: config.stability,
        similarityBoost: config.similarityBoost,
        style: config.style,
        useSpeakerBoost: config.useSpeakerBoost,
        speed: config.speed,
      });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => stopAudio();
      audio.onerror = () => {
        stopAudio();
        toast({ title: "Erreur de lecture", variant: "destructive" });
      };
      await audio.play();
      setPlaying(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      toast({ title: "Échec de la synthèse", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const selectedVoice = VOICE_PRESETS.find((v) => v.id === config.voiceId);
  const selectedModel = MODEL_PRESETS.find((m) => m.id === config.modelId);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Configuration vocale ElevenLabs</h1>
            <p className="text-sm text-muted-foreground">
              Réglez la voix utilisée par toutes les fonctionnalités du projet.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Aperçu en direct</CardTitle>
            <CardDescription>
              Saisissez un texte et écoutez le rendu avec les paramètres actuels.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              rows={4}
              placeholder="Texte à lire…"
            />
            <div className="flex gap-2">
              <Button onClick={handlePlay} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : playing ? (
                  <Square className="mr-2 h-4 w-4" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                {loading ? "Synthèse…" : playing ? "Arrêter" : "Lire le texte"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <UsageCard modelCreditsPerChar={selectedModel?.creditsPerChar ?? 1} />
        <PricingCard />

        <Card>
          <CardHeader>
            <CardTitle>Voix & modèle</CardTitle>
            <CardDescription>Choisissez la voix et le moteur de synthèse.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Voix</Label>
              <Select value={config.voiceId} onValueChange={(v) => update("voiceId", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_PRESETS.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="font-medium">{v.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{v.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVoice && (
                <p className="text-xs text-muted-foreground">{selectedVoice.description}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Modèle</Label>
              <Select value={config.modelId} onValueChange={(v) => update("modelId", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_PRESETS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex flex-col">
                        <span>
                          <span className="font-medium">{m.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{m.description}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground/80">💰 {m.costHint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedModel && (
                <p className="text-xs text-muted-foreground">
                  Coût indicatif : <span className="font-medium">{selectedModel.costHint}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paramètres de la voix</CardTitle>
            <CardDescription>
              Ajustez stabilité, similarité, style et vitesse pour personnaliser le rendu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <SliderRow
              label="Stabilité"
              hint="Plus haut = voix plus constante. Plus bas = plus expressive."
              value={config.stability}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update("stability", v)}
            />
            <SliderRow
              label="Similarité (clarté)"
              hint="Renforce la similarité avec la voix d'origine."
              value={config.similarityBoost}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update("similarityBoost", v)}
            />
            <SliderRow
              label="Style"
              hint="Exagération du style (multilingual v2). 0 = neutre."
              value={config.style}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update("style", v)}
            />
            <SliderRow
              label="Vitesse"
              hint="Vitesse d'élocution (0.7 = lent, 1.2 = rapide)."
              value={config.speed}
              min={0.7}
              max={1.2}
              step={0.05}
              onChange={(v) => update("speed", v)}
            />
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="font-medium">Speaker boost</Label>
                <p className="text-xs text-muted-foreground">
                  Améliore la clarté et la ressemblance vocale.
                </p>
              </div>
              <Switch
                checked={config.useSpeakerBoost}
                onCheckedChange={(v) => update("useSpeakerBoost", v)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-4 flex justify-between gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Réinitialiser
          </Button>
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="text-xs text-muted-foreground">Modifications non enregistrées</span>
            )}
            <Button onClick={handleSave} disabled={!dirty}>
              <Save className="mr-2 h-4 w-4" />
              Enregistrer
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Valeurs par défaut : voix {DEFAULT_VOICE_CONFIG.voiceId.slice(0, 6)}…, modèle{" "}
          {DEFAULT_VOICE_CONFIG.modelId}.
        </p>
      </div>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, hint, value, min, max, step, onChange }: SliderRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface UsageCardProps {
  modelCreditsPerChar: number;
}

function UsageCard({ modelCreditsPerChar }: UsageCardProps) {
  const [usage, setUsage] = useState<ElevenLabsUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchElevenLabsUsage();
      setUsage(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (n: number) => n.toLocaleString("fr-FR");
  const resetDate = usage?.next_character_count_reset_unix
    ? new Date(usage.next_character_count_reset_unix * 1000)
    : null;

  // Estimation : nb caractères restants / coût du modèle courant
  const estimatedCharsWithModel = usage
    ? Math.floor(usage.remaining / Math.max(0.01, modelCreditsPerChar))
    : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <div>
            <CardTitle className="text-base">Consommation ElevenLabs</CardTitle>
            <CardDescription>
              Quota du compte — actualisation auto toutes les 30 s.
            </CardDescription>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {!usage && !error && (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        )}
        {usage && (
          <>
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {fmt(usage.character_count)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}/ {fmt(usage.character_limit)} car.
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Plan <span className="font-medium">{usage.tier}</span> · statut{" "}
                  <span className="font-medium">{usage.status}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium tabular-nums">
                  {usage.percent_used.toFixed(1)} %
                </div>
                <div className="text-xs text-muted-foreground">utilisés</div>
              </div>
            </div>
            <Progress value={usage.percent_used} />
            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div className="rounded-md border border-border/60 bg-secondary/30 p-2">
                <div className="text-muted-foreground">Restant</div>
                <div className="font-medium tabular-nums text-foreground">
                  {fmt(usage.remaining)} car.
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-secondary/30 p-2">
                <div className="text-muted-foreground">Avec le modèle courant</div>
                <div className="font-medium tabular-nums text-foreground">
                  ≈ {fmt(estimatedCharsWithModel)} car. générables
                </div>
              </div>
            </div>
            {resetDate && (
              <p className="text-[11px] text-muted-foreground">
                Réinitialisation du quota :{" "}
                {resetDate.toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
