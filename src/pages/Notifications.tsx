import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { Bell, Check, Search, Trash2, X, MessageSquare, MessageCircle, Newspaper, TrendingUp, Clock, Lightbulb, Settings as SettingsIcon } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { AppNotification, NotificationType } from "@/services/notificationService";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<NotificationType, string> = {
  chat_response: "Chat",
  whatsapp_message: "WhatsApp",
  news: "Actus",
  stock_alert: "Bourse",
  reminder: "Rappel",
  ai_insight: "Insight",
  system: "Système",
};

function iconFor(type: NotificationType) {
  const cls = "w-5 h-5";
  switch (type) {
    case "chat_response": return <MessageSquare className={cls} />;
    case "whatsapp_message": return <MessageCircle className={cls} />;
    case "news": return <Newspaper className={cls} />;
    case "stock_alert": return <TrendingUp className={cls} />;
    case "reminder": return <Clock className={cls} />;
    case "ai_insight": return <Lightbulb className={cls} />;
    case "system": return <SettingsIcon className={cls} />;
  }
}

function colorFor(type: NotificationType): string {
  switch (type) {
    case "chat_response": return "text-cyan-400 bg-cyan-500/15";
    case "whatsapp_message": return "text-emerald-400 bg-emerald-500/15";
    case "news": return "text-blue-400 bg-blue-500/15";
    case "stock_alert": return "text-amber-400 bg-amber-500/15";
    case "reminder": return "text-pink-400 bg-pink-500/15";
    case "ai_insight": return "text-teal-400 bg-teal-500/15";
    case "system": return "text-slate-400 bg-slate-500/15";
  }
}

function groupKey(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return "Cette semaine";
  if (diffDays < 30) return "Ce mois-ci";
  return "Plus ancien";
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const FILTERS: Array<{ id: "all" | NotificationType; label: string }> = [
  { id: "all", label: "Tout" },
  { id: "chat_response", label: "Chat" },
  { id: "whatsapp_message", label: "WhatsApp" },
  { id: "news", label: "Actus" },
  { id: "stock_alert", label: "Bourse" },
  { id: "reminder", label: "Rappels" },
  { id: "ai_insight", label: "Insights" },
  { id: "system", label: "Système" },
];

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismiss, clearAll } = useNotifications();
  const [filter, setFilter] = useState<"all" | NotificationType>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notifications
      .filter((n) => n.delivered)
      .filter((n) => filter === "all" || n.type === filter)
      .filter((n) => !unreadOnly || !n.read)
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q));
  }, [notifications, filter, unreadOnly, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    for (const n of filtered) {
      const k = groupKey(n.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const handleClick = (n: AppNotification) => {
    markAsRead(n.id);
    if (n.actionUrl) navigate(n.actionUrl);
  };

  return (
    <div
      className="min-h-screen text-foreground"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 100% 80% at 20% 100%, hsl(280 90% 40%) 0%, transparent 55%), radial-gradient(ellipse 90% 70% at 80% 90%, hsl(295 85% 35%) 0%, transparent 55%), linear-gradient(180deg, hsl(0 0% 0%) 0%, hsl(275 60% 8%) 55%, hsl(270 75% 22%) 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <Sidebar />
      <Header />
      <main className="ml-0 md:[margin-left:var(--sidebar-w,280px)] md:transition-[margin-left] md:duration-300 pt-14 min-h-screen">
        <div className="max-w-3xl mx-auto px-3 md:px-6 py-6 md:py-8 space-y-5">
          {/* Title */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Notifications</h1>
                <p className="text-sm text-muted-foreground">
                  {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est à jour"}
                  {notifications.length > 0 && ` · ${notifications.length} au total`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Tout marquer comme lu
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => { if (confirm("Supprimer toutes les notifications ?")) clearAll(); }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-300 text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Tout supprimer
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans les notifications…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs transition-colors border",
                  filter === f.id
                    ? "bg-primary/25 text-foreground border-primary/50"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 border-transparent",
                )}
              >
                {f.label}
              </button>
            ))}
            <span className="w-px h-4 bg-white/10 mx-1" />
            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={cn(
                "px-3 py-1 rounded-full text-xs transition-colors border",
                unreadOnly
                  ? "bg-teal-500/25 text-foreground border-teal-500/50"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 border-transparent",
              )}
            >
              Non lues uniquement
            </button>
          </div>

          {/* List */}
          {grouped.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
              <Bell className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-base font-medium text-foreground">Aucune notification</p>
              <p className="text-sm text-muted-foreground mt-1">
                {query || filter !== "all" || unreadOnly
                  ? "Essaie de modifier les filtres."
                  : "Tu seras notifié ici quand quelque chose arrive."}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([label, items]) => (
                <section key={label}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">{label}</h2>
                  <ul className="space-y-1.5">
                    {items.map((n) => (
                      <li
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={cn(
                          "group flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors relative",
                          n.read
                            ? "bg-white/5 border-white/10 hover:bg-white/10"
                            : "bg-primary/10 border-primary/30 hover:bg-primary/15",
                        )}
                      >
                        <div className={cn("shrink-0 w-10 h-10 rounded-lg flex items-center justify-center", colorFor(n.type))}>
                          {iconFor(n.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <h3 className="text-sm font-medium text-foreground">{n.title}</h3>
                            {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />}
                            <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{timeOf(n.createdAt)}</span>
                          </div>
                          {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-muted-foreground">
                              {TYPE_LABELS[n.type]}
                            </span>
                            {n.source && <span className="text-[10px] text-muted-foreground/60">{n.source}</span>}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity p-1 self-start"
                          title="Supprimer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}