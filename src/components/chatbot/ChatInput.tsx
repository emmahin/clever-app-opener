import { useState, useRef } from "react";
import { Plus, Globe, Sparkles, Code, Mic, X, FileText, Image as ImageIcon, Music, Loader2 } from "lucide-react";
import { voiceService, ChatAttachment } from "@/services";
import { useLanguage } from "@/i18n/LanguageProvider";
import { processFile } from "@/lib/attachments";
import { toast } from "sonner";

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [processing, setProcessing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((!value.trim() && attachments.length === 0) || disabled || processing) return;
    onSend(value.trim() || (attachments.length ? "Analyse les fichiers joints." : ""), attachments.length ? attachments : undefined);
    setValue("");
    setAttachments([]);
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
              title={t("attachFile")}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              title={t("attachFile")}
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Globe className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Sparkles className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Code className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={toggleRecording}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all",
              isRecording
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-primary text-primary-foreground hover:scale-105"
            )}
            title={isRecording ? t("stopRecording") : t("startVoice")}
          >
            <Mic className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
