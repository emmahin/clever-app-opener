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
import { newsService, appLauncherService, NewsItem, AppDescriptor } from "@/services";
import { MessageSquare, Newspaper, AppWindow, ExternalLink } from "lucide-react";
import { ChatMessage } from "@/services";

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  onJumpToMessage?: (id: string) => void;
}

export function SearchPalette({ open, onOpenChange, messages, onJumpToMessage }: SearchPaletteProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [apps, setApps] = useState<AppDescriptor[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    newsService.getLatest().then(setNews);
    appLauncherService.listApps().then(setApps);
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
    if (!q) return apps;
    return apps.filter((a) => a.name.toLowerCase().includes(q));
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
          <CommandGroup heading="Applications (Windows)">
            {matchedApps.map((a) => (
              <CommandItem
                key={a.id}
                value={`app-${a.id}-${a.name}`}
                onSelect={async () => {
                  const res = await appLauncherService.launchByName(a.name);
                  // Notif simple via console pour l'instant ; remplacée plus tard par toast
                  console.info("[launch]", res.message);
                  close();
                }}
              >
                <AppWindow className="mr-2 h-4 w-4 opacity-60" />
                <span>{a.name}</span>
                <span className="ml-auto text-xs opacity-50">Lancer</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
