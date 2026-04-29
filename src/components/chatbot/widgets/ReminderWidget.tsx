import { useEffect, useRef } from "react";
import { Clock, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { notificationService } from "@/services/notificationService";

/**
 * Renders a confirmation card for a reminder created by the AI.
 * On first render, schedules the reminder in the notification service.
 */
export function ReminderWidget({ title, body, when_iso }: { title: string; body?: string; when_iso: string }) {
  const did = useRef(false);

  const when = new Date(when_iso);
  const valid = !isNaN(when.getTime());
  const isFuture = valid && when.getTime() > Date.now();

  useEffect(() => {
    if (did.current) return;
    did.current = true;
    if (!valid) return;
    notificationService.notify({
      type: "reminder",
      title: `⏰ ${title}`,
      body,
      source: "Rappel",
      actionUrl: "/notifications",
      scheduledFor: when.getTime(),
    });
  }, [title, body, when_iso, valid]);

  const formatted = valid
    ? when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : when_iso;

  return (
    <div className="rounded-xl border border-pink-500/40 bg-gradient-to-br from-pink-900/30 to-purple-900/20 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
        <Clock className="w-3.5 h-3.5 text-pink-400" />
        RAPPEL {isFuture ? "PROGRAMMÉ" : "CRÉÉ"}
      </div>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-pink-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {body && <p className="text-xs text-muted-foreground mt-0.5">{body}</p>}
          <p className="text-[11px] text-pink-300/80 mt-1.5">📅 {formatted}</p>
        </div>
      </div>
      <Link
        to="/notifications"
        className="inline-block mt-3 text-xs text-pink-300 hover:text-pink-200"
      >
        Voir mes rappels →
      </Link>
    </div>
  );
}