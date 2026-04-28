import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary/60 bg-primary/15 text-primary shadow-[0_0_8px_hsl(var(--primary)/0.4)]",
        secondary: "border-primary/30 bg-secondary text-secondary-foreground",
        destructive: "border-destructive/60 bg-destructive/15 text-destructive shadow-[0_0_8px_hsl(var(--destructive)/0.4)]",
        outline: "border-primary/50 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
