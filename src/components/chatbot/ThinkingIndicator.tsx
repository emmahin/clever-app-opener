import { Sparkles } from "lucide-react";

export function ThinkingIndicator({ label = "Réflexion en cours" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
      <span>{label}</span>
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "300ms" }} />
      </span>
    </div>
  );
}