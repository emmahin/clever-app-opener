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

  return (
    <div id={`msg-${message.id}`} className={cn("flex w-full scroll-mt-24 rounded-2xl transition-shadow", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
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
            {hasWidgets && <MessageWidgets widgets={message.widgets!} />}
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
