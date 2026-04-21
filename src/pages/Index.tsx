import { useState, useRef, useEffect } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { ChatOrb } from "@/components/chatbot/ChatOrb";
import { ChatInput } from "@/components/chatbot/ChatInput";
import { SuggestionPills } from "@/components/chatbot/SuggestionPills";
import { ChatMessageItem } from "@/components/chatbot/ChatMessage";
import { chatService, ChatMessage } from "@/services";
import { Expand, Settings2, Sparkles } from "lucide-react";

export default function Index() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Start assistant message
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
    ]);

    abortRef.current = new AbortController();

    let accumulated = "";
    await chatService.streamChat({
      messages: messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }))
        .concat([{ role: "user", content: content.trim() }]),
      onDelta: (chunk) => {
        accumulated += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m))
        );
      },
      onWidgets: (widgets) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, widgets } : m))
        );
      },
      onDone: () => setIsLoading(false),
      onError: (err) => {
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "❌ " + err.message }
              : m
          )
        );
      },
      signal: abortRef.current.signal,
    });
  };

  const handleSuggestion = (text: string) => sendMessage(text);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <Header />

      <main className="ml-[72px] pt-14 min-h-screen flex">
        {/* Main chat area */}
        <div className="flex-1 flex flex-col relative">
          {/* Title bar */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                AI Chatbot
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Ask anything about your data and analytics
              </p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium flex items-center gap-2 hover:bg-secondary/80 transition-colors">
                <Expand className="w-4 h-4" />
                Fullscreen
              </button>
              <button className="px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium flex items-center gap-2 hover:bg-secondary/80 transition-colors">
                <Settings2 className="w-4 h-4" />
                Options
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 px-6 overflow-y-auto pb-80">
            {messages.length === 0 ? (
              // Empty state with orb
              <div className="h-full flex flex-col items-center justify-center">
                <ChatOrb isLoading={isLoading} />
                <p className="text-muted-foreground text-sm mt-4">
                  Your AI assistant is ready
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <ChatMessageItem key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 bg-gradient-to-t from-background via-background to-transparent">
            <div className="max-w-3xl mx-auto">
              <ChatInput onSend={sendMessage} disabled={isLoading} />

              {/* Suggestions */}
              <div className="mt-4">
                <p className="text-center text-xs text-muted-foreground mb-3 flex items-center justify-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Try asking:
                </p>
                <SuggestionPills onSelect={handleSuggestion} />
              </div>

              {/* Footer hint */}
              <p className="text-center text-xs text-muted-foreground/60 mt-4">
                Click + to attach · Use mic for voice · Hover messages to edit/copy
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
