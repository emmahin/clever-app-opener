import { useMemo } from "react";
import { Hash } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TokenCounterProps {
  text: string;
  extra?: number; // tokens supplémentaires (pièces jointes, contexte…)
  className?: string;
}

// Estimation rapide : ~4 caractères par token (approximation GPT/Gemini courante)
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function formatTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}

export function TokenCounter({ text, extra = 0, className = "" }: TokenCounterProps) {
  const tokens = useMemo(() => estimateTokens(text) + extra, [text, extra]);

  // Couleur indicative selon volume
  const color =
    tokens > 4000 ? "text-destructive border-destructive/40 bg-destructive/10"
    : tokens > 1500 ? "text-amber-300 border-amber-400/40 bg-amber-500/10"
    : tokens > 0 ? "text-primary border-primary/30 bg-primary/10"
    : "text-muted-foreground border-border/50 bg-white/5";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`h-8 px-2 rounded-lg border flex items-center gap-1 text-[11px] font-mono tabular-nums select-none ${color} ${className}`}
            aria-label={`${tokens} tokens estimés`}
          >
            <Hash className="w-3 h-3" />
            <span>{formatTokens(tokens)}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs">
            <div className="font-medium">Tokens estimés : {tokens.toLocaleString()}</div>
            <div className="text-muted-foreground text-[10px]">~4 caractères ≈ 1 token</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
