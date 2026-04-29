import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Check, Trash2, X, MessageCircle, Newspaper, TrendingUp, Clock, Lightbulb, Settings, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const cls = "w-4 h-4";
  switch (type) {
    case "chat_response": return <MessageSquare className={cls} />;
    case "whatsapp_message": return <MessageCircle className={cls} />;
    case "news": return <Newspaper className={cls} />;
    case "stock_alert": return <TrendingUp className={cls} />;
    case "reminder": return <Clock className={cls} />;
    case "ai_insight": return <Lightbulb className={cls} />;
    case "system": return <Settings className={cls} />;
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

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString();
}

const FILTERS: Array<{ id: "all" | NotificationType; label: string }> = [
  { id: "all", label: "Tout" },
  { id: "chat_response", label: "Chat" },
  { id: "whatsapp_message", label: "WhatsApp" },
  { id: "news", label: "Actus" },
  { id: "reminder", label: "Rappels" },
];

export function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | NotificationType>("all");

  const visible = notifications
    .filter((n) => n.delivered)
    .filter((n) => filter === "all" || n.type === filter)
    .slice(0, 12);

  const handleClick = (n: AppNotification) => {
    markAsRead(n.id);
    if (n.actionUrl) {
      setOpen(false);
      navigate(n.actionUrl);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/15 transition-colors"
          title={`${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-black/40 animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] p-0 bg-gradient-to-b from-[hsl(0,0%,6%)] to-[hsl(190,40%,12%)] border-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est à jour"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> Tout marquer
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-1 px-3 py-2 border-b border-white/5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 px-2.5 py-1 rounded-full text-[11px] transition-colors",
                filter === f.id
                  ? "bg-primary/25 text-foreground border border-primary/40"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-transparent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto">
          {visible.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Aucune notification</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {visible.map((n) => (
                <li
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "group flex gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors relative",
                    !n.read && "bg-primary/5",
                  )}
                >
                  {!n.read && <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-teal-400" />}
                  <div className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", colorFor(n.type))}>
                    {iconFor(n.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{relativeTime(n.createdAt)}</span>
                    </div>
                    {n.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{TYPE_LABELS[n.type]}{n.source ? ` · ${n.source}` : ""}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1 self-start"
                    title="Supprimer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="text-xs text-primary hover:text-primary/80"
          >
            Voir tout →
          </Link>
          {notifications.length > 0 && (
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Settings className="w-3 h-3" /> Préférences
            </Link>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}