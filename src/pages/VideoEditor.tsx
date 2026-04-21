import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import {
  Clapperboard,
  Upload,
  Play,
  Pause,
  Scissors,
  Trash2,
  Type,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface TextOverlay {
  id: string;
  text: string;
  x: number; // 0-1 (relative)
  y: number; // 0-1
  size: number; // px (based on 1080 height)
  color: string;
}

interface Clip {
  id: string;
  name: string;
  url: string;
  duration: number; // s
  width: number;
  height: number;
  inPoint: number; // s
  outPoint: number; // s
  overlays: TextOverlay[];
  /** Hidden HTMLVideoElement used for playback/export. */
  el: HTMLVideoElement;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

const CANVAS_W = 1280;
const CANVAS_H = 720;

export default function VideoEditor() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // global timeline
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<{ wallClock: number; timeline: number } | null>(null);

  const totalDuration = useMemo(
    () => clips.reduce((s, c) => s + Math.max(0, c.outPoint - c.inPoint), 0),
    [clips],
  );

  const selected = clips.find((c) => c.id === selectedId) ?? null;

  /* --------------------------- Import --------------------------- */

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newClips: Clip[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/")) continue;
      try {
        const clip = await loadVideoClip(file);
        newClips.push(clip);
      } catch (e) {
        console.error("Failed to load", file.name, e);
        toast.error(`Impossible de charger ${file.name}`);
      }
    }
    if (newClips.length) {
      setClips((prev) => [...prev, ...newClips]);
      setSelectedId((cur) => cur ?? newClips[0].id);
      toast.success(`${newClips.length} clip(s) ajouté(s)`);
    }
  }, []);

  /* --------------------------- Render frame --------------------------- */

  /** Find which clip + local time corresponds to a global timeline time. */
  const locateAt = useCallback(
    (t: number): { clip: Clip; local: number; index: number } | null => {
      let acc = 0;
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        const len = Math.max(0, c.outPoint - c.inPoint);
        if (t < acc + len) {
          return { clip: c, local: c.inPoint + (t - acc), index: i };
        }
        acc += len;
      }
      // past end → last clip's last frame
      const last = clips[clips.length - 1];
      if (last) return { clip: last, local: last.outPoint, index: clips.length - 1 };
      return null;
    },
    [clips],
  );

  const drawFrame = useCallback(
    (loc: { clip: Clip; local: number } | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!loc) return;
      const { clip } = loc;
      const v = clip.el;

      // Fit (contain) inside canvas
      const ar = clip.width / clip.height;
      const target = canvas.width / canvas.height;
      let dw: number, dh: number;
      if (ar > target) {
        dw = canvas.width;
        dh = canvas.width / ar;
      } else {
        dh = canvas.height;
        dw = canvas.height * ar;
      }
      const dx = (canvas.width - dw) / 2;
      const dy = (canvas.height - dh) / 2;
      try {
        ctx.drawImage(v, dx, dy, dw, dh);
      } catch {
        /* video not ready yet */
      }

      // Overlays
      for (const o of clip.overlays) {
        const fontPx = (o.size / 1080) * canvas.height;
        ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = o.color;
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = fontPx * 0.15;
        ctx.fillText(o.text, o.x * canvas.width, o.y * canvas.height);
        ctx.shadowBlur = 0;
      }
    },
    [],
  );

  /* --------------------------- Playback loop --------------------------- */

  const stopAllVideos = useCallback(() => {
    for (const c of clips) {
      if (!c.el.paused) c.el.pause();
    }
  }, [clips]);

  const seekTo = useCallback(
    async (t: number) => {
      const clamped = Math.max(0, Math.min(totalDuration, t));
      setCurrentTime(clamped);
      const loc = locateAt(clamped);
      if (!loc) {
        drawFrame(null);
        return;
      }
      stopAllVideos();
      const { clip, local } = loc;
      await new Promise<void>((resolve) => {
        const handle = () => {
          clip.el.removeEventListener("seeked", handle);
          resolve();
        };
        clip.el.addEventListener("seeked", handle);
        try {
          clip.el.currentTime = Math.min(local, clip.duration - 0.01);
        } catch {
          resolve();
        }
      });
      drawFrame(loc);
    },
    [drawFrame, locateAt, stopAllVideos, totalDuration],
  );

  const tick = useCallback(() => {
    const start = playStartRef.current;
    if (!start) return;
    const elapsed = (performance.now() - start.wallClock) / 1000;
    const t = start.timeline + elapsed;

    if (t >= totalDuration) {
      setIsPlaying(false);
      setCurrentTime(totalDuration);
      stopAllVideos();
      const last = locateAt(totalDuration - 0.001);
      drawFrame(last);
      return;
    }

    const loc = locateAt(t);
    if (loc) {
      const { clip, local } = loc;
      // Make sure the right clip is the one playing
      for (const c of clips) {
        if (c.id !== clip.id && !c.el.paused) c.el.pause();
      }
      if (clip.el.paused) {
        try {
          clip.el.currentTime = Math.min(local, clip.duration - 0.01);
          clip.el.play().catch(() => {});
        } catch {
          /* ignore */
        }
      }
      // Re-sync if drift > 0.15s
      if (Math.abs(clip.el.currentTime - local) > 0.15) {
        try {
          clip.el.currentTime = Math.min(local, clip.duration - 0.01);
        } catch {
          /* ignore */
        }
      }
      drawFrame(loc);
    }

    setCurrentTime(t);
    rafRef.current = requestAnimationFrame(tick);
  }, [clips, drawFrame, locateAt, stopAllVideos, totalDuration]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      stopAllVideos();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    if (!clips.length) return;
    const startT = currentTime >= totalDuration - 0.05 ? 0 : currentTime;
    setCurrentTime(startT);
    playStartRef.current = { wallClock: performance.now(), timeline: startT };
    setIsPlaying(true);
  }, [clips.length, currentTime, isPlaying, stopAllVideos, totalDuration]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, tick]);

  // Initial frame whenever clips list mutates
  useEffect(() => {
    if (isPlaying) return;
    const loc = locateAt(currentTime);
    drawFrame(loc);
  }, [clips, currentTime, drawFrame, isPlaying, locateAt]);

  /* --------------------------- Clip operations --------------------------- */

  const updateClip = (id: string, patch: Partial<Clip>) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const removeClip = (id: string) => {
    setClips((prev) => {
      const c = prev.find((x) => x.id === id);
      if (c) URL.revokeObjectURL(c.url);
      return prev.filter((x) => x.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  };

  const moveClip = (id: string, dir: -1 | 1) => {
    setClips((prev) => {
      const i = prev.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const splitAtPlayhead = () => {
    if (!clips.length) return;
    const loc = locateAt(currentTime);
    if (!loc) return;
    const { clip, local, index } = loc;
    if (local <= clip.inPoint + 0.05 || local >= clip.outPoint - 0.05) {
      toast.error("Place la tête de lecture à l'intérieur du clip");
      return;
    }
    // Need a second HTMLVideoElement for the right half (same source)
    const right = cloneVideoEl(clip);
    const left: Clip = { ...clip, outPoint: local, id: crypto.randomUUID() };
    const rightClip: Clip = {
      ...clip,
      el: right,
      inPoint: local,
      id: crypto.randomUUID(),
      overlays: [],
    };
    // Replace original (remove its el listener? not needed)
    URL.revokeObjectURL; // noop reference
    setClips((prev) => {
      const next = [...prev];
      next.splice(index, 1, left, rightClip);
      return next;
    });
    toast.success("Clip découpé");
  };

  const addOverlay = () => {
    if (!selected) return;
    const o: TextOverlay = {
      id: crypto.randomUUID(),
      text: "Nouveau texte",
      x: 0.5,
      y: 0.85,
      size: 64,
      color: "#ffffff",
    };
    updateClip(selected.id, { overlays: [...selected.overlays, o] });
  };

  const updateOverlay = (oid: string, patch: Partial<TextOverlay>) => {
    if (!selected) return;
    updateClip(selected.id, {
      overlays: selected.overlays.map((o) => (o.id === oid ? { ...o, ...patch } : o)),
    });
  };

  const removeOverlay = (oid: string) => {
    if (!selected) return;
    updateClip(selected.id, { overlays: selected.overlays.filter((o) => o.id !== oid) });
  };

  /* --------------------------- Export --------------------------- */

  const exportVideo = async () => {
    if (!clips.length || !canvasRef.current) return;
    setExporting(true);
    setIsPlaying(false);
    stopAllVideos();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    try {
      const canvas = canvasRef.current;
      const fps = 30;
      const stream = (canvas as HTMLCanvasElement & {
        captureStream: (fps?: number) => MediaStream;
      }).captureStream(fps);

      const mime = pickMime();
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 5_000_000,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

      const finished = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
      });

      recorder.start(100);

      // Manually advance through the timeline frame by frame
      const totalFrames = Math.ceil(totalDuration * fps);
      for (let f = 0; f < totalFrames; f++) {
        const t = f / fps;
        const loc = locateAt(t);
        if (loc) {
          const { clip, local } = loc;
          await seekVideoTo(clip.el, Math.min(local, clip.duration - 0.01));
          drawFrame(loc);
        }
        // give the encoder a tick
        await new Promise((r) => setTimeout(r, 1000 / fps));
      }

      recorder.stop();
      const blob = await finished;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `montage-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Export terminé");
    } catch (e) {
      console.error(e);
      toast.error("Échec de l'export : " + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  /* --------------------------- Render --------------------------- */

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <main className="ml-[72px] pt-14 min-h-screen flex flex-col">
        {/* Page header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border/40">
          <div className="flex items-center gap-3">
            <Clapperboard className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Montage vidéo</h1>
              <p className="text-xs text-muted-foreground">
                Importe des clips, découpe-les, ajoute du texte et exporte ton montage.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              Importer
              <input
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <button
              onClick={exportVideo}
              disabled={!clips.length || exporting}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {exporting ? "Export…" : "Exporter MP4"}
            </button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex-1 grid grid-cols-[1fr_320px] gap-4 p-4 min-h-0">
          {/* Preview + timeline */}
          <div className="flex flex-col min-h-0">
            <div className="flex-1 flex items-center justify-center bg-black rounded-xl overflow-hidden min-h-0">
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="max-w-full max-h-full"
              />
            </div>

            {/* Transport */}
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={togglePlay}
                disabled={!clips.length}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 hover:opacity-90"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button
                onClick={splitAtPlayhead}
                disabled={!clips.length}
                className="px-3 h-10 rounded-lg bg-secondary text-sm flex items-center gap-2 hover:bg-secondary/80 disabled:opacity-50"
                title="Découper à la tête de lecture"
              >
                <Scissors className="w-4 h-4" />
                Découper
              </button>
              <div className="flex-1">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.01, totalDuration)}
                  step={0.01}
                  value={currentTime}
                  onChange={(e) => {
                    if (isPlaying) togglePlay();
                    seekTo(parseFloat(e.target.value));
                  }}
                  className="w-full accent-primary"
                />
              </div>
              <span className="text-xs text-muted-foreground font-mono w-24 text-right">
                {fmt(currentTime)} / {fmt(totalDuration)}
              </span>
            </div>

            {/* Timeline strip */}
            <div className="mt-3 rounded-xl bg-secondary/30 border border-border/40 p-2 min-h-[88px]">
              {clips.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground py-6">
                  Importe une ou plusieurs vidéos pour commencer
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto">
                  {clips.map((c, i) => {
                    const len = Math.max(0.1, c.outPoint - c.inPoint);
                    const widthPx = Math.max(80, Math.min(280, len * 40));
                    const active = c.id === selectedId;
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        style={{ width: widthPx }}
                        className={`relative flex-shrink-0 h-[72px] rounded-lg border cursor-pointer overflow-hidden ${
                          active
                            ? "border-primary ring-2 ring-primary/40"
                            : "border-border/60 hover:border-border"
                        }`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-fuchsia-500/30" />
                        <div className="relative p-2 flex flex-col h-full justify-between">
                          <div className="text-[11px] font-medium truncate text-white">
                            {i + 1}. {c.name}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-white/80">
                            <span>{len.toFixed(1)}s</span>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveClip(c.id, -1);
                                }}
                                className="w-5 h-5 rounded bg-black/40 hover:bg-black/60 flex items-center justify-center"
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveClip(c.id, 1);
                                }}
                                className="w-5 h-5 rounded bg-black/40 hover:bg-black/60 flex items-center justify-center"
                              >
                                <ChevronRight className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeClip(c.id);
                                }}
                                className="w-5 h-5 rounded bg-black/40 hover:bg-destructive/80 flex items-center justify-center"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Inspector */}
          <aside className="rounded-xl border border-border/40 bg-card/50 p-4 overflow-y-auto">
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Sélectionne un clip dans la timeline pour le modifier.
              </p>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Clip</div>
                  <div className="text-sm font-medium truncate">{selected.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Source : {selected.duration.toFixed(2)}s · {selected.width}×{selected.height}
                  </div>
                </div>

                {/* Trim */}
                <div>
                  <div className="text-xs font-medium mb-2">Découpe (in / out)</div>
                  <div className="space-y-2">
                    <RangeRow
                      label="Début"
                      value={selected.inPoint}
                      max={selected.outPoint - 0.1}
                      onChange={(v) => updateClip(selected.id, { inPoint: v })}
                    />
                    <RangeRow
                      label="Fin"
                      value={selected.outPoint}
                      max={selected.duration}
                      min={selected.inPoint + 0.1}
                      onChange={(v) => updateClip(selected.id, { outPoint: v })}
                    />
                  </div>
                </div>

                {/* Overlays */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium">Texte à l'écran</div>
                    <button
                      onClick={addOverlay}
                      className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 flex items-center gap-1"
                    >
                      <Type className="w-3 h-3" />
                      Ajouter
                    </button>
                  </div>
                  {selected.overlays.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun texte.</p>
                  ) : (
                    <div className="space-y-3">
                      {selected.overlays.map((o) => (
                        <div
                          key={o.id}
                          className="rounded-lg border border-border/60 bg-secondary/30 p-2 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={o.text}
                              onChange={(e) => updateOverlay(o.id, { text: e.target.value })}
                              className="flex-1 h-8 px-2 rounded bg-background border border-border/60 text-sm focus:outline-none focus:border-primary"
                            />
                            <input
                              type="color"
                              value={o.color}
                              onChange={(e) => updateOverlay(o.id, { color: e.target.value })}
                              className="w-8 h-8 rounded cursor-pointer bg-transparent"
                              title="Couleur"
                            />
                            <button
                              onClick={() => removeOverlay(o.id)}
                              className="w-8 h-8 rounded bg-secondary hover:bg-destructive/80 flex items-center justify-center"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                            <NumRow
                              label="X"
                              value={o.x}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(v) => updateOverlay(o.id, { x: v })}
                            />
                            <NumRow
                              label="Y"
                              value={o.y}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(v) => updateOverlay(o.id, { y: v })}
                            />
                            <NumRow
                              label="Taille"
                              value={o.size}
                              min={16}
                              max={200}
                              step={1}
                              onChange={(v) => updateOverlay(o.id, { size: v })}
                            />
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

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function RangeRow({
  label,
  value,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(2)}s</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function NumRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-7 px-1.5 rounded bg-background border border-border/60 text-xs text-foreground focus:outline-none focus:border-primary"
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 100);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function pickMime(): string {
  const candidates = [
    "video/mp4;codecs=h264",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

function loadVideoClip(file: File): Promise<Clip> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.src = url;
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadedmetadata = () => {
      const duration = isFinite(v.duration) ? v.duration : 0;
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        url,
        duration,
        width: v.videoWidth || 1280,
        height: v.videoHeight || 720,
        inPoint: 0,
        outPoint: duration,
        overlays: [],
        el: v,
      });
    };
    v.onerror = () => reject(new Error("Lecture vidéo impossible"));
  });
}

function cloneVideoEl(src: Clip): HTMLVideoElement {
  const v = document.createElement("video");
  v.src = src.url;
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  return v;
}

function seekVideoTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(v.currentTime - t) < 0.01) {
      resolve();
      return;
    }
    const handle = () => {
      v.removeEventListener("seeked", handle);
      resolve();
    };
    v.addEventListener("seeked", handle);
    try {
      v.currentTime = t;
    } catch {
      v.removeEventListener("seeked", handle);
      resolve();
    }
  });
}