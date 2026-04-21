import { useState, useRef, useEffect } from "react";
import { Plus, Globe, Sparkles, Code, Mic, X, FileText, Image as ImageIcon, Music, Loader2, AudioLines, Brain, Wand2 } from "lucide-react";
import { voiceService, ChatAttachment } from "@/services";
import { useLanguage } from "@/i18n/LanguageProvider";
import { processFile } from "@/lib/attachments";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SendOptions {
  webSearch?: boolean;
  deepThink?: boolean;
  forceTool?: "image" | "code" | null;
}

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatAttachment[], options?: SendOptions) => void;
  disabled?: boolean;
  onOpenVoiceCall?: () => void;
}

export function ChatInput({ onSend, disabled, onOpenVoiceCall }: ChatInputProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [processing, setProcessing] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const [nextTool, setNextTool] = useState<"image" | "code" | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ctrlHoldingRef = useRef(false);
  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  const handleSend = () => {
    if ((!value.trim() && attachments.length === 0) || disabled || processing) return;
    onSend(
      value.trim() || (attachments.length ? "Analyse les fichiers joints." : ""),
      attachments.length ? attachments : undefined,
      { webSearch, deepThink, forceTool: nextTool },
    );
    setValue("");
    setAttachments([]);
    setNextTool(null); // one-shot
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setProcessing(true);
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const att = await processFile(file);
        next.push(att);
      } catch (err: any) {
        toast.error(err?.message || t("fileError"));
      }
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
    setProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      try {
        const text = await voiceService.stopAndTranscribe();
        setValue((v) => v + text);
      } catch (err) {
        console.error("Voice error:", err);
      }
    } else {
      setIsRecording(true);
      await voiceService.startRecording();
    }
  };

  // Raccourci clavier : maintenir Ctrl pour enregistrer la voix (push-to-talk)
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      // Uniquement si Ctrl est appuy\u00e9 seul (pas Ctrl+C, Ctrl+V, etc.)
      if (
        e.key === "Control" &&
        !e.repeat &&
        !ctrlHoldingRef.current &&
        !isRecordingRef.current &&
        !disabled
      ) {
        ctrlHoldingRef.current = true;
        try {
          setIsRecording(true);
          await voiceService.startRecording();
          toast.message("\ud83c\udf99\ufe0f Enregistrement\u2026 rel\u00e2chez Ctrl pour transcrire");
        } catch (err: any) {
          setIsRecording(false);
          ctrlHoldingRef.current = false;
          toast.error(err?.message || "Erreur micro");
        }
      }
    };
    const onKeyUp = async (e: KeyboardEvent) => {
      if (e.key === "Control" && ctrlHoldingRef.current) {
        ctrlHoldingRef.current = false;
        if (isRecordingRef.current) {
          setIsRecording(false);
          try {
            const text = await voiceService.stopAndTranscribe();
            if (text) setValue((v) => (v ? v + " " : "") + text);
          } catch (err) {
            console.error("Voice error:", err);
          }
        }
      }
    };
    const onBlur = () => {
      if (ctrlHoldingRef.current && isRecordingRef.current) {
        ctrlHoldingRef.current = false;
        setIsRecording(false);
        voiceService.stopAndTranscribe().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [disabled]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="relative">
      <div
        className="glass rounded-2xl p-4 shadow-elegant"
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

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
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

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <TooltipProvider delayDuration={150}>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processing}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{t("attachFile")}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t("attachmentsHint")}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{t("attachImage")}</span>
                  </div>
                </TooltipContent>
              </Tooltip>

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
                        ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40"
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
                      deepThink && "bg-fuchsia-500/10",
                    )}
                  >
                    <Brain className="w-4 h-4 text-fuchsia-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{t("toolDeepThink")}</div>
                      <div className="text-[11px] text-muted-foreground">{t("toolDeepThinkHint")}</div>
                    </div>
                    <div className={cn(
                      "w-3 h-3 rounded-full border",
                      deepThink ? "bg-fuchsia-500 border-fuchsia-500" : "border-muted-foreground",
                    )} />
                  </button>
                  <button
                    onClick={() => { setNextTool(nextTool === "image" ? null : "image"); setToolsOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-accent transition-colors",
                      nextTool === "image" && "bg-fuchsia-500/10",
                    )}
                  >
                    <Wand2 className="w-4 h-4 text-fuchsia-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{t("toolImage")}</div>
                      <div className="text-[11px] text-muted-foreground">{t("toolImageHint")}</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { setNextTool(nextTool === "code" ? null : "code"); setToolsOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-accent transition-colors",
                      nextTool === "code" && "bg-fuchsia-500/10",
                    )}
                  >
                    <Code className="w-4 h-4 text-fuchsia-400" />
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
