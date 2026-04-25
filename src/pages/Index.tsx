import { useState, useRef, useEffect } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { ChatOrb } from "@/components/chatbot/ChatOrb";
import { ChatInput } from "@/components/chatbot/ChatInput";
import { SuggestionPills } from "@/components/chatbot/SuggestionPills";
import { ChatMessageItem } from "@/components/chatbot/ChatMessage";
import { HeaderSearch } from "@/components/chatbot/HeaderSearch";
import { chatService, ChatMessage, ChatAttachment } from "@/services";
import { Expand, Minimize2, Settings2, Sparkles, MessageSquarePlus, Trash2, SlidersHorizontal, PhoneCall } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useSettings } from "@/contexts/SettingsProvider";
import { VoiceCallMode } from "@/components/chatbot/VoiceCallMode";
import { ProjectsBar } from "@/components/chatbot/ProjectsBar";
import { useNavigate } from "react-router-dom";
import { notificationService } from "@/services/notificationService";
import { scheduleService } from "@/services/scheduleService";
import { organizeLocally } from "@/lib/localOrganizer";
import { registerOrganizeFiles } from "@/lib/organizeRegistry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function extractLocalExecutableRequest(content: string): { target: string; label: string } | null {
  const text = content.trim();
  if (!/\b(ouvre|ouvrir|lance|lancer|d[ée]marre|start|open|launch)\b/i.test(text)) return null;

  const pathMatch = text.match(/([a-zA-Z]:\\[^\n"'`]+?\.(?:exe|lnk|url|bat|cmd|msi))\b/i);
  const target = pathMatch?.[1]?.trim() || text.match(/(?:ouvre|ouvrir|lance|lancer|d[ée]marre|start|open|launch)\s+(?:l['’]application\s+|le\s+programme\s+)?([^\s"'`]+?\.(?:exe|lnk|url|bat|cmd|msi))\b/i)?.[1]?.trim();

  if (!target) return null;
  const label = target.split(/[\\/]/).pop() || target;
  return { target, label };
}

export default function Index() {
  const { lang, t } = useLanguage();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Track fullscreen state
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.error("Fullscreen error", e);
    }
  };

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
    rawFiles?: File[],
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

    const localExecutable = extractLocalExecutableRequest(content);
    if (localExecutable) {
      setMessages((prev) => [...prev, userMsg]);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Je tente d'ouvrir **${localExecutable.label}** via l'agent local.`,
          createdAt: Date.now(),
          widgets: [{ type: "launch_local_app", target: localExecutable.target, label: localExecutable.label }],
        },
      ]);
      return;
    }

    // ─── Tri 100 % local : interception avant tout appel à l'IA ───
    // Si l'utilisateur joint au moins 2 fichiers ET demande un tri/organisation,
    // on traite la requête entièrement côté client. 0 token consommé.
    const ORGANIZE_RE = /\b(trie(?:r|z)?|tri|organis(?:e|er|ez|é|ée)?|range(?:r|z)?|class(?:e|er|ez|é|ée)?|sort|organize|arrange)\b/i;
    if (rawFiles && rawFiles.length >= 2 && ORGANIZE_RE.test(content)) {
      setMessages((prev) => [...prev, userMsg]);
      // Détecte l'option « par année » dans la consigne.
      const groupByYear = /\bann[ée]e?s?\b/i.test(content);
      const paths = rawFiles.map((f) => (f as any).webkitRelativePath || f.name);
      const result = organizeLocally(paths, { groupByYear, useSubcategories: true });
      const assistantId = crypto.randomUUID();
      registerOrganizeFiles(assistantId, rawFiles);
      const summary =
        `**Tri local effectué** sur ${result.stats.total} fichiers — *0 token utilisé*.\n\n` +
        `Vous pouvez télécharger l'arborescence proposée en ZIP via le bouton ci-dessus.`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: summary,
        createdAt: Date.now(),
        widgets: [
          {
            type: "organize_files",
            root_name: result.rootName,
            total: result.stats.total,
            categories: result.stats.categories,
            mapping: result.mapping,
            explanation: result.explanation,
            messageId: assistantId,
          },
        ],
      };
      setMessages((prev) => [...prev, assistantMsg]);
      return;
    }

    // Construit l'historique à envoyer à l'IA à partir de l'état le plus récent.
    // On retire les messages assistant vides (résultat d'erreurs précédentes) ET
    // on s'assure de ne jamais envoyer 2 messages "user" consécutifs (Gemini bug).
    const rawHistory = [...messagesRef.current, userMsg].filter(
      (m) => m.content && m.content.trim(),
    );
    // Sliding window : on ne garde que les 8 derniers messages pour limiter les tokens.
    // Les plus anciens sont remplacés par un court résumé système.
    const WINDOW_SIZE = 8;
    const trimmed = rawHistory.length > WINDOW_SIZE
      ? rawHistory.slice(-WINDOW_SIZE)
      : rawHistory;
    const historyForAI: { role: "user" | "assistant" | "system"; content: string }[] = [];
    if (rawHistory.length > WINDOW_SIZE) {
      const dropped = rawHistory.length - WINDOW_SIZE;
      historyForAI.push({
        role: "system",
        content: `[Contexte] Cette conversation contient ${dropped} message(s) plus ancien(s) non transmis pour limiter les tokens. Demande à l'utilisateur s'il a besoin de revenir dessus.`,
      });
    }
    for (const m of trimmed) {
      const last = historyForAI[historyForAI.length - 1];
      // Tronque les messages > 2000 caractères dans l'historique pour économiser les tokens.
      // Le message courant (dernier user) n'est PAS tronqué pour préserver la requête.
      const isCurrent = m === trimmed[trimmed.length - 1];
      const MAX = 2000;
      const safeContent =
        !isCurrent && m.content.length > MAX
          ? m.content.slice(0, MAX) + `\n\n[…tronqué — ${m.content.length - MAX} caractères]`
          : m.content;
      if (last && last.role === m.role) {
        // Fusionne deux messages consécutifs du même rôle pour éviter un refus de l'IA
        last.content = `${last.content}\n\n${safeContent}`;
      } else {
        historyForAI.push({ role: m.role, content: safeContent });
      }
    }

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
      messages: historyForAI,
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
      onDone: () => {
        setIsLoading(false);
        if (typeof document !== "undefined" && document.hidden) {
          const preview = accumulated.replace(/[#*`>_\-]/g, "").trim().slice(0, 140);
          notificationService.notify({
            type: "chat_response",
            title: `${settings.aiName || "Nex"} a répondu`,
            body: preview || "Ta réponse est prête.",
            source: settings.aiName || "Nex",
            actionUrl: "/",
          });
        }
      },
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
      schedule: scheduleService.getAll().map((e) => ({
        title: e.title,
        start_iso: e.start_iso,
        end_iso: e.end_iso,
        location: e.location,
        notes: e.notes,
      })),
    });
  };

  const handleSuggestion = (text: string) => sendMessage(text);

  const handleNewChat = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages([]);
  };

  return (
    <div
      className="min-h-screen text-foreground overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 100% 80% at 20% 100%, hsl(280 90% 40%) 0%, transparent 55%), radial-gradient(ellipse 90% 70% at 80% 90%, hsl(295 85% 35%) 0%, transparent 55%), linear-gradient(180deg, hsl(0 0% 0%) 0%, hsl(275 60% 8%) 55%, hsl(270 75% 22%) 100%)",
        backgroundAttachment: "fixed",
      }}
    >
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

      <main className="ml-0 md:ml-[72px] pt-14 min-h-screen flex">
        {/* Main chat area */}
        <div className="flex-1 flex flex-col relative">
          {/* Floating title + actions (no background bar) */}
          <div className="absolute top-0 left-0 right-0 px-3 md:px-6 py-3 md:py-4 flex flex-col md:flex-row md:items-start md:justify-between gap-2 pointer-events-none z-20">
            <div className="pointer-events-auto">
              <h1 className="text-lg md:text-2xl font-semibold flex items-center gap-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                <Sparkles className="w-6 h-6 text-primary" />
                {settings.aiName || "Jarvis"}
              </h1>
              <p className="hidden md:block text-muted-foreground text-sm mt-1 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                {t("appSubtitle")}
              </p>
            </div>
            <div className="flex gap-2 pointer-events-auto flex-wrap">
              <ProjectsBar
                category="ai-tools"
                getSnapshot={() => ({ messages })}
                onLoad={(p) => {
                  const data = p.data as { messages?: ChatMessage[] };
                  if (data?.messages) setMessages(data.messages);
                }}
              />
              <button
                onClick={toggleFullscreen}
                className="hidden md:flex px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur-md text-sm font-medium items-center gap-2 transition-colors"
                title={isFullscreen ? "Quitter le plein écran" : "Passer en plein écran"}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
                {t("fullscreen")}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2.5 md:px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur-md text-xs md:text-sm font-medium flex items-center gap-1.5 md:gap-2 transition-colors">
                    <Settings2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{t("options")}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Actions rapides</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleNewChat}>
                    <MessageSquarePlus className="w-4 h-4 mr-2" />
                    Nouvelle conversation
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setMessages([])}
                    disabled={messages.length === 0}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Effacer les messages
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setVoiceCallOpen(true)}>
                    <PhoneCall className="w-4 h-4 mr-2" />
                    Mode appel vocal
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Paramètres
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 px-3 md:px-6 overflow-y-auto pb-[420px] md:pb-96 relative z-0">
            {messages.length === 0 ? (
              // Empty state with orb
              <div className="h-full flex flex-col items-center justify-center mt-8">
                <ChatOrb isLoading={isLoading} />
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto pt-20 md:pt-24">
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
          <div className="absolute bottom-0 left-0 right-0 px-3 md:px-6 pb-4 md:pb-6 pt-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="max-w-3xl mx-auto">
              <ChatInput onSend={sendMessage} disabled={isLoading} onOpenVoiceCall={() => setVoiceCallOpen(true)} />

              {/* Suggestions */}
              <div className="mt-3 md:mt-4">
                <p className="text-center text-xs text-muted-foreground mb-3 flex items-center justify-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {t("tryAsking")}
                </p>
                <SuggestionPills onSelect={handleSuggestion} />
              </div>

              {/* Footer hint */}
              <p className="hidden md:block text-center text-xs text-muted-foreground/60 mt-4">
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
