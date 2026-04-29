import { useState, useRef, useEffect } from "react";
import { Plus, Globe, Sparkles, Code, Mic, X, FileText, Image as ImageIcon, Music, Loader2, AudioLines, Brain, Wand2, Camera, Folder, FileType2, FolderTree } from "lucide-react";
import { voiceService, ChatAttachment } from "@/services";
import { useLanguage } from "@/i18n/LanguageProvider";
import { processFile } from "@/lib/attachments";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TokenCounter, estimateTokens } from "./TokenCounter";

export interface SendOptions {
  webSearch?: boolean;
  deepThink?: boolean;
  forceTool?: "image" | "code" | null;
}

interface ChatInputProps {
  onSend: (
    message: string,
    attachments?: ChatAttachment[],
    options?: SendOptions,
    rawFiles?: File[],
  ) => void;
  disabled?: boolean;
  onOpenVoiceCall?: () => void;
}

export function ChatInput({ onSend, disabled, onOpenVoiceCall }: ChatInputProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  // Fichiers bruts conservés pour les usages locaux (ex : tri + export ZIP).
  // Pas envoyés à l'IA pour économiser les tokens.
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const [nextTool, setNextTool] = useState<"image" | "code" | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  // (Push-to-talk Ctrl retiré : on garde la touche Ctrl pour les raccourcis
  // natifs du navigateur comme Ctrl+V, Ctrl+C, Ctrl+A, Ctrl+Z, etc.)

  // Écoute "Répondre" depuis une bulle de message : on pré-remplit l'input avec une citation.
  useEffect(() => {
    const onQuote = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) return;
      const quoted = detail.text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      setValue((v) => (v ? `${v}\n\n${quoted}\n\n` : `${quoted}\n\n`));
      setTimeout(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      }, 0);
    };
    window.addEventListener("nex:quoteReply", onQuote as EventListener);
    return () => window.removeEventListener("nex:quoteReply", onQuote as EventListener);
  }, []);

  // Visualisation audio + dur\u00e9e
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array(28).fill(0));
  const [transcribing, setTranscribing] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);

  const startVisualizer = () => {
    const stream = voiceService.getStream?.();
    if (!stream) {
      console.warn("[ChatInput] startVisualizer: no stream available");
      return;
    }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      // Sur certains navigateurs (Safari/iOS), l'AudioContext démarre en
      // "suspended" tant qu'aucune interaction ne l'a réveillé.
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const BARS = 28;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        const slice = Math.floor(data.length / BARS);
        const bars: number[] = [];
        for (let i = 0; i < BARS; i++) {
          let sum = 0;
          for (let j = 0; j < slice; j++) {
            const v = (data[i * slice + j] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / slice);
          bars.push(Math.min(1, rms * 4));
        }
        setWaveform(bars);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("Visualizer init failed", e);
    }
  };

  const stopVisualizer = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    setWaveform(Array(28).fill(0));
  };

  const startTimer = () => {
    recordStartRef.current = Date.now();
    setRecordSeconds(0);
    timerRef.current = window.setInterval(() => {
      setRecordSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000));
    }, 250);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const handleSend = () => {
    if ((!value.trim() && attachments.length === 0) || disabled || processing) return;
    onSend(
      value.trim() || (attachments.length ? "Analyse les fichiers joints." : ""),
      attachments.length ? attachments : undefined,
      { webSearch, deepThink, forceTool: nextTool },
      rawFiles.length ? rawFiles : undefined,
    );
    setValue("");
    setAttachments([]);
    setRawFiles([]);
    setNextTool(null); // one-shot
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Coller des images / fichiers depuis le presse-papiers (Ctrl+V).
  // Si du texte est aussi présent, on laisse le comportement natif insérer le texte.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    handleFiles(dt.files);
    toast.success(files.length > 1 ? `${files.length} fichiers collés` : "Image collée");
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setProcessing(true);
    const arr = Array.from(files);
    // Conserve TOUJOURS les fichiers bruts (utile pour le tri + ZIP local, sans tokens).
    setRawFiles((prev) => [...prev, ...arr]);
    const next: ChatAttachment[] = [];
    for (const file of arr) {
      try {
        const att = await processFile(file);
        next.push(att);
      } catch (err: any) {
        // Fichiers non-supportés par processFile (ex : .docx, .xlsx) :
        // on les garde quand même dans rawFiles pour le tri local.
        console.warn("processFile skipped:", file.name, err?.message);
      }
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
    setProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    // On retire aussi le fichier brut correspondant au même index si possible.
    setRawFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      stopVisualizer();
      stopTimer();
      setTranscribing(true);
      try {
        const text = await voiceService.stopAndTranscribe();
        setValue((v) => v + text);
      } catch (err) {
        console.error("Voice error:", err);
      } finally {
        setTranscribing(false);
      }
    } else {
      setIsRecording(true);
      try {
        await voiceService.startRecording();
        startVisualizer();
        startTimer();
      } catch (err: any) {
        setIsRecording(false);
        toast.error(err?.message || "Erreur micro");
      }
    }
  };

  // Les raccourcis natifs du navigateur (Ctrl+V coller, Ctrl+C copier,
  // Ctrl+A tout sélectionner, Ctrl+Z annuler, etc.) restent disponibles
  // dans la zone de saisie. Le push-to-talk via Ctrl a été retiré pour
  // ne pas entrer en conflit avec ces raccourcis.

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="relative">
      <div
        className="rounded-2xl p-4 shadow-elegant border border-primary/50 backdrop-blur-xl bg-gradient-to-br from-primary/40 via-accent/30 to-teal-400/40 ring-1 ring-primary/30"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {/* Attachments preview */}
        {(attachments.length > 0 || processing) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg pl-2 pr-1 py-1 text-xs"
              >
                {a.kind === "image" ? (
                  <img src={(a as any).dataUrl} alt={a.name} className="w-8 h-8 rounded object-cover" />
                ) : a.kind === "audio" ? (
                  <Music className="w-4 h-4 text-primary" />
                ) : (
                  <FileText className="w-4 h-4 text-primary" />
                )}
                <span className="max-w-[160px] truncate text-foreground">{a.name}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  title={t("remove")}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {processing && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("processingFile")}
              </div>
            )}
          </div>
        )}

        {/* Overlay enregistrement / transcription */}
        {(isRecording || transcribing) && (
          <div className="mb-3 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/30">
            {isRecording ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
                </span>
                <div className="flex items-end gap-[3px] h-8 flex-1">
                  {waveform.map((v, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-gradient-to-t from-primary to-teal-400 transition-all duration-75"
                      style={{ height: `${Math.max(6, v * 100)}%` }}
                    />
                  ))}
                </div>
                <span className="text-sm font-mono tabular-nums text-foreground/90 min-w-[42px] text-right">
                  {String(Math.floor(recordSeconds / 60)).padStart(2, "0")}:
                  {String(recordSeconds % 60).padStart(2, "0")}
                </span>
              </>
            ) : (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-foreground/90">Transcription…</span>
              </>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t("askAnything")}
          rows={2}
          disabled={disabled}
          className="w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none focus:outline-none text-base"
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,audio/*,application/pdf,text/*,.md,.csv,.json,.log"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={docInputRef}
          type="file"
          accept="application/pdf,text/*,.md,.csv,.json,.log,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.rtf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error - non-standard but supported by Chromium/WebKit
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <TooltipProvider delayDuration={150}>
            <div className="flex items-center gap-2">
              <Popover open={plusOpen} onOpenChange={setPlusOpen}>
                <PopoverTrigger asChild>
                  <button
                    disabled={processing}
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-50",
                      "bg-gradient-to-br from-primary/20 to-teal-500/20 border border-primary/30",
                      "text-primary hover:scale-105 hover:shadow-lg hover:shadow-primary/20",
                      plusOpen && "scale-105 shadow-lg shadow-primary/30 ring-2 ring-primary/40",
                    )}
                    aria-label={t("attachFile")}
                  >
                    <Plus className={cn("w-4 h-4 transition-transform", plusOpen && "rotate-45")} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-72 p-2 rounded-2xl">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setPlusOpen(false); cameraInputRef.current?.click(); }}
                      className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-all hover:scale-[1.02] text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/30 to-orange-500/20 border border-rose-500/30 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                        <Camera className="w-4 h-4 text-rose-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground">Photo</div>
                        <div className="text-[10px] text-muted-foreground">Appareil photo</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setPlusOpen(false); galleryInputRef.current?.click(); }}
                      className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-all hover:scale-[1.02] text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                        <ImageIcon className="w-4 h-4 text-cyan-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground">Galerie</div>
                        <div className="text-[10px] text-muted-foreground">Image / vidéo</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setPlusOpen(false); docInputRef.current?.click(); }}
                      className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-all hover:scale-[1.02] text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/30 to-cyan-500/20 border border-sky-500/30 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                        <FileType2 className="w-4 h-4 text-sky-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground">Document</div>
                        <div className="text-[10px] text-muted-foreground">PDF, Word, Excel…</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setPlusOpen(false); audioInputRef.current?.click(); }}
                      className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-all hover:scale-[1.02] text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/30 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                        <Music className="w-4 h-4 text-emerald-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground">Audio</div>
                        <div className="text-[10px] text-muted-foreground">MP3, WAV…</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setPlusOpen(false); fileInputRef.current?.click(); }}
                      className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-all hover:scale-[1.02] text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/30 to-yellow-500/20 border border-amber-500/30 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                        <Folder className="w-4 h-4 text-amber-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground">Tous fichiers</div>
                        <div className="text-[10px] text-muted-foreground">Tout type</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setPlusOpen(false); folderInputRef.current?.click(); }}
                      className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-all hover:scale-[1.02] text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-blue-500/20 border border-indigo-500/30 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                        <FolderTree className="w-4 h-4 text-indigo-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground">Dossier</div>
                        <div className="text-[10px] text-muted-foreground">Tout un répertoire</div>
                      </div>
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center mt-2 px-2">{t("attachmentsHint")}</p>
                </PopoverContent>
              </Popover>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setWebSearch((v) => !v)}
                    className={cn(
                      "h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs transition-colors",
                      webSearch
                        ? "bg-primary/20 text-primary border border-primary/40"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                    )}
                  >
                    <Globe className="w-4 h-4" />
                    {webSearch && <span className="font-medium">{t("webSearch")}</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" />
                    <span>{webSearch ? t("webSearchOn") : t("webSearchOff")}</span>
                  </div>
                </TooltipContent>
              </Tooltip>

              <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs transition-colors",
                      (deepThink || nextTool)
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                    )}
                  >
                    <Sparkles className="w-4 h-4" />
                    {(deepThink || nextTool) && (
                      <span className="font-medium">
                        {nextTool === "image" ? t("toolImage") : nextTool === "code" ? t("toolCode") : t("toolDeepThink")}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-64 p-1">
                  <button
                    onClick={() => { setDeepThink((v) => !v); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-accent transition-colors",
                      deepThink && "bg-teal-500/10",
                    )}
                  >
                    <Brain className="w-4 h-4 text-teal-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{t("toolDeepThink")}</div>
                      <div className="text-[11px] text-muted-foreground">{t("toolDeepThinkHint")}</div>
                    </div>
                    <div className={cn(
                      "w-3 h-3 rounded-full border",
                      deepThink ? "bg-teal-500 border-teal-500" : "border-muted-foreground",
                    )} />
                  </button>
                  <button
                    onClick={() => { setNextTool(nextTool === "image" ? null : "image"); setToolsOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-accent transition-colors",
                      nextTool === "image" && "bg-teal-500/10",
                    )}
                  >
                    <Wand2 className="w-4 h-4 text-teal-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{t("toolImage")}</div>
                      <div className="text-[11px] text-muted-foreground">{t("toolImageHint")}</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { setNextTool(nextTool === "code" ? null : "code"); setToolsOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-accent transition-colors",
                      nextTool === "code" && "bg-teal-500/10",
                    )}
                  >
                    <Code className="w-4 h-4 text-teal-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{t("toolCode")}</div>
                      <div className="text-[11px] text-muted-foreground">{t("toolCodeHint")}</div>
                    </div>
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </TooltipProvider>

          <TooltipProvider delayDuration={150}>
            <div className="flex items-center gap-2">
            {/* Compteur de tokens estimé pour le message en cours */}
            <TokenCounter
              text={value}
              extra={attachments.reduce((acc, a) => {
                if (a.kind === "image") return acc + 256; // coût visuel approx.
                if (a.kind === "document" || a.kind === "audio") return acc + estimateTokens((a as any).text || "");
                return acc;
              }, 0)}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleRecording}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                    isRecording
                      ? "bg-destructive text-destructive-foreground animate-pulse"
                      : "bg-primary text-primary-foreground hover:scale-105"
                  )}
                >
                  <Mic className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5" />
                  <span>{isRecording ? t("stopRecording") : t("startVoice")}</span>
                </div>
              </TooltipContent>
            </Tooltip>
            {onOpenVoiceCall && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onOpenVoiceCall}
                    className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                  >
                    <AudioLines className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="flex items-center gap-2">
                    <AudioLines className="w-3.5 h-3.5" />
                    <span>{t("voiceCall")}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            </div>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
