import { ChatMessage as ChatMessageType } from "@/services";
import { MessageWidgets } from "./MessageWidgets";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import { ThinkingIndicator } from "./ThinkingIndicator";
import ReactMarkdown from "react-markdown";
import { useSettings } from "@/contexts/SettingsProvider";
import { useState } from "react";
import { Copy, Check, RotateCcw, Pencil, X, Send, Reply } from "lucide-react";
import { toast } from "sonner";

interface ChatMessageProps {
  message: ChatMessageType;
  isThinking?: boolean;
  onRegenerate?: (messageId: string) => void;
  onEditAndResend?: (messageId: string, newContent: string) => void;
}

export function ChatMessageItem({ message, isThinking, onRegenerate, onEditAndResend }: ChatMessageProps) {
  const { settings } = useSettings();
  const isUser = message.role === "user";
  const hasContent = !!message.content;
  const hasWidgets = !!message.widgets?.length;
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Impossible de copier");
    }
  };

  const startEdit = () => {
    setDraft(message.content);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(message.content);
  };

  const submitEdit = () => {
    const next = draft.trim();
    if (!next) return;
    setIsEditing(false);
    onEditAndResend?.(message.id, next);
  };

  const showActions = hasContent && !isThinking;

  // Bulles riches (galerie, actus, marchés, image, sources web) → centrées et larges
  const isRichAssistant =
    !isUser &&
    hasWidgets &&
    message.widgets!.some((w) =>
      ["image_gallery", "news", "stocks", "image", "web_sources", "videos", "organize_files"].includes(w.type as string),
    );

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        "group/msg flex w-full flex-col scroll-mt-24",
        isUser ? "items-end" : isRichAssistant ? "items-center" : "items-start",
      )}
    >
      <div
        className={cn(
          "rounded-2xl px-4 py-3 transition-shadow",
          isRichAssistant
            ? "w-full max-w-full"
            : isUser
            ? "max-w-[85%]"
            : "max-w-[92%] w-full",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : isRichAssistant
            ? "glass text-foreground"
            : "glass text-foreground rounded-bl-md",
        )}
      >
        {isUser ? (
          isEditing ? (
            <div className="flex flex-col gap-2 min-w-[260px]">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(8, Math.max(2, draft.split("\n").length))}
                className="w-full bg-background/20 border border-primary-foreground/30 rounded-lg p-2 text-sm text-primary-foreground placeholder:text-primary-foreground/60 outline-none focus:border-primary-foreground/60 resize-y"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitEdit();
                  } else if (e.key === "Escape") {
                    cancelEdit();
                  }
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={cancelEdit}
                  className="px-2.5 py-1 rounded-md bg-background/10 hover:bg-background/20 text-xs flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Annuler
                </button>
                <button
                  onClick={submitEdit}
                  className="px-2.5 py-1 rounded-md bg-background text-foreground hover:bg-background/90 text-xs flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" /> Renvoyer
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          )
        ) : (
          <>
            {isThinking && !hasContent && !hasWidgets && <ThinkingIndicator />}
            {hasWidgets && <MessageWidgets widgets={message.widgets!} messageId={message.id} />}
            {hasContent && (
              <div className={hasWidgets ? "mt-3" : ""}>
                {settings.typewriter ? (
                  <TypewriterMarkdown text={message.content} />
                ) : (
                  <div className="prose prose-sm prose-invert max-w-none leading-relaxed prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-li:my-1 prose-ul:my-2 prose-ol:my-2 prose-pre:my-2">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showActions && !isEditing && (
        <div
          className={cn(
            "mt-1 flex items-center gap-1 px-1 transition-opacity",
            isUser
              ? "opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100"
              : "opacity-70 hover:opacity-100",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <button
            onClick={handleCopy}
            title="Copier"
            aria-label="Copier le message"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("nex:quoteReply", { detail: { text: message.content } }),
              );
            }}
            title="Répondre"
            aria-label="Répondre à ce message"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          {isUser && onEditAndResend && (
            <button
              onClick={startEdit}
              title="Modifier et renvoyer"
              aria-label="Modifier et renvoyer"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {!isUser && onRegenerate && (
            <button
              onClick={() => onRegenerate(message.id)}
              title="Régénérer la réponse"
              aria-label="Régénérer la réponse"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
