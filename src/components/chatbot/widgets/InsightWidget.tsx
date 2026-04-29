import { useEffect, useRef } from "react";
import { Lightbulb } from "lucide-react";
import { notificationService } from "@/services/notificationService";

/**
 * Renders a proactive insight from the AI and pushes it as a notification.
 */
export function InsightWidget({ title, body }: { title: string; body: string }) {
  const did = useRef(false);
  useEffect(() => {
    if (did.current) return;
    did.current = true;
    notificationService.notify({
      type: "ai_insight",
      title,
      body,
      source: "Nex",
      actionUrl: "/notifications",
    });
  }, [title, body]);

  return (
    <div className="rounded-xl border border-teal-500/40 bg-gradient-to-br from-teal-900/30 to-teal-900/20 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
        <Lightbulb className="w-3.5 h-3.5 text-teal-400" />
        INSIGHT
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{body}</p>
    </div>
  );
}