import { forwardRef } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";

interface SuggestionPillsProps {
  onSelect: (text: string) => void;
}

export const SuggestionPills = forwardRef<HTMLDivElement, SuggestionPillsProps>(
  function SuggestionPills({ onSelect }, ref) {
    const { t } = useLanguage();
    const suggestions = [t("suggestion1"), t("suggestion2"), t("suggestion3"), t("suggestion4")];
    return (
      <div ref={ref} className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className="px-4 py-2 rounded-full bg-secondary/80 text-secondary-foreground text-sm hover:bg-secondary transition-colors border border-border/50"
          >
            {s}
          </button>
        ))}
      </div>
    );
  }
);
