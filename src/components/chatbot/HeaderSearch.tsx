import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  MessageSquare,
  Newspaper,
  AppWindow,
  ExternalLink,
  Sparkles,
  X,
} from "lucide-react";
import { newsService, appLauncherService, NewsItem, AppDescriptor, ChatMessage } from "@/services";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useTranslatedNews } from "@/hooks/useTranslatedNews";

interface HeaderSearchProps {
  messages: ChatMessage[];
  onJumpToMessage?: (id: string) => void;
  onSuggestion?: (text: string) => void;
}

export function HeaderSearch({ messages, onJumpToMessage, onSuggestion }: HeaderSearchProps) {
  const { t } = useLanguage();
  const SUGGESTIONS = [
    t("suggestion1"),
    t("suggestion2"),
    t("suggestion3"),
    t("suggestion4"),
  ];
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [rawNews, setRawNews] = useState<NewsItem[]>([]);
  const { news } = useTranslatedNews(rawNews);
  const [apps, setApps] = useState<AppDescriptor[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Charger une fois (au focus)
  useEffect(() => {
    if (!open) return;
    if (rawNews.length === 0) newsService.getLatest().then(setRawNews);
    if (apps.length === 0) appLauncherService.listApps().then(setApps);
  }, [open, rawNews.length, apps.length]);

  // Fermer au clic extérieur
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Raccourci ⌘K / Ctrl+K → focus le champ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();

  const matchedMessages = useMemo(() => {
    if (!q) return [];
    return messages.filter((m) => m.content.toLowerCase().includes(q)).slice(0, 5);
  }, [messages, q]);

  const matchedNews = useMemo(() => {
    if (!q) return news.slice(0, 5);
    return news
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.summary?.toLowerCase().includes(q) ||
          n.source.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [news, q]);

  const matchedApps = useMemo(() => {
    if (!q) return apps;
    return apps.filter((a) => a.name.toLowerCase().includes(q));
  }, [apps, q]);

  const reset = () => {
    setQuery("");
    setOpen(false);
  };

  const totalResults =
    matchedMessages.length + matchedNews.length + matchedApps.length;

  return (
    <div ref={wrapRef} className="relative w-80">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("searchPlaceholder")}
        className="w-full h-9 pl-10 pr-16 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder:text-white/50 focus:outline-none focus:bg-white/15 transition-all"
      />
      {query ? (
        <button
          onClick={reset}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center text-white/70 hover:bg-white/15"
          aria-label="Effacer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 text-[10px] font-mono bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-white/70">
          ⌘K
        </kbd>
      )}

      {open && (
        <div className="absolute left-0 right-0 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-2xl z-50">
          {/* Suggestions (champ vide) */}
          {!q && onSuggestion && (
            <Section title={t("suggestions")}>
              {SUGGESTIONS.map((s) => (
                <Row
                  key={s}
                  icon={<Sparkles className="w-4 h-4 opacity-60" />}
                  onClick={() => {
                    onSuggestion(s);
                    reset();
                  }}
                >
                  {s}
                </Row>
              ))}
            </Section>
          )}

          {/* Conversations */}
          {matchedMessages.length > 0 && (
            <Section title={t("conversations")}>
              {matchedMessages.map((m) => (
                <Row
                  key={m.id}
                  icon={<MessageSquare className="w-4 h-4 opacity-60" />}
                  onClick={() => {
                    onJumpToMessage?.(m.id);
                    reset();
                  }}
                >
                  <span className="text-xs opacity-60 mr-2">
                    {m.role === "user" ? t("you") : t("ai")}
                  </span>
                  <span className="truncate">{m.content.slice(0, 100)}</span>
                </Row>
              ))}
            </Section>
          )}

          {/* Actualités */}
          {matchedNews.length > 0 && (
            <Section title={t("news")}>
              {matchedNews.map((n) => (
                <Row
                  key={n.id}
                  icon={<Newspaper className="w-4 h-4 opacity-60" />}
                  trailing={<ExternalLink className="w-3 h-3 opacity-50" />}
                  onClick={() => {
                    window.open(n.url, "_blank", "noopener,noreferrer");
                    reset();
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm">{n.title}</div>
                    <div className="text-xs opacity-60 truncate">
                      {n.source} · {n.category || t("news")}
                    </div>
                  </div>
                </Row>
              ))}
            </Section>
          )}

          {/* Apps */}
          {matchedApps.length > 0 && (
            <Section title={t("apps")}>
              {matchedApps.map((a) => (
                <Row
                  key={a.id}
                  icon={<AppWindow className="w-4 h-4 opacity-60" />}
                  trailing={<span className="text-xs opacity-50">{t("launch")}</span>}
                  onClick={async () => {
                    const res = await appLauncherService.launchByName(a.name);
                    console.info("[launch]", res.message);
                    reset();
                  }}
                >
                  {a.name}
                </Row>
              ))}
            </Section>
          )}

          {q && totalResults === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("noResultsFor")} « {query} »
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  icon,
  children,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {icon}
      <span className="flex-1 min-w-0 truncate flex items-center">{children}</span>
      {trailing}
    </button>
  );
}
