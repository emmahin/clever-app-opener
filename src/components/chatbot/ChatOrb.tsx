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
        </defs>

        {/* Anneaux fixes */}
        <g filter="url(#orb-glow)" fill="none" stroke="url(#orb-stroke)" strokeWidth={3} strokeLinecap="round">
          <ellipse cx="200" cy="210" rx="120" ry="118" />
          <ellipse cx="205" cy="200" rx="118" ry="122" transform="rotate(-8 205 200)" />
          <ellipse cx="195" cy="205" rx="122" ry="116" transform="rotate(12 195 205)" />
          <ellipse cx="200" cy="200" rx="116" ry="120" transform="rotate(25 200 200)" />
        </g>

        {/* Étoiles en orbite autour du centre (200,200) */}
        <g
          filter="url(#orb-glow)"
          fill="url(#orb-fill)"
          style={{
            transformOrigin: "200px 200px",
            transformBox: "fill-box",
            animation: "orbit-spin 18s linear infinite",
          }}
        >
          <path d="M90 100 L96 142 L138 148 L96 154 L90 196 L84 154 L42 148 L84 142 Z" />
          <path d="M170 80 L174 108 L202 112 L174 116 L170 144 L166 116 L138 112 L166 108 Z" />
          <path d="M140 180 L143 200 L163 203 L143 206 L140 226 L137 206 L117 203 L137 200 Z" />
          <path d="M50 220 L52 233 L65 235 L52 237 L50 250 L48 237 L35 235 L48 233 Z" />
          <path d="M300 280 L306 322 L348 328 L306 334 L300 376 L294 334 L252 328 L294 322 Z" />
          <path d="M230 250 L234 278 L262 282 L234 286 L230 314 L226 286 L198 282 L226 278 Z" />
          <path d="M360 230 L363 252 L385 255 L363 258 L360 280 L357 258 L335 255 L357 252 Z" />
          <path d="M210 340 L213 360 L233 363 L213 366 L210 386 L207 366 L187 363 L207 360 Z" />
          <path d="M370 360 L372 372 L384 374 L372 376 L370 388 L368 376 L356 374 L368 372 Z" />
        </g>
      </svg>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
