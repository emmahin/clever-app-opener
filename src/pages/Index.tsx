import { useState, useRef, useEffect } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { ChatOrb } from "@/components/chatbot/ChatOrb";
import { ChatInput } from "@/components/chatbot/ChatInput";
import { SuggestionPills } from "@/components/chatbot/SuggestionPills";
import { ChatMessageItem } from "@/components/chatbot/ChatMessage";
import { HeaderSearch } from "@/components/chatbot/HeaderSearch";
import { chatService, ChatMessage, ChatAttachment } from "@/services";
import { Expand, Settings2, Sparkles } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useSettings } from "@/contexts/SettingsProvider";
import { VoiceCallMode } from "@/components/chatbot/VoiceCallMode";

export default function Index() {
  const { lang, t } = useLanguage();
  const { settings } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages]);

  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1500);
    }
  };

  const sendMessage = async (
    content: string,
    attachments?: ChatAttachment[],
    options?: { webSearch?: boolean; deepThink?: boolean; forceTool?: "image" | "code" | null },
  ) => {
    if (!content.trim() && !attachments?.length) return;

    // Add user message
    const attachmentSummary = attachments?.length
      ? "\n\n" + attachments.map((a) => `📎 ${a.name}`).join("\n")
      : "";
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim() + attachmentSummary,
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
      lang,
      detailLevel: settings.detailLevel,
      customInstructions: settings.customInstructions,
      aiName: settings.aiName,
      attachments,
      webSearch: options?.webSearch,
      deepThink: options?.deepThink,
      forceTool: options?.forceTool ?? null,
    });
  };

  const handleSuggestion = (text: string) => sendMessage(text);

  const handleNewChat = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <Header
        onNewChat={handleNewChat}
        searchSlot={
          <HeaderSearch
            messages={messages}
            onJumpToMessage={jumpToMessage}
            onSuggestion={(text) => sendMessage(text)}
          />
        }
      />

      <main className="ml-[72px] pt-14 min-h-screen flex">
        {/* Main chat area */}
        <div className="flex-1 flex flex-col relative">
          {/* Floating title + actions (no background bar) */}
          <div className="absolute top-0 left-0 right-0 px-6 py-4 flex items-start justify-between pointer-events-none z-20">
            <div className="pointer-events-auto">
              <h1 className="text-2xl font-semibold flex items-center gap-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                <Sparkles className="w-6 h-6 text-primary" />
                {settings.aiName || "Jarvis"}
              </h1>
              <p className="text-muted-foreground text-sm mt-1 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                {t("appSubtitle")}
              </p>
            </div>
            <div className="flex gap-2 pointer-events-auto">
              <button className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur-md text-sm font-medium flex items-center gap-2 transition-colors">
                <Expand className="w-4 h-4" />
                {t("fullscreen")}
              </button>
              <button className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur-md text-sm font-medium flex items-center gap-2 transition-colors">
                <Settings2 className="w-4 h-4" />
                {t("options")}
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 px-6 overflow-y-auto pb-80 relative z-0">
            {messages.length === 0 ? (
              // Empty state with orb
              <div className="h-full flex flex-col items-center justify-center -mt-8">
                <ChatOrb isLoading={isLoading} />
                <p className="text-foreground/80 text-sm mt-6 relative z-10 px-4 py-2 rounded-full bg-background/60 backdrop-blur-md">
                  {t("assistantReady")}
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg, idx) => {
                  const isLast = idx === messages.length - 1;
                  const isThinking =
                    isLoading && isLast && msg.role === "assistant";
                  return (
                    <ChatMessageItem
                      key={msg.id}
                      message={msg}
                      isThinking={isThinking}
                    />
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 bg-gradient-to-t from-background via-background to-transparent">
            <div className="max-w-3xl mx-auto">
              <ChatInput onSend={sendMessage} disabled={isLoading} onOpenVoiceCall={() => setVoiceCallOpen(true)} />

              {/* Suggestions */}
              <div className="mt-4">
                <p className="text-center text-xs text-muted-foreground mb-3 flex items-center justify-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {t("tryAsking")}
                </p>
                <SuggestionPills onSelect={handleSuggestion} />
              </div>

              {/* Footer hint */}
              <p className="text-center text-xs text-muted-foreground/60 mt-4">
                {t("inputHint")}
              </p>
            </div>
          </div>
        </div>

      </main>
      <VoiceCallMode open={voiceCallOpen} onClose={() => setVoiceCallOpen(false)} />
    </div>
  );
}
