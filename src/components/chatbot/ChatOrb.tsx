import { useEffect, useState } from "react";

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
    <div className="relative w-32 h-32 flex items-center justify-center">
      {/* Outer glow rings */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 blur-xl animate-orb" />
      <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-2xl" />
      
      {/* Main orb */}
      <div className={cn(
        "relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-400 via-fuchsia-500 to-purple-600 transition-all duration-300",
        pulsing && "scale-110"
      )}>
        {/* Inner glow */}
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/30 to-transparent" />
        <div className="absolute inset-0 rounded-full shadow-[inset_0_-10px_30px_rgba(0,0,0,0.4)]" />
      </div>

      {/* Floating particles */}
      <div className="absolute w-full h-full">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-violet-400/60 animate-float"
            style={{
              top: `${20 + i * 25}%`,
              left: `${15 + i * 30}%`,
              animationDelay: `${i * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
