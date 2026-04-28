import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-sm border border-primary/40 bg-background/70 px-3 py-2 text-sm text-foreground ring-offset-background backdrop-blur-sm",
        "shadow-[inset_0_0_8px_hsl(var(--primary)/0.08)] font-mono tracking-wide",
        "placeholder:text-muted-foreground",
        "transition-all hover:border-primary/60",
        "focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-[0_0_14px_hsl(var(--primary)/0.45),inset_0_0_8px_hsl(var(--primary)/0.15)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
