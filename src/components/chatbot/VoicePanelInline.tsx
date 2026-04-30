import { useEffect, useRef, useState } from "react";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";
import { ChatOrb } from "./ChatOrb";

/**
 * Panneau vocal INLINE — affiché juste au-dessus de la zone de texte du chat
 * dans /app. Pas d'overlay plein écran : l'orbe + les vagues vivent dans le
 * flux de la page, pour que l'utilisateur garde le chat sous les yeux.
 */
export function VoicePanelInline() {
  const { isCallActive, status, audioLevel } = useTwinVoiceContext();
  const [smoothed, setSmoothed] = useState(0);
  const smoothedRef = useRef(0);

  // Lerp asymétrique pour des vagues organiques.
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

  const phase: "idle" | "listening" | "thinking" | "speaking" = status;
  const BAR_COUNT = 27;
  const color =
    phase === "speaking"
      ? "hsl(280 95% 70%)"
      : phase === "thinking"
      ? "hsl(270 80% 60%)"
      : "hsl(270 90% 65%)";

  return (
    <div className="mb-2 flex items-center justify-center gap-3 rounded-2xl border border-primary/20 bg-black/30 backdrop-blur-md px-3 py-2">
      {/* Orb compact */}
      <div className="scale-[0.35] -my-12 -mx-12 flex-shrink-0">
        <ChatOrb isLoading={phase === "thinking"} />
      </div>

      {/* Vagues */}
      <div className="flex items-center justify-center gap-[2px] h-10 flex-1 max-w-md">
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
          const h = 2 + amp * 38;
          return (
            <span
              key={i}
              className="block w-[2px] rounded-full transition-[height] duration-300 ease-out"
              style={{ height: `${h}px`, background: color }}
            />
          );
        })}
      </div>

      <span className="text-[11px] text-white/70 min-w-[60px] text-right">
        {phase === "speaking" ? "Lia parle…" : phase === "thinking" ? "Réflexion…" : "À l'écoute"}
      </span>
    </div>
  );
}