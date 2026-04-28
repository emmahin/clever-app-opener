import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-right"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card/90 group-[.toaster]:backdrop-blur-md group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-primary/60 group-[.toaster]:shadow-[0_0_22px_hsl(var(--primary)/0.45)] group-[.toaster]:rounded-sm group-[.toaster]:font-mono group-[.toaster]:text-xs group-[.toaster]:uppercase group-[.toaster]:tracking-[0.12em] group-[.toaster]:before:content-[''] group-[.toaster]:before:absolute group-[.toaster]:before:top-0 group-[.toaster]:before:left-0 group-[.toaster]:before:w-2.5 group-[.toaster]:before:h-2.5 group-[.toaster]:before:border-l-2 group-[.toaster]:before:border-t-2 group-[.toaster]:before:border-primary group-[.toaster]:after:content-[''] group-[.toaster]:after:absolute group-[.toaster]:after:bottom-0 group-[.toaster]:after:right-0 group-[.toaster]:after:w-2.5 group-[.toaster]:after:h-2.5 group-[.toaster]:after:border-r-2 group-[.toaster]:after:border-b-2 group-[.toaster]:after:border-primary",
          title: "group-[.toast]:font-display group-[.toast]:text-neon group-[.toast]:font-bold group-[.toast]:tracking-[0.16em]",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:normal-case group-[.toast]:tracking-normal",
          actionButton:
            "group-[.toast]:bg-primary/20 group-[.toast]:text-primary group-[.toast]:border group-[.toast]:border-primary/60 group-[.toast]:rounded-sm",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-sm",
          success:
            "group-[.toaster]:border-primary group-[.toaster]:shadow-[0_0_24px_hsl(var(--primary)/0.55)]",
          error:
            "group-[.toaster]:border-destructive group-[.toaster]:shadow-[0_0_24px_hsl(var(--destructive)/0.55)]",
          info:
            "group-[.toaster]:border-accent group-[.toaster]:shadow-[0_0_22px_hsl(var(--accent)/0.45)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
