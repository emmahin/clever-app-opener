import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";
import { ChatOrb } from "./ChatOrb";

/**
 * Orbe vocal FLOTTANT global — persiste sur toutes les pages tant qu'un appel
 * vocal est actif. Affiché en bas-droite, au-dessus du contenu.
 * Masqué sur /app où le panneau inline est déjà présent dans le chat.
 */
export function VoicePanelFloating() {
  const { isCallActive, status, audioLevel, endCall } = useTwinVoiceContext();
  const [smoothed, setSmoothed] = useState(0);
  const smoothedRef = useRef(0);
  const location = useLocation();

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target = audioLevel || 0;
      const cur = smoothedRef.current;
      const k = target > cur ? 0.08 : 0.05;
      const next = cur + (target - cur) * k;
      smoothedRef.current = next;
      setSmoothed(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!isCallActive) return null;
  // Note : affiché sur TOUTES les pages, y compris /app — c'est un fond global.

  const phase: "idle" | "listening" | "thinking" | "speaking" = status;
  const BAR_COUNT = 64;
  const color =
    phase === "speaking"
      ? "hsl(280 95% 70%)"
      : phase === "thinking"
      ? "hsl(270 80% 60%)"
      : "hsl(270 90% 65%)";

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none flex flex-col items-center justify-center gap-8 opacity-40"
      aria-hidden="true"
    >
      {/* Orbe géant en fond */}
      <div className="scale-[1.2]">
        <ChatOrb isLoading={phase === "thinking"} />
      </div>

      {/* Vague large en fond */}
      <div className="flex items-center gap-[3px] h-32 w-full max-w-3xl px-8">
        {Array.from({ length: BAR_COUNT }).map((_, i) => {
          const center = (BAR_COUNT - 1) / 2;
          const dist = Math.abs(i - center) / center;
          const envelope = Math.pow(1 - dist, 1.6) * 0.85 + 0.15;
          const t1 = Date.now() / 600 + i * 0.45;
          const wiggle = 0.55 + 0.18 * Math.sin(t1) * Math.cos(t1 * 0.5 + i * 0.3);
          const breath = 0.025 + 0.012 * Math.sin(Date.now() / 1400 + i * 0.2);
          const active = phase === "listening" && smoothed > 0.08;
          const signal = active ? Math.min(smoothed * 0.09, 0.11) : 0;
          const amp = envelope * (wiggle * (signal + breath));
          const h = 4 + amp * 140;
          return (
            <span
              key={i}
              className="block w-[3px] flex-1 rounded-full transition-[height] duration-300 ease-out"
              style={{ height: `${h}px`, background: color }}
            />
          );
        })}
      </div>
    </div>
  );
}