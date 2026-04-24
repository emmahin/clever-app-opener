import { ChatMessage as ChatMessageType } from "@/services";
import { MessageWidgets } from "./MessageWidgets";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import { ThinkingIndicator } from "./ThinkingIndicator";
import ReactMarkdown from "react-markdown";
import { useSettings } from "@/contexts/SettingsProvider";

interface ChatMessageProps {
  message: ChatMessageType;
  isThinking?: boolean;
}

export function ChatMessageItem({ message, isThinking }: ChatMessageProps) {
  const { settings } = useSettings();
  const isUser = message.role === "user";
  const hasContent = !!message.content;
  const hasWidgets = !!message.widgets?.length;

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
        "flex w-full scroll-mt-24 rounded-2xl transition-shadow",
        isUser ? "justify-end" : isRichAssistant ? "justify-center" : "justify-start",
      )}
    >
      <div
        className={cn(
          "rounded-2xl px-4 py-3",
          isRichAssistant ? "w-full max-w-[95%]" : "max-w-[85%]",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : isRichAssistant
            ? "glass text-foreground"
            : "glass text-foreground rounded-bl-md"
        )}
      >
        {isUser ? (
          <p className="text-sm">{message.content}</p>
        ) : (
          <>
            {isThinking && !hasContent && !hasWidgets && (
              <ThinkingIndicator />
            )}
            {hasWidgets && <MessageWidgets widgets={message.widgets!} messageId={message.id} />}
            {hasContent && (
              <div className={hasWidgets ? "mt-3" : ""}>
                {settings.typewriter ? (
                  <TypewriterMarkdown text={message.content} />
                ) : (
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
