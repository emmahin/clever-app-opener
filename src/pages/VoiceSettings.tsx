import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mic, Play, RotateCcw, Save, Sparkles, Square, Wand2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  ElevenLabsVoiceConfig,
  loadVoiceConfig,
  saveVoiceConfig,
  resetVoiceConfig,
  VOICE_PRESETS,
  MODEL_PRESETS,
} from "@/services/elevenLabsConfig";
import { synthesizeWithElevenLabs } from "@/services/elevenLabsTtsService";

const DEMO_TEXT =
  "Bonjour, je suis Nex. Ajustez ma voix, mon modèle et ma façon de prendre des initiatives ici.";

/**
 * Page utilisateur : modifie tous les paramètres ElevenLabs (voix, modèle, sliders)
 * + une "température" qui mappe sur la prise d'initiative (style + 1-stability).
 * Tous les changements sont persistés via saveVoiceConfig() et appliqués partout
 * dans l'app (le service TTS lit cette config à chaque appel).
 */
export default function VoiceSettings() {
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

  /** Température 0..1 = niveau d'initiative.
   *  0  = très posée, prévisible (stability haute, style 0)
   *  1  = expressive, prend des libertés (stability basse, style haut) */
  const temperature = Math.max(0, Math.min(1, (config.style + (1 - config.stability)) / 2));

  const update = <K extends keyof ElevenLabsVoiceConfig>(key: K, value: ElevenLabsVoiceConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const setTemperature = (t: number) => {
    setConfig((prev) => ({
      ...prev,
      stability: Math.round((1 - t) * 100) / 100,
      style: Math.round(t * 100) / 100,
    }));
    setDirty(true);
  };

  const handleSave = () => {
    saveVoiceConfig(config);
    setDirty(false);
    toast({ title: "Voix mise à jour", description: "Appliquée immédiatement à toute l'application." });
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
    if (playing) return stopAudio();
    if (!demoText.trim()) {
      toast({ title: "Texte vide", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const blob = await synthesizeWithElevenLabs({ text: demoText, ...config });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => stopAudio();
      audio.onerror = () => { stopAudio(); toast({ title: "Erreur de lecture", variant: "destructive" }); };
      await audio.play();
      setPlaying(true);
    } catch (e) {
      toast({ title: "Échec de la synthèse", description: e instanceof Error ? e.message : "Erreur inconnue", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const selectedVoice = VOICE_PRESETS.find((v) => v.id === config.voiceId);
  const selectedModel = MODEL_PRESETS.find((m) => m.id === config.modelId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <main className="ml-0 md:[margin-left:var(--sidebar-w,280px)] md:transition-[margin-left] md:duration-300 pt-14 min-h-screen">
        <div className="max-w-3xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4">
          <header className="flex items-center gap-2.5 mb-1">
            <Mic className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Paramètres de la voix</h1>
          </header>

          {/* Application vocale active */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Application vocale active
              </CardTitle>
              <CardDescription>Pile vocale utilisée actuellement par Nex.</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                <div className="text-xs text-muted-foreground">Reconnaissance vocale (STT)</div>
                <div className="font-medium">Gemini · voice-transcribe</div>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="text-xs text-muted-foreground">Synthèse (TTS)</div>
                <div className="font-medium">ElevenLabs · {selectedModel?.name ?? config.modelId}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                <div className="text-xs text-muted-foreground">Interface vocale</div>
                <div className="font-medium">VoiceCallMode (overlay)</div>
              </div>
            </CardContent>
          </Card>

          {/* Aperçu */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aperçu en direct</CardTitle>
              <CardDescription>Testez la voix avec les paramètres actuels.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={demoText} onChange={(e) => setDemoText(e.target.value)} rows={3} />
              <Button onClick={handlePlay} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : playing ? <Square className="mr-2 h-4 w-4" />
                  : <Play className="mr-2 h-4 w-4" />}
                {loading ? "Synthèse…" : playing ? "Arrêter" : "Écouter"}
              </Button>
            </CardContent>
          </Card>

          {/* Voix & modèle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voix & modèle</CardTitle>
              <CardDescription>Synchronisé avec votre compte ElevenLabs.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Voix</Label>
                <Select value={config.voiceId} onValueChange={(v) => update("voiceId", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VOICE_PRESETS.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        <span className="font-medium">{v.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{v.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedVoice && <p className="text-xs text-muted-foreground">{selectedVoice.description}</p>}
              </div>
              <div className="space-y-2">
                <Label>Modèle</Label>
                <Select value={config.modelId} onValueChange={(v) => update("modelId", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODEL_PRESETS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="font-medium">{m.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{m.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedModel && <p className="text-xs text-muted-foreground">💰 {selectedModel.costHint}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Température / initiative */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-primary" /> Température de la voix
              </CardTitle>
              <CardDescription>
                Contrôle la prise d'initiative : posée et prévisible ↔ expressive et libre.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Initiative</Label>
                <span className="font-mono text-sm tabular-nums text-muted-foreground">{temperature.toFixed(2)}</span>
              </div>
              <Slider value={[temperature]} min={0} max={1} step={0.05}
                onValueChange={(v) => setTemperature(v[0])} />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>🧊 Posée</span><span>⚖️ Équilibrée</span><span>🔥 Expressive</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ajuste automatiquement <span className="font-medium">stabilité</span> et{" "}
                <span className="font-medium">style</span> ElevenLabs.
              </p>
            </CardContent>
          </Card>

          {/* Détails fins */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Réglages avancés</CardTitle>
              <CardDescription>Pour un contrôle fin du rendu vocal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SliderRow label="Stabilité" hint="Haut = constante. Bas = expressive."
                value={config.stability} min={0} max={1} step={0.05}
                onChange={(v) => update("stability", v)} />
              <SliderRow label="Similarité" hint="Renforce la ressemblance avec la voix d'origine."
                value={config.similarityBoost} min={0} max={1} step={0.05}
                onChange={(v) => update("similarityBoost", v)} />
              <SliderRow label="Style" hint="Exagération du style (0 = neutre)."
                value={config.style} min={0} max={1} step={0.05}
                onChange={(v) => update("style", v)} />
              <SliderRow label="Vitesse" hint="0.7 lent → 1.2 rapide."
                value={config.speed} min={0.7} max={1.2} step={0.05}
                onChange={(v) => update("speed", v)} />
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="font-medium">Speaker boost</Label>
                  <p className="text-xs text-muted-foreground">Améliore clarté et ressemblance.</p>
                </div>
                <Switch checked={config.useSpeakerBoost} onCheckedChange={(v) => update("useSpeakerBoost", v)} />
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-4 flex justify-between gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
            <Button variant="ghost" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Réinitialiser
            </Button>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs text-muted-foreground">Non enregistré</span>}
              <Button onClick={handleSave} disabled={!dirty}>
                <Save className="mr-2 h-4 w-4" /> Enregistrer
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

interface SliderRowProps {
  label: string; hint?: string; value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
}
function SliderRow({ label, hint, value, min, max, step, onChange }: SliderRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}