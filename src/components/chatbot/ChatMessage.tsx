import { ChatMessage as ChatMessageType } from "@/services";
import ReactMarkdown from "react-markdown";
import { MessageWidgets } from "./MessageWidgets";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessageItem({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

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
            {message.widgets && <MessageWidgets widgets={message.widgets} />}
            {message.content && (
              <div className="prose prose-sm prose-invert max-w-none mt-3">
                <ReactMarkdown>{message.content}</ReactMarkdown>
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
