import { useEffect, useState } from "react";
import starFrame from "@/assets/star-frame-violet.png";

interface ChatOrbProps {
  isLoading?: boolean;
}

export function ChatOrb({ isLoading = false }: ChatOrbProps) {
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 300);
      return () => clearTimeout(t);
    }
  }, [isLoading]);

  return (
    <div className="relative w-48 h-48 flex items-center justify-center">
      {/* Soft violet/fuchsia halo behind the frame */}
      <div className="absolute -inset-10 rounded-full bg-accent/30 blur-3xl" />
      <div className="absolute inset-4 rounded-full bg-primary/20 blur-2xl" />
      <img
        src={starFrame}
        alt=""
        className={cn(
          "relative w-full h-full object-contain transition-all duration-500 mix-blend-screen",
          pulsing && "scale-105"
        )}
        style={{
          animation: "spin 30s linear infinite",
        }}
      />
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
