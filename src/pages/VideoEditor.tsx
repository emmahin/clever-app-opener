import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { FloatingProjectsBar } from "@/components/chatbot/FloatingProjectsBar";
import { TokenCounter } from "@/components/chatbot/TokenCounter";
import {
  Clapperboard, Upload, Play, Pause, Scissors, Trash2, Type, Download,
  ChevronLeft, ChevronRight, Loader2, Music, Sparkles, Send,
  Youtube, Smartphone, Volume2, FileVideo, FileAudio,
} from "lucide-react";
import { toast } from "sonner";

/* ============================== Types ============================== */

type Preset = "youtube" | "reels";

interface TextOverlay {
  id: string; text: string; x: number; y: number; size: number; color: string;
}
interface Clip {
  id: string; name: string; url: string; duration: number;
  width: number; height: number; inPoint: number; outPoint: number;
  overlays: TextOverlay[]; el: HTMLVideoElement;
}
interface AudioTrack {
  id: string; title: string; url: string; duration: number;
  startAt: number; volume: number; kind: "music" | "sfx" | "imported";
  el: HTMLAudioElement;
}
interface ChatMsg { role: "user" | "assistant"; content: string; }

/* ============================== Constants ============================== */

const PRESETS: Record<Preset, { w: number; h: number; label: string; icon: any }> = {
  youtube: { w: 1280, h: 720, label: "YouTube 16:9", icon: Youtube },
  reels:   { w: 720,  h: 1280, label: "Reels 9:16",  icon: Smartphone },
};

const AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-editor-agent`;

/* ============================== Component ============================== */

export default function VideoEditor() {
  const [preset, setPreset] = useState<Preset>("youtube");
  const [clips, setClips] = useState<Clip[]>([]);
  const [audios, setAudios] = useState<AudioTrack[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([
    { role: "assistant", content: "Salut ! Importe tes vidéos/sons puis dis-moi ce que tu veux : « monte tout seul », « ajoute une intro », « coupe le 1er clip à 5s », etc." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<{ wallClock: number; timeline: number } | null>(null);

  const { w: CW, h: CH } = PRESETS[preset];
  const totalDuration = useMemo(
    () => clips.reduce((s, c) => s + Math.max(0, c.outPoint - c.inPoint), 0),
    [clips],
  );
  const selected = clips.find((c) => c.id === selectedId) ?? null;

  /* --------------------------- Import --------------------------- */

  const handleFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files);
    const newClips: Clip[] = [];
    const newAudios: AudioTrack[] = [];
    for (const f of arr) {
      try {
        if (f.type.startsWith("video/")) newClips.push(await loadVideoClip(f));
        else if (f.type.startsWith("audio/")) newAudios.push(await loadAudioFile(f));
      } catch (e) {
        toast.error(`Impossible de charger ${f.name}`);
      }
    }
    if (newClips.length) {
      setClips((p) => [...p, ...newClips]);
      setSelectedId((c) => c ?? newClips[0].id);
    }
    if (newAudios.length) setAudios((p) => [...p, ...newAudios]);
    const total = newClips.length + newAudios.length;
    if (total) toast.success(`${total} fichier(s) ajouté(s)`);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer?.files ?? null);
  }, [handleFiles]);

  /* --------------------------- Render frame --------------------------- */

  const locateAt = useCallback((t: number) => {
    let acc = 0;
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i]; const len = Math.max(0, c.outPoint - c.inPoint);
      if (t < acc + len) return { clip: c, local: c.inPoint + (t - acc), index: i };
      acc += len;
    }
    const last = clips[clips.length - 1];
    return last ? { clip: last, local: last.outPoint, index: clips.length - 1 } : null;
  }, [clips]);

  const drawFrame = useCallback((loc: { clip: Clip; local: number } | null) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!loc) return;
    const { clip } = loc; const v = clip.el;
    const ar = clip.width / clip.height; const target = canvas.width / canvas.height;
    let dw: number, dh: number;
    if (ar > target) { dw = canvas.width; dh = canvas.width / ar; }
    else             { dh = canvas.height; dw = canvas.height * ar; }
    const dx = (canvas.width - dw) / 2; const dy = (canvas.height - dh) / 2;
    try { ctx.drawImage(v, dx, dy, dw, dh); } catch {/**/}
    for (const o of clip.overlays) {
      const fontPx = (o.size / 1080) * canvas.height;
      ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = o.color;
      ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = fontPx * 0.15;
      ctx.fillText(o.text, o.x * canvas.width, o.y * canvas.height);
      ctx.shadowBlur = 0;
    }
  }, []);

  /* --------------------------- Playback --------------------------- */

  const stopAllMedia = useCallback(() => {
    for (const c of clips) if (!c.el.paused) c.el.pause();
    for (const a of audios) if (!a.el.paused) a.el.pause();
  }, [clips, audios]);

  const seekTo = useCallback(async (t: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, t));
    setCurrentTime(clamped);
    const loc = locateAt(clamped);
    if (!loc) { drawFrame(null); return; }
    stopAllMedia();
    const { clip, local } = loc;
    await new Promise<void>((res) => {
      const h = () => { clip.el.removeEventListener("seeked", h); res(); };
      clip.el.addEventListener("seeked", h);
      try { clip.el.currentTime = Math.min(local, clip.duration - 0.01); } catch { res(); }
    });
    drawFrame(loc);
  }, [drawFrame, locateAt, stopAllMedia, totalDuration]);

  const tick = useCallback(() => {
    const start = playStartRef.current; if (!start) return;
    const elapsed = (performance.now() - start.wallClock) / 1000;
    const t = start.timeline + elapsed;
    if (t >= totalDuration) {
      setIsPlaying(false); setCurrentTime(totalDuration); stopAllMedia();
      drawFrame(locateAt(totalDuration - 0.001)); return;
    }
    const loc = locateAt(t);
    if (loc) {
      const { clip, local } = loc;
      for (const c of clips) if (c.id !== clip.id && !c.el.paused) c.el.pause();
      if (clip.el.paused) {
        try { clip.el.currentTime = Math.min(local, clip.duration - 0.01); clip.el.play().catch(() => {}); } catch {/**/}
      }
      if (Math.abs(clip.el.currentTime - local) > 0.15) {
        try { clip.el.currentTime = Math.min(local, clip.duration - 0.01); } catch {/**/}
      }
      drawFrame(loc);
    }
    // Audio tracks
    for (const a of audios) {
      const localA = t - a.startAt;
      const shouldPlay = localA >= 0 && localA < a.duration;
      if (shouldPlay) {
        if (a.el.paused) {
          try { a.el.currentTime = Math.max(0, localA); a.el.volume = a.volume; a.el.play().catch(() => {}); } catch {/**/}
        } else if (Math.abs(a.el.currentTime - localA) > 0.3) {
          try { a.el.currentTime = localA; } catch {/**/}
        }
      } else if (!a.el.paused) {
        a.el.pause();
      }
    }
    setCurrentTime(t);
    rafRef.current = requestAnimationFrame(tick);
  }, [audios, clips, drawFrame, locateAt, stopAllMedia, totalDuration]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false); stopAllMedia();
      if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; return;
    }
    if (!clips.length) return;
    const startT = currentTime >= totalDuration - 0.05 ? 0 : currentTime;
    setCurrentTime(startT);
    playStartRef.current = { wallClock: performance.now(), timeline: startT };
    setIsPlaying(true);
  }, [clips.length, currentTime, isPlaying, stopAllMedia, totalDuration]);

  useEffect(() => {
    if (isPlaying) rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  }, [isPlaying, tick]);

  useEffect(() => {
    if (isPlaying) return;
    drawFrame(locateAt(currentTime));
  }, [clips, currentTime, drawFrame, isPlaying, locateAt, preset]);

  /* --------------------------- Mutations --------------------------- */

  const updateClip = (id: string, patch: Partial<Clip>) =>
    setClips((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const removeClip = (id: string) => {
    setClips((p) => { const c = p.find((x) => x.id === id); if (c) URL.revokeObjectURL(c.url); return p.filter((x) => x.id !== id); });
    if (selectedId === id) setSelectedId(null);
  };

  const moveClip = (id: string, dir: -1 | 1) => setClips((p) => {
    const i = p.findIndex((c) => c.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= p.length) return p;
    const next = [...p]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const splitAtPlayhead = () => {
    const loc = locateAt(currentTime); if (!loc) return;
    const { clip, local, index } = loc;
    if (local <= clip.inPoint + 0.05 || local >= clip.outPoint - 0.05) {
      toast.error("Place la tête de lecture dans le clip"); return;
    }
    const right = cloneVideoEl(clip);
    const left: Clip = { ...clip, outPoint: local, id: crypto.randomUUID() };
    const rightClip: Clip = { ...clip, el: right, inPoint: local, id: crypto.randomUUID(), overlays: [] };
    setClips((p) => { const next = [...p]; next.splice(index, 1, left, rightClip); return next; });
    toast.success("Clip découpé");
  };

  const addOverlay = () => {
    if (!selected) return;
    updateClip(selected.id, {
      overlays: [...selected.overlays, {
        id: crypto.randomUUID(), text: "Nouveau texte",
        x: 0.5, y: 0.85, size: 64, color: "#ffffff",
      }],
    });
  };
  const updateOverlay = (oid: string, patch: Partial<TextOverlay>) => {
    if (!selected) return;
    updateClip(selected.id, { overlays: selected.overlays.map((o) => (o.id === oid ? { ...o, ...patch } : o)) });
  };
  const removeOverlay = (oid: string) => {
    if (!selected) return;
    updateClip(selected.id, { overlays: selected.overlays.filter((o) => o.id !== oid) });
  };

  const removeAudio = (id: string) => setAudios((p) => {
    const a = p.find((x) => x.id === id); if (a) { try { a.el.pause(); URL.revokeObjectURL(a.url); } catch {/**/} }
    return p.filter((x) => x.id !== id);
  });

  /* --------------------------- AI Agent --------------------------- */

  const applyActions = useCallback(async (actions: any[]) => {
    for (const a of actions || []) {
      try {
        switch (a.type) {
          case "set_format":
            if (a.preset === "youtube" || a.preset === "reels") setPreset(a.preset);
            break;
          case "trim": {
            const c = clips.find((x) => x.id === a.clipId);
            if (c) updateClip(c.id, {
              inPoint: typeof a.inPoint === "number" ? Math.max(0, Math.min(c.duration, a.inPoint)) : c.inPoint,
              outPoint: typeof a.outPoint === "number" ? Math.max(0, Math.min(c.duration, a.outPoint)) : c.outPoint,
            });
            break;
          }
          case "reorder": {
            const idx = clips.findIndex((x) => x.id === a.clipId);
            if (idx >= 0 && typeof a.toIndex === "number") {
              setClips((p) => {
                const next = [...p]; const [m] = next.splice(idx, 1);
                next.splice(Math.max(0, Math.min(p.length - 1, a.toIndex)), 0, m); return next;
              });
            }
            break;
          }
          case "remove_clip": removeClip(a.clipId); break;
          case "add_text": {
            const c = clips.find((x) => x.id === a.clipId);
            if (c) updateClip(c.id, {
              overlays: [...c.overlays, {
                id: crypto.randomUUID(), text: a.text || "Texte",
                x: typeof a.x === "number" ? a.x : 0.5,
                y: typeof a.y === "number" ? a.y : 0.85,
                size: typeof a.size === "number" ? a.size : 64,
                color: a.color || "#ffffff",
              }],
            });
            break;
          }
          case "remove_text": {
            const c = clips.find((x) => x.id === a.clipId);
            if (c) updateClip(c.id, { overlays: c.overlays.filter((o) => o.id !== a.overlayId) });
            break;
          }
          case "add_audio_url": {
            if (!a.url) break;
            try {
              const track = await loadAudioFromUrl(a.url, a.title || "Track", a.kind || "music");
              setAudios((p) => [...p, track]);
            } catch { toast.error("Impossible de charger le son IA"); }
            break;
          }
        }
      } catch (e) { console.error("apply action failed", a, e); }
    }
  }, [clips]);

  const sendToAgent = async () => {
    const text = chatInput.trim(); if (!text || aiThinking) return;
    setChatInput(""); setAiThinking(true);
    const next: ChatMsg[] = [...chat, { role: "user", content: text }];
    setChat(next);
    try {
      const r = await fetch(AGENT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          state: {
            preset,
            clips: clips.map((c) => ({
              id: c.id, name: c.name, duration: c.duration,
              inPoint: c.inPoint, outPoint: c.outPoint,
              overlays: c.overlays.map((o) => ({ id: o.id, text: o.text })),
            })),
            audios: audios.map((a) => ({ id: a.id, title: a.title, kind: a.kind })),
          },
        }),
      });
      if (r.status === 429) throw new Error("Trop de requêtes — réessaie dans un instant.");
      if (r.status === 402) throw new Error("Crédits IA épuisés.");
      if (!r.ok) throw new Error("Échec de l'IA.");
      const data = await r.json();
      setChat((p) => [...p, { role: "assistant", content: data.message || "OK" }]);
      if (Array.isArray(data.actions) && data.actions.length) await applyActions(data.actions);
    } catch (e: any) {
      setChat((p) => [...p, { role: "assistant", content: "❌ " + (e?.message || "erreur") }]);
    } finally { setAiThinking(false); }
  };

  /* --------------------------- Export --------------------------- */

  const exportVideo = async () => {
    if (!clips.length || !canvasRef.current) return;
    setExporting(true); setIsPlaying(false); stopAllMedia();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try {
      const canvas = canvasRef.current; const fps = 30;
      const stream = (canvas as any).captureStream(fps) as MediaStream;
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const finished = new Promise<Blob>((res) => { recorder.onstop = () => res(new Blob(chunks, { type: mime })); });
      recorder.start(100);
      const totalFrames = Math.ceil(totalDuration * fps);
      for (let f = 0; f < totalFrames; f++) {
        const t = f / fps; const loc = locateAt(t);
        if (loc) {
          await seekVideoTo(loc.clip.el, Math.min(loc.local, loc.clip.duration - 0.01));
          drawFrame(loc);
        }
        await new Promise((r) => setTimeout(r, 1000 / fps));
      }
      recorder.stop();
      const blob = await finished;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `montage-${preset}-${Date.now()}.${mime.includes("mp4") ? "mp4" : "webm"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Export terminé — fichier téléchargé");
    } catch (e: any) {
      toast.error("Échec export : " + e.message);
    } finally { setExporting(false); }
  };

  /* ============================== Render ============================== */

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <FloatingProjectsBar
        category="video"
        getSnapshot={() => ({ savedAt: Date.now(), preset })}
      />
      <main className="ml-[72px] pt-14 min-h-screen flex flex-col">
        {/* Top bar */}
        <div className="px-6 py-3 flex items-center justify-between border-b border-border/40 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Clapperboard className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Montage vidéo</h1>
          </div>

          {/* Format presets */}
          <div className="flex items-center gap-2 bg-secondary/40 rounded-lg p-1">
            {(Object.keys(PRESETS) as Preset[]).map((k) => {
              const P = PRESETS[k]; const active = preset === k; const Icon = P.icon;
              return (
                <button key={k} onClick={() => setPreset(k)}
                  className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  <Icon className="w-4 h-4" />
                  {P.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label className="px-3 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" /> Importer
              <input type="file" accept="video/*,audio/*" multiple className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.currentTarget.value = ""; }} />
            </label>
            <button onClick={exportVideo} disabled={!clips.length || exporting}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-50 hover:opacity-90">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting ? "Export…" : "Télécharger"}
            </button>
          </div>
        </div>

        {/* Body: 3 columns — drop+chat | preview+timeline | inspector */}
        <div className="flex-1 grid grid-cols-[300px_1fr_300px] gap-3 p-3 min-h-0">
          {/* LEFT: drop zone + chat */}
          <div className="flex flex-col gap-3 min-h-0">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/10" : "border-border/60 bg-secondary/20"
              }`}>
              <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm font-medium">Glisse tes fichiers ici</div>
              <div className="text-xs text-muted-foreground mt-1">Vidéos & audios acceptés</div>
            </div>

            {/* AI Chat */}
            <div className="flex-1 flex flex-col rounded-xl border border-border/40 bg-card/50 min-h-0">
              <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Monteur IA</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
                {chat.map((m, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 ${
                    m.role === "user" ? "bg-primary/15 ml-6" : "bg-secondary/40 mr-6"
                  }`}>{m.content}</div>
                ))}
                {aiThinking && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Réflexion…</div>}
              </div>
              <div className="p-2 border-t border-border/40 flex gap-2">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendToAgent(); }}
                  placeholder="Demande à l'IA…"
                  className="flex-1 h-9 px-3 rounded-lg bg-background border border-border/60 text-sm focus:outline-none focus:border-primary" />
                <button onClick={sendToAgent} disabled={aiThinking}
                  className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* CENTER: preview + transport + timeline */}
          <div className="flex flex-col min-h-0">
            <div className="flex-1 flex items-center justify-center bg-black rounded-xl overflow-hidden min-h-0">
              <canvas ref={canvasRef} width={CW} height={CH} className="max-w-full max-h-full" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button onClick={togglePlay} disabled={!clips.length}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button onClick={splitAtPlayhead} disabled={!clips.length}
                className="px-3 h-10 rounded-lg bg-secondary text-sm flex items-center gap-2 hover:bg-secondary/80 disabled:opacity-50">
                <Scissors className="w-4 h-4" /> Découper
              </button>
              <input type="range" min={0} max={Math.max(0.01, totalDuration)} step={0.01} value={currentTime}
                onChange={(e) => { if (isPlaying) togglePlay(); seekTo(parseFloat(e.target.value)); }}
                className="flex-1 accent-primary" />
              <span className="text-xs text-muted-foreground font-mono w-24 text-right">
                {fmt(currentTime)} / {fmt(totalDuration)}
              </span>
            </div>

            {/* Video timeline */}
            <div className="mt-3 rounded-xl bg-secondary/30 border border-border/40 p-2 min-h-[80px]">
              <div className="flex items-center gap-1 mb-1.5 text-[11px] text-muted-foreground"><FileVideo className="w-3 h-3" /> Vidéo</div>
              {clips.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-3">Glisse des vidéos pour commencer</div>
              ) : (
                <div className="flex gap-2 overflow-x-auto">
                  {clips.map((c, i) => {
                    const len = Math.max(0.1, c.outPoint - c.inPoint);
                    const w = Math.max(80, Math.min(280, len * 40));
                    const active = c.id === selectedId;
                    return (
                      <div key={c.id} onClick={() => setSelectedId(c.id)} style={{ width: w }}
                        className={`relative flex-shrink-0 h-[64px] rounded-lg border cursor-pointer overflow-hidden ${
                          active ? "border-primary ring-2 ring-primary/40" : "border-border/60 hover:border-border"
                        }`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-fuchsia-500/30" />
                        <div className="relative p-2 flex flex-col h-full justify-between">
                          <div className="text-[11px] font-medium truncate text-white">{i + 1}. {c.name}</div>
                          <div className="flex items-center justify-between text-[10px] text-white/80">
                            <span>{len.toFixed(1)}s</span>
                            <div className="flex gap-1">
                              <button onClick={(e) => { e.stopPropagation(); moveClip(c.id, -1); }} className="w-5 h-5 rounded bg-black/40 hover:bg-black/60 flex items-center justify-center"><ChevronLeft className="w-3 h-3" /></button>
                              <button onClick={(e) => { e.stopPropagation(); moveClip(c.id, 1);  }} className="w-5 h-5 rounded bg-black/40 hover:bg-black/60 flex items-center justify-center"><ChevronRight className="w-3 h-3" /></button>
                              <button onClick={(e) => { e.stopPropagation(); removeClip(c.id);   }} className="w-5 h-5 rounded bg-black/40 hover:bg-destructive/80 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Audio timeline */}
            {audios.length > 0 && (
              <div className="mt-2 rounded-xl bg-secondary/30 border border-border/40 p-2 min-h-[64px]">
                <div className="flex items-center gap-1 mb-1.5 text-[11px] text-muted-foreground"><FileAudio className="w-3 h-3" /> Audio</div>
                <div className="space-y-1.5">
                  {audios.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background/50 border border-border/40 text-xs">
                      {a.kind === "music" ? <Music className="w-3.5 h-3.5 text-primary" /> : <Volume2 className="w-3.5 h-3.5 text-primary" />}
                      <span className="flex-1 truncate">{a.title}</span>
                      <span className="text-muted-foreground font-mono">{fmt(a.duration)}</span>
                      <input type="range" min={0} max={Math.max(0.1, totalDuration)} step={0.1} value={a.startAt}
                        onChange={(e) => setAudios((p) => p.map((x) => x.id === a.id ? { ...x, startAt: parseFloat(e.target.value) } : x))}
                        className="w-20 accent-primary" title="Décalage" />
                      <input type="range" min={0} max={1} step={0.01} value={a.volume}
                        onChange={(e) => setAudios((p) => p.map((x) => x.id === a.id ? { ...x, volume: parseFloat(e.target.value) } : x))}
                        className="w-16 accent-primary" title="Volume" />
                      <button onClick={() => removeAudio(a.id)} className="w-6 h-6 rounded bg-secondary hover:bg-destructive/80 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: inspector */}
          <aside className="rounded-xl border border-border/40 bg-card/50 p-4 overflow-y-auto">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Sélectionne un clip pour le modifier.</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Clip</div>
                  <div className="text-sm font-medium truncate">{selected.name}</div>
                  <div className="text-xs text-muted-foreground">{selected.duration.toFixed(2)}s · {selected.width}×{selected.height}</div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-2">Découpe</div>
                  <RangeRow label="Début" value={selected.inPoint} max={selected.outPoint - 0.1}
                    onChange={(v) => updateClip(selected.id, { inPoint: v })} />
                  <RangeRow label="Fin" value={selected.outPoint} max={selected.duration} min={selected.inPoint + 0.1}
                    onChange={(v) => updateClip(selected.id, { outPoint: v })} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium">Texte</div>
                    <button onClick={addOverlay} className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 flex items-center gap-1">
                      <Type className="w-3 h-3" /> Ajouter
                    </button>
                  </div>
                  {selected.overlays.length === 0 ? <p className="text-xs text-muted-foreground">Aucun texte.</p> : (
                    <div className="space-y-2">
                      {selected.overlays.map((o) => (
                        <div key={o.id} className="rounded-lg border border-border/60 bg-secondary/30 p-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <input type="text" value={o.text} onChange={(e) => updateOverlay(o.id, { text: e.target.value })}
                              className="flex-1 h-8 px-2 rounded bg-background border border-border/60 text-sm focus:outline-none focus:border-primary" />
                            <input type="color" value={o.color} onChange={(e) => updateOverlay(o.id, { color: e.target.value })}
                              className="w-8 h-8 rounded cursor-pointer bg-transparent" />
                            <button onClick={() => removeOverlay(o.id)} className="w-8 h-8 rounded bg-secondary hover:bg-destructive/80 flex items-center justify-center">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                            <NumRow label="X" value={o.x} min={0} max={1} step={0.01} onChange={(v) => updateOverlay(o.id, { x: v })} />
                            <NumRow label="Y" value={o.y} min={0} max={1} step={0.01} onChange={(v) => updateOverlay(o.id, { y: v })} />
                            <NumRow label="Taille" value={o.size} min={16} max={200} step={1} onChange={(v) => updateOverlay(o.id, { size: v })} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

/* ============================== Subs ============================== */

function RangeRow({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] text-muted-foreground mb-1"><span>{label}</span><span className="font-mono">{value.toFixed(2)}s</span></div>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-primary" />
    </div>
  );
}
function NumRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-7 px-1.5 rounded bg-background border border-border/60 text-xs focus:outline-none focus:border-primary" />
    </label>
  );
}

/* ============================== Helpers ============================== */

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 100);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}
function pickMime(): string {
  const cands = ["video/mp4;codecs=h264", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const c of cands) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  return "video/webm";
}
function loadVideoClip(file: File): Promise<Clip> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.src = url; v.crossOrigin = "anonymous"; v.muted = true; v.playsInline = true; v.preload = "auto";
    v.onloadedmetadata = () => {
      const d = isFinite(v.duration) ? v.duration : 0;
      res({ id: crypto.randomUUID(), name: file.name, url, duration: d,
        width: v.videoWidth || 1280, height: v.videoHeight || 720,
        inPoint: 0, outPoint: d, overlays: [], el: v });
    };
    v.onerror = () => rej(new Error("Lecture vidéo impossible"));
  });
}
function loadAudioFile(file: File): Promise<AudioTrack> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("audio");
    a.src = url; a.crossOrigin = "anonymous"; a.preload = "auto";
    a.onloadedmetadata = () => {
      res({ id: crypto.randomUUID(), title: file.name, url,
        duration: isFinite(a.duration) ? a.duration : 0,
        startAt: 0, volume: 1, kind: "imported", el: a });
    };
    a.onerror = () => rej(new Error("Lecture audio impossible"));
  });
}
function loadAudioFromUrl(url: string, title: string, kind: "music" | "sfx"): Promise<AudioTrack> {
  return new Promise((res, rej) => {
    const a = document.createElement("audio");
    a.src = url; a.crossOrigin = "anonymous"; a.preload = "auto";
    a.onloadedmetadata = () => {
      res({ id: crypto.randomUUID(), title, url,
        duration: isFinite(a.duration) ? a.duration : 0,
        startAt: 0, volume: 0.8, kind, el: a });
    };
    a.onerror = () => rej(new Error("Audio inaccessible"));
  });
}
function cloneVideoEl(src: Clip): HTMLVideoElement {
  const v = document.createElement("video");
  v.src = src.url; v.crossOrigin = "anonymous"; v.muted = true; v.playsInline = true; v.preload = "auto";
  return v;
}
function seekVideoTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    if (Math.abs(v.currentTime - t) < 0.01) return res();
    const h = () => { v.removeEventListener("seeked", h); res(); };
    v.addEventListener("seeked", h);
    try { v.currentTime = t; } catch { v.removeEventListener("seeked", h); res(); }
  });
}