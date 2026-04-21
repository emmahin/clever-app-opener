import { Sparkles } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";

export function ThinkingIndicator({ label }: { label?: string }) {
  const { t } = useLanguage();
  const text = label ?? t("thinking");
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
      <span>{text}</span>
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "300ms" }} />
      </span>
    </div>
  );
}