import { useEffect, useState } from "react";
import galaxyOrb from "@/assets/voice-orb-galaxy.png";

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
      {/* Outer halo blends into background */}
      <div className="absolute -inset-10 rounded-full bg-violet-600/30 blur-3xl" />
      <img
        src={galaxyOrb}
        alt=""
        className={cn(
          "relative w-full h-full object-cover transition-all duration-500",
          pulsing && "scale-105"
        )}
        style={{
          WebkitMaskImage:
            "radial-gradient(circle at center, black 45%, transparent 75%)",
          maskImage:
            "radial-gradient(circle at center, black 45%, transparent 75%)",
          animation: "spin 30s linear infinite",
        }}
      />
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
