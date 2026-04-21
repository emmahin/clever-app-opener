import { ChatMessage as ChatMessageType } from "@/services";
import { MessageWidgets } from "./MessageWidgets";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import { ThinkingIndicator } from "./ThinkingIndicator";

interface ChatMessageProps {
  message: ChatMessageType;
  isThinking?: boolean;
}

export function ChatMessageItem({ message, isThinking }: ChatMessageProps) {
  const isUser = message.role === "user";
  const hasContent = !!message.content;
  const hasWidgets = !!message.widgets?.length;

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
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
                <TypewriterMarkdown text={message.content} />
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
