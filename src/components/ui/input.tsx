import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-sm border border-primary/40 bg-background/70 px-3 py-2 text-base text-foreground ring-offset-background backdrop-blur-sm",
          "shadow-[inset_0_0_8px_hsl(var(--primary)/0.08)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground placeholder:uppercase placeholder:tracking-wider placeholder:text-[11px]",
          "transition-all hover:border-primary/60",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-[0_0_14px_hsl(var(--primary)/0.45),inset_0_0_8px_hsl(var(--primary)/0.15)]",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm font-mono tracking-wide",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
