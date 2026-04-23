import { useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useNavigate } from "react-router-dom";
import { newsService, NewsItem, APP_CATALOG, openAppTarget, AppEntry } from "@/services";
import { MessageSquare, Newspaper, AppWindow, ExternalLink, Sparkles } from "lucide-react";
import { ChatMessage } from "@/services";

const SUGGESTIONS = [
  "Analyse les tendances du marché aujourd'hui",
  "Résume les dernières actus tech & IA",
  "Quelle est la situation actuelle du monde ?",
  "Montre-moi les performances boursières",
];

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  onJumpToMessage?: (id: string) => void;
  onSuggestion?: (text: string) => void;
}

export function SearchPalette({ open, onOpenChange, messages, onJumpToMessage, onSuggestion }: SearchPaletteProps) {
  const navigate = useNavigate();
  const [news, setNews] = useState<NewsItem[]>([]);
  const apps: AppEntry[] = APP_CATALOG;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    newsService.getLatest().then(setNews);
  }, [open]);

  const q = query.trim().toLowerCase();

  const matchedMessages = useMemo(() => {
    if (!q) return messages.slice(-5).reverse();
    return messages.filter((m) => m.content.toLowerCase().includes(q)).slice(0, 8);
  }, [messages, q]);

  const matchedNews = useMemo(() => {
    if (!q) return news.slice(0, 6);
    return news
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.summary?.toLowerCase().includes(q) ||
          n.source.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [news, q]);

  const matchedApps = useMemo(() => {
    if (!q) return apps.slice(0, 8);
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.aliases.some((al) => al.toLowerCase().includes(q)),
    );
  }, [apps, q]);

  const close = () => {
    onOpenChange(false);
    setQuery("");
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Rechercher conversations, actus, applications…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>

        {!q && onSuggestion && (
          <>
            <CommandGroup heading="Suggestions">
              {SUGGESTIONS.map((s) => (
                <CommandItem
                  key={s}
                  value={`sugg-${s}`}
                  onSelect={() => {
                    onSuggestion(s);
                    close();
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4 opacity-60" />
                  <span>{s}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {matchedMessages.length > 0 && (
          <CommandGroup heading="Conversations">
            {matchedMessages.map((m) => (
              <CommandItem
                key={m.id}
                value={`msg-${m.id}-${m.content}`}
                onSelect={() => {
                  onJumpToMessage?.(m.id);
                  close();
                }}
              >
                <MessageSquare className="mr-2 h-4 w-4 opacity-60" />
                <span className="truncate">
                  <span className="text-xs opacity-60 mr-2">
                    {m.role === "user" ? "Vous" : "IA"}
                  </span>
                  {m.content.slice(0, 120) || "(message vide)"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchedMessages.length > 0 && matchedNews.length > 0 && <CommandSeparator />}

        {matchedNews.length > 0 && (
          <CommandGroup heading="Actualités">
            {matchedNews.map((n) => (
              <CommandItem
                key={n.id}
                value={`news-${n.id}-${n.title}`}
                onSelect={() => {
                  window.open(n.url, "_blank", "noopener,noreferrer");
                  close();
                }}
              >
                <Newspaper className="mr-2 h-4 w-4 opacity-60" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm">{n.title}</div>
                  <div className="text-xs opacity-60 truncate">
                    {n.source} · {n.category || "Actualités"}
                  </div>
                </div>
                <ExternalLink className="ml-2 h-3 w-3 opacity-50" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchedNews.length > 0 && matchedApps.length > 0 && <CommandSeparator />}

        {matchedApps.length > 0 && (
          <CommandGroup heading="Applications">
            {matchedApps.map((a) => (
              <CommandItem
                key={a.id}
                value={`app-${a.id}-${a.name}`}
                onSelect={() => {
                  openAppTarget({ kind: a.kind, target: a.target, fallbackUrl: a.fallbackUrl, navigate });
                  close();
                }}
              >
                <AppWindow className="mr-2 h-4 w-4 opacity-60" />
                <span>{a.name}</span>
                <span className="ml-auto text-xs opacity-50">Ouvrir</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
