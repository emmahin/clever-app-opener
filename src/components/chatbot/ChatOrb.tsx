import { useEffect, useState } from "react";

interface ChatOrbProps {
  isLoading?: boolean;
}

/**
 * Orbe rond minimaliste pour l'écran d'accueil du chat.
 * Halo radial violet/rose + sphère pulsante. Aucune galaxie / orbites.
 */
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
      {/* Halo extérieur diffus */}
      <div
        className="absolute -inset-12 rounded-full pointer-events-none blur-[60px] opacity-80"
        style={{
          background:
            "radial-gradient(circle at center, hsl(280 95% 65% / 0.55), hsl(320 90% 60% / 0.35) 45%, transparent 75%)",
        }}
      />
      {/* Sphère principale */}
      <div
        className={cn(
          "relative w-40 h-40 rounded-full transition-transform duration-500",
          pulsing ? "scale-105" : "scale-100",
        )}
        style={{
          background:
            "radial-gradient(circle at 35% 30%, #F5B8FF 0%, #C44CFF 40%, #8B2FD9 75%, #4A148C 100%)",
          boxShadow:
            "0 0 60px hsl(280 95% 60% / 0.55), inset 0 -20px 40px hsl(280 80% 25% / 0.6), inset 10px 15px 30px hsl(300 100% 90% / 0.35)",
          animation: "pulse-orb 4s ease-in-out infinite",
        }}
      />
      {/* Reflet brillant */}
      <div
        className="absolute w-12 h-8 rounded-full pointer-events-none"
        style={{
          top: "30%",
          left: "30%",
          background:
            "radial-gradient(ellipse at center, rgba(255,255,255,0.7), transparent 70%)",
          filter: "blur(2px)",
        }}
      />
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}