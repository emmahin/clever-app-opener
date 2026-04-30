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
  const { isCallActive, status, audioLevel } = useTwinVoiceContext();
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
  // Sur /app et /home, le panneau inline est déjà visible — on évite le doublon.
  if (location.pathname === "/app" || location.pathname === "/home") return null;

  const phase: "idle" | "listening" | "thinking" | "speaking" = status;
  const BAR_COUNT = 18;
  const color =
    phase === "speaking"
      ? "hsl(280 95% 70%)"
      : phase === "thinking"
      ? "hsl(270 80% 60%)"
      : "hsl(270 90% 65%)";

  const handleStop = () => {
    window.dispatchEvent(new CustomEvent("app:close-voice-call"));
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-2xl border border-primary/30 bg-black/60 backdrop-blur-xl px-3 py-2 shadow-2xl shadow-primary/20"
      role="status"
      aria-live="polite"
    >
      <div className="scale-[0.3] -my-14 -mx-14 flex-shrink-0">
        <ChatOrb isLoading={phase === "thinking"} />
      </div>

      <div className="flex items-center gap-[2px] h-8">
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
          const h = 2 + amp * 30;
          return (
            <span
              key={i}
              className="block w-[2px] rounded-full transition-[height] duration-300 ease-out"
              style={{ height: `${h}px`, background: color }}
            />
          );
        })}
      </div>

      <span className="text-[10px] text-white/70 min-w-[54px] text-right">
        {phase === "speaking" ? "Lia parle…" : phase === "thinking" ? "Réflexion…" : "À l'écoute"}
      </span>

      <button
        onClick={handleStop}
        className="ml-1 text-[10px] text-white/60 hover:text-white px-2 py-1 rounded-md border border-white/10 hover:border-white/30 transition"
        aria-label="Arrêter l'appel vocal"
      >
        Stop
      </button>
    </div>
  );
}