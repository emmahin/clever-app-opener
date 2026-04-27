import { useEffect, useState } from "react";

interface ChatOrbProps {
  isLoading?: boolean;
}

// Étoile à 4 branches centrée en (0,0), rayon = taille
function starPath(size: number) {
  const r = size;
  const t = size * 0.18; // épaisseur centrale
  return `M0 ${-r} L${t} ${-t} L${r} 0 L${t} ${t} L0 ${r} L${-t} ${-t} L${-r} 0 L${-t} ${-t} Z`;
}

// Génère un path d'ellipse parcourable par animateMotion
function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M ${cx - rx},${cy} a ${rx},${ry} 0 1,1 ${rx * 2},0 a ${rx},${ry} 0 1,1 ${-rx * 2},0`;
}

// Étoiles en orbite : (taille, id de l'orbite, durée, offset de départ en %)
const ORBITS = [
  // Anneau 1 (horizontal)
  { size: 22, orbit: "orbit-1", dur: 14, begin: 0, dir: 1 },
  { size: 12, orbit: "orbit-1", dur: 14, begin: 7, dir: 1 },
  // Anneau 2 (incliné -8°)
  { size: 18, orbit: "orbit-2", dur: 18, begin: 0, dir: -1 },
  { size: 10, orbit: "orbit-2", dur: 18, begin: 9, dir: -1 },
  // Anneau 3 (incliné +12°)
  { size: 20, orbit: "orbit-3", dur: 22, begin: 0, dir: 1 },
  { size: 14, orbit: "orbit-3", dur: 22, begin: 11, dir: 1 },
  { size: 8, orbit: "orbit-3", dur: 22, begin: 16, dir: 1 },
  // Anneau 4 (incliné +25°)
  { size: 16, orbit: "orbit-4", dur: 26, begin: 0, dir: -1 },
  { size: 9, orbit: "orbit-4", dur: 26, begin: 13, dir: -1 },
] as const;

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
      <svg
        viewBox="0 0 400 400"
        fill="none"
        aria-hidden="true"
        className={cn(
          "relative w-full h-full transition-transform duration-500",
          pulsing && "scale-105"
        )}
      >
        <defs>
          <filter id="orb-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="orb-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F5B8FF" />
            <stop offset="50%" stopColor="#C44CFF" />
            <stop offset="100%" stopColor="#8B2FD9" />
          </radialGradient>
          <linearGradient id="orb-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F5B8FF" />
            <stop offset="50%" stopColor="#C44CFF" />
            <stop offset="100%" stopColor="#8B2FD9" />
          </linearGradient>
          {/* Trajectoires des étoiles : mêmes ellipses que les anneaux visibles */}
          <path id="orbit-1" d={ellipsePath(200, 210, 120, 118)} />
          <path id="orbit-2" d={ellipsePath(205, 200, 118, 122)} />
          <path id="orbit-3" d={ellipsePath(195, 205, 122, 116)} />
          <path id="orbit-4" d={ellipsePath(200, 200, 116, 120)} />
        </defs>

        {/* Anneaux fixes (avec rotations comme avant) */}
        <g filter="url(#orb-glow)" fill="none" stroke="url(#orb-stroke)" strokeWidth={3} strokeLinecap="round">
          <ellipse cx="200" cy="210" rx="120" ry="118" />
          <g transform="rotate(-8 205 200)">
            <ellipse cx="205" cy="200" rx="118" ry="122" />
          </g>
          <g transform="rotate(12 195 205)">
            <ellipse cx="195" cy="205" rx="122" ry="116" />
          </g>
          <g transform="rotate(25 200 200)">
            <ellipse cx="200" cy="200" rx="116" ry="120" />
          </g>
        </g>

        {/* Étoiles : chacune suit son orbite (animateMotion) — comme les anneaux de Saturne */}
        <g filter="url(#orb-glow)" fill="url(#orb-fill)">
          {ORBITS.map((s, i) => {
            const rotate = s.orbit === "orbit-2" ? -8 : s.orbit === "orbit-3" ? 12 : s.orbit === "orbit-4" ? 25 : 0;
            const center = s.orbit === "orbit-1"
              ? { x: 200, y: 210 }
              : s.orbit === "orbit-2"
              ? { x: 205, y: 200 }
              : s.orbit === "orbit-3"
              ? { x: 195, y: 205 }
              : { x: 200, y: 200 };
            return (
              <g key={i} transform={`rotate(${rotate} ${center.x} ${center.y})`}>
                <path d={starPath(s.size)}>
                  <animateMotion
                    dur={`${s.dur}s`}
                    repeatCount="indefinite"
                    rotate="0"
                    keyPoints={s.dir === 1 ? "0;1" : "1;0"}
                    keyTimes="0;1"
                    calcMode="linear"
                    begin={`-${s.begin}s`}
                  >
                    <mpath href={`#${s.orbit}`} />
                  </animateMotion>
                </path>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}