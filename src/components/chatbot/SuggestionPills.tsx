interface SuggestionPillsProps {
  onSelect: (text: string) => void;
}

const suggestions = [
  "Analyze the data trends from last month",
  "Generate a SQL query for user analytics",
  "Summarize key insights from the dashboard",
  "Create a report on model performance",
];

export function SuggestionPills({ onSelect }: SuggestionPillsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
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
