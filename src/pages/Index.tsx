import { useState, useRef, useEffect } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { ChatOrb } from "@/components/chatbot/ChatOrb";
import { ChatInput } from "@/components/chatbot/ChatInput";
import { SuggestionPills } from "@/components/chatbot/SuggestionPills";
import { ChatMessageItem } from "@/components/chatbot/ChatMessage";
import { chatService, ChatMessage, ChatAttachment, APP_CATALOG, localAgentService } from "@/services";
import { Expand, Minimize2, Settings2, Sparkles, MessageSquarePlus, Trash2, SlidersHorizontal, PhoneCall } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useSettings } from "@/contexts/SettingsProvider";
import { VoiceCallMode } from "@/components/chatbot/VoiceCallMode";
import { ProjectsBar } from "@/components/chatbot/ProjectsBar";
import { useProjects } from "@/contexts/ProjectsProvider";
import { useNavigate } from "react-router-dom";
import { notificationService } from "@/services/notificationService";
import { scheduleService } from "@/services/scheduleService";
import { toast } from "sonner";
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

type LocalLaunchIntent =
  | { kind: "found"; target: string; label: string }
  | { kind: "not-found"; label: string };

/**
 * Détecte une demande "ouvre / lance <app>" et tente de la résoudre :
 *   1. Chemin .exe/.lnk explicite dans la phrase → on prend tel quel.
 *   2. Cache d'apps scannées (Settings → Agent local) → on résout en chemin absolu.
 *   3. Catalogue natif (Spotify, Discord, VS Code…) → on délègue à l'agent par nom.
 *   4. Sinon → "not-found", JAMAIS de fallback web.
 *
 * Règle utilisateur : aucune redirection web automatique.
 * On laisse passer à l'IA UNIQUEMENT si la phrase mentionne explicitement un site/lien.
 */
function extractLocalExecutableRequest(content: string): LocalLaunchIntent | null {
  const text = content.trim();
  if (!/\b(ouvre|ouvrir|lance|lancer|d[ée]marre|start|open|launch|exécute|execute)\b/i.test(text)) {
    console.debug("[nex:local-launch-detect] no launch verb", { content });
    return null;
  }

  // L'utilisateur demande explicitement un lien web → on n'intercepte pas.
  if (/\b(site|lien|url|page web|web|navigateur|onglet|browser)\b/i.test(text) || /https?:\/\//i.test(text)) {
    console.debug("[nex:local-launch-detect] explicit web request: bypass local interception", { content });
    return null;
  }

  // 1) Chemin Windows complet (.exe/.lnk/.bat/.cmd/.msi)
  const pathMatch = text.match(/([a-zA-Z]:\\[^\n"'`]+?\.(?:exe|lnk|bat|cmd|msi))\b/i);
  if (pathMatch?.[1]) {
    const target = pathMatch[1].trim();
    const label = target.split(/[\\/]/).pop() || target;
    console.debug("[nex:local-launch-detect] explicit windows path matched", { content, target, label });
    return { kind: "found", target, label };
  }
  const inlinePath = text.match(/(?:ouvre|ouvrir|lance|lancer|d[ée]marre|start|open|launch|exécute|execute)\s+(?:l['’]application\s+|le\s+programme\s+)?([^\s"'`]+?\.(?:exe|lnk|bat|cmd|msi))\b/i);
  if (inlinePath?.[1]) {
    const target = inlinePath[1].trim();
    const label = target.split(/[\\/]/).pop() || target;
    console.debug("[nex:local-launch-detect] inline executable matched", { content, target, label });
    return { kind: "found", target, label };
  }

  // 2) Extraction du nom de l'app après le verbe
  const subjectMatch = text.match(
    /(?:ouvre|ouvrir|lance|lancer|d[ée]marre|start|open|launch|exécute|execute)\s+(?:l['’]?application\s+|le\s+programme\s+|l['’]?app\s+|the\s+app\s+)?(.+?)(?:\s+(?:stp|svp|please)?\s*[.!?]?$)/i,
  );
  let subject = subjectMatch?.[1]?.trim();
  if (!subject || subject.length < 2) {
    console.debug("[nex:local-launch-detect] no app subject extracted", { content });
    return null;
  }
  // Nettoyage : "moi", articles, ponctuation finale
  subject = subject.replace(/^(moi|me|stp|svp)\s+/i, "").replace(/[.!?,;]+$/g, "").trim();
  if (!subject) return null;

  // 2a) Recherche dans le cache des apps scannées (= chemin absolu fiable)
  if (localAgentService.isConfigured()) {
    const cachedApp = localAgentService.findCachedApp(subject);
    if (cachedApp) {
      console.debug("[nex:local-launch-detect] cached app matched", { content, subject, cachedApp });
      return { kind: "found", target: cachedApp.path, label: cachedApp.name };
    }
  }

  // 2b) Catalogue natif (deeplinks installés par défaut)
  const normalized = subject
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const nativeCatalogApp = APP_CATALOG.find(
    (app) =>
      app.kind === "deeplink" &&
      [app.name, ...app.aliases].some((alias) => {
        const normalizedAlias = alias
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return new RegExp(`\\b${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalized);
      }),
  );
  if (nativeCatalogApp) {
    console.debug("[nex:local-launch-detect] native catalog matched", { content, subject, nativeCatalogApp });
    return {
      kind: "found",
      target: nativeCatalogApp.aliases[0] || nativeCatalogApp.name,
      label: nativeCatalogApp.name,
    };
  }

  // 3) Rien trouvé → on signale "introuvable" sans jamais ouvrir de lien web.
  console.debug("[nex:local-launch-detect] app not found locally", { content, subject });
  return { kind: "not-found", label: subject };
}

export default function Index() {
  const { lang, t } = useLanguage();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { get: getProject } = useProjects();
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

  // Sidebar → recharge un chat depuis l'historique
  useEffect(() => {
    const onLoad = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (!detail?.id) return;
      const proj = getProject(detail.id);
      const data = proj?.data as { messages?: ChatMessage[] } | undefined;
      if (data?.messages) {
        abortRef.current?.abort();
        setIsLoading(false);
        setMessages(data.messages);
      }
    };
    const onNew = () => {
      abortRef.current?.abort();
      setIsLoading(false);
      setMessages([]);
    };
    window.addEventListener("nex:loadChat", onLoad as EventListener);
    window.addEventListener("nex:newChat", onNew as EventListener);
    return () => {
      window.removeEventListener("nex:loadChat", onLoad as EventListener);
      window.removeEventListener("nex:newChat", onNew as EventListener);
    };
  }, [getProject]);

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
      if (localExecutable.kind === "found") {
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
      } else {
        // Aucune app trouvée : on AFFICHE un message clair, sans jamais rediriger vers le web.
        const cached = localAgentService.getCachedApps();
        const hint = !localAgentService.isConfigured()
          ? "L'agent local n'est pas configuré. Va dans **Paramètres → Agent local PC** pour l'activer."
          : !cached
            ? "Aucune liste d'applications n'a encore été scannée. Va dans **Paramètres → Agent local PC** et clique sur **Scanner mes applications**."
            : `Cette application n'apparaît pas dans tes ${cached.apps.length} apps détectées. Re-scanne ou précise le chemin complet du \`.exe\`/\`.lnk\`.`;
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              `❌ Je n'ai trouvé aucune application correspondant à **${localExecutable.label}** sur ton PC.\n\n` +
              hint +
              `\n\n*Je n'ouvre jamais de lien web automatiquement — précise « ouvre le site … » si c'est ce que tu veux.*`,
            createdAt: Date.now(),
          },
        ]);
      }
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
        const code = (err as any)?.code;
        if (code === "insufficient_credits") {
          toast.error(err.message, {
            action: {
              label: "Recharger",
              onClick: () => navigate("/billing"),
            },
            duration: 8000,
          });
          // Retire le message assistant vide, et on ne pollue pas avec une bulle d'erreur :
          // on redirige automatiquement après un court délai.
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          setTimeout(() => navigate("/billing"), 1500);
          return;
        }
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
      />

      <main className="ml-0 md:[margin-left:var(--sidebar-w,280px)] md:transition-[margin-left] md:duration-300 pt-14 min-h-screen flex">
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
                hideSearch
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
              <ChatInput
                onSend={sendMessage}
                disabled={isLoading}
                onOpenVoiceCall={() => setVoiceCallOpen(true)}
              />

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
