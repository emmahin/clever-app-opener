import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  state: OrbState;
  /** Niveau audio normalisé 0..1 — alimente le scale et la luminosité. */
  level: number;
  className?: string;
}

/**
 * Couleur dominante par état (HSL pure pour rester compatible design system).
 * On utilise des CSS vars locales pour piloter glow + anneaux + particules
 * en une seule transition fluide.
 */
const STATE_COLORS: Record<OrbState, { hue: number; sat: number; light: number; label: string }> = {
  idle:      { hue: 220, sat: 90, light: 60, label: "En veille" },
  listening: { hue: 195, sat: 95, light: 60, label: "À l'écoute" },
  thinking:  { hue: 280, sat: 90, light: 65, label: "Je réfléchis" },
  speaking:  { hue: 180, sat: 95, light: 60, label: "Je réponds" },
};

/**
 * Orbe immersif type Jarvis :
 *   - Sphère SVG (gradient radial pilotée par l'état)
 *   - 3 anneaux orbitant à des vitesses différentes
 *   - Onde radiale dessinée en canvas, animée à 60fps,
 *     dont l'amplitude suit `level` (RMS micro ou TTS).
 *   - Respiration permanente via keyframes CSS quand state === "idle"
 */
export function VoiceOrb({ state, level, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef(0);
  const levelRef = useRef(level);
  const stateRef = useRef(state);

  // garde-fou : on garde toujours une référence fraîche du level/state
  // pour que la boucle rAF n'ait pas besoin d'être recréée à chaque render.
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.28;
      const lvl = levelRef.current;
      const st = stateRef.current;
      const color = STATE_COLORS[st];

      phaseRef.current += st === "thinking" ? 0.04 : st === "speaking" ? 0.06 : 0.018;
      const phase = phaseRef.current;

      // Onde radiale : 64 segments, amplitude pilotée par level + bruit sinus.
      const SEG = 64;
      const ringR = baseR * 1.55;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = `hsla(${color.hue}, ${color.sat}%, ${color.light}%, 0.85)`;
      ctx.beginPath();
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const wobble =
          Math.sin(a * 6 + phase * 2.1) * 0.5 +
          Math.sin(a * 11 + phase * 1.3) * 0.3 +
          Math.sin(a * 3 - phase * 0.9) * 0.2;
        const amp = ringR * (0.04 + lvl * 0.42) * wobble;
        const r = ringR + amp;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();

      // Particules orbitales — 3 couches de petites étincelles.
      const PARTS = st === "speaking" ? 36 : st === "listening" ? 28 : 18;
      for (let i = 0; i < PARTS; i++) {
        const a = (i / PARTS) * Math.PI * 2 + phase * (0.4 + (i % 3) * 0.2);
        const layer = i % 3;
        const dist = baseR * (1.18 + layer * 0.22) + Math.sin(phase * 1.5 + i) * 4 * dpr;
        const x = cx + Math.cos(a) * dist;
        const y = cy + Math.sin(a) * dist;
        const size = (1.4 + (layer === 0 ? 1.2 : 0)) * dpr * (0.7 + lvl * 1.2);
        ctx.beginPath();
        ctx.fillStyle = `hsla(${color.hue + (layer === 1 ? 30 : 0)}, ${color.sat}%, ${color.light + 15}%, ${0.55 - layer * 0.15})`;
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  const color = STATE_COLORS[state];
  // Scale dynamique : suit le level, légère pulsation de respiration en idle.
  const scale = 1 + Math.min(0.18, level * 0.32);

  return (
    <div
      className={cn("relative w-[min(70vw,560px)] aspect-square flex items-center justify-center", className)}
      style={{
        // expose la teinte pour glow tailwind via inline-style (pas de classe dynamique)
        ["--orb-h" as any]: color.hue,
        ["--orb-s" as any]: `${color.sat}%`,
        ["--orb-l" as any]: `${color.light}%`,
      }}
    >
      {/* Halo externe diffus */}
      <div
        className="absolute inset-0 rounded-full blur-3xl transition-[background] duration-700"
        style={{
          background: `radial-gradient(circle at center, hsla(${color.hue}, ${color.sat}%, ${color.light}%, 0.55), transparent 70%)`,
        }}
      />

      {/* Canvas — onde + particules */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />

      {/* Sphère + anneaux SVG */}
      <svg
        viewBox="0 0 400 400"
        aria-hidden="true"
        className={cn(
          "relative w-[58%] h-[58%] transition-transform duration-150 ease-out",
          state === "idle" && "animate-orb",
        )}
        style={{ transform: `scale(${scale})` }}
      >
        <defs>
          <radialGradient id="orb-core" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor={`hsl(${color.hue}, ${color.sat}%, 88%)`} />
            <stop offset="55%" stopColor={`hsl(${color.hue}, ${color.sat}%, ${color.light}%)`} />
            <stop offset="100%" stopColor={`hsl(${color.hue}, ${color.sat}%, 22%)`} />
          </radialGradient>
          <linearGradient id="orb-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={`hsl(${color.hue}, ${color.sat}%, 80%)`} />
            <stop offset="100%" stopColor={`hsl(${color.hue + 30}, ${color.sat}%, 55%)`} />
          </linearGradient>
          <filter id="orb-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Glow interne */}
        <circle cx="200" cy="200" r="150" fill="url(#orb-core)" filter="url(#orb-glow)" opacity="0.85" />
        {/* Sphère nette */}
        <circle cx="200" cy="200" r="120" fill="url(#orb-core)" />
        {/* Reflet supérieur */}
        <ellipse cx="170" cy="155" rx="55" ry="28" fill={`hsla(${color.hue}, ${color.sat}%, 95%, 0.55)`} />

        {/* Anneaux orbitaux */}
        <g fill="none" stroke="url(#orb-ring)" strokeWidth="2.5" strokeLinecap="round" opacity="0.85">
          <g style={{ transformOrigin: "200px 200px", animation: `spin-slow ${state === "thinking" ? 6 : 14}s linear infinite` }}>
            <ellipse cx="200" cy="200" rx="155" ry="48" />
          </g>
          <g style={{ transformOrigin: "200px 200px", animation: `spin-rev ${state === "thinking" ? 8 : 18}s linear infinite`, transform: "rotate(60deg)" }}>
            <ellipse cx="200" cy="200" rx="160" ry="42" />
          </g>
          <g style={{ transformOrigin: "200px 200px", animation: `spin-slow ${state === "thinking" ? 10 : 22}s linear infinite`, transform: "rotate(120deg)" }}>
            <ellipse cx="200" cy="200" rx="150" ry="55" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export function getStateLabel(state: OrbState): string {
  return STATE_COLORS[state].label;
}