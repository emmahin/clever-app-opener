import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Square, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";
import { cn } from "@/lib/utils";

/**
 * VoiceOrb — Interface vocale immersive façon Jarvis.
 * Sphère centrale animée sur Canvas qui réagit au volume du micro
 * (audioLevel exposé par TwinVoiceProvider) et change de couleur
 * selon l'état (idle / listening / thinking / speaking).
 */
export default function VoiceOrb() {
  const { isCallActive, status, transcript, audioLevel, startCall, endCall, supported } =
    useTwinVoiceContext();
  const [muted, setMuted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Démarrage automatique de l'appel à l'arrivée sur la page.
  useEffect(() => {
    if (supported && !isCallActive) {
      void startCall();
    }
    return () => {
      endCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───── Canvas : sphère néon réactive ─────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    let breath = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Couleurs par état (HSL).
    const palette: Record<string, { core: string; glow: string; ring: string }> = {
      idle:       { core: "180 80% 60%", glow: "200 90% 55%", ring: "210 80% 50%" },
      listening:  { core: "200 100% 60%", glow: "210 100% 55%", ring: "220 100% 60%" },
      thinking:   { core: "275 90% 65%",  glow: "285 95% 60%",  ring: "295 90% 60%" },
      speaking:   { core: "180 100% 60%", glow: "175 100% 55%", ring: "190 100% 60%" },
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.18;

      t += 0.016;
      breath = (Math.sin(t * 1.2) + 1) / 2; // 0..1

      // Niveau effectif : audioLevel quand on écoute, sinon respiration / pulsations.
      let level = 0;
      if (status === "listening") level = audioLevel;
      else if (status === "thinking") level = 0.25 + 0.15 * Math.sin(t * 4);
      else if (status === "speaking") level = 0.35 + 0.25 * Math.sin(t * 6);
      else level = 0.08 + breath * 0.06;

      const radius = baseR * (1 + level * 0.55);
      const c = palette[status] ?? palette.idle;

      // Clear avec léger trail pour un effet motion.
      ctx.fillStyle = "rgba(5, 6, 18, 0.35)";
      ctx.fillRect(0, 0, w, h);

      // Halo externe.
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 4);
      halo.addColorStop(0, `hsla(${c.glow} / ${0.45 + level * 0.3})`);
      halo.addColorStop(1, "hsla(0 0% 0% / 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 4, 0, Math.PI * 2);
      ctx.fill();

      // Anneaux concentriques (ondes).
      for (let i = 0; i < 4; i++) {
        const phase = (t * 0.6 + i * 0.25) % 1;
        const rr = radius * (1.2 + phase * 2.4);
        const alpha = (1 - phase) * (0.25 + level * 0.4);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${c.ring} / ${alpha})`;
        ctx.lineWidth = 1 + level * 1.5;
        ctx.stroke();
      }

      // Sphère déformée (waveform autour du cercle).
      ctx.beginPath();
      const segments = 96;
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const noise =
          Math.sin(a * 5 + t * 2) * 0.5 +
          Math.sin(a * 9 - t * 1.4) * 0.3 +
          Math.sin(a * 3 + t * 0.8) * 0.4;
        const r = radius * (1 + noise * (0.04 + level * 0.18));
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const fill = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
      fill.addColorStop(0, `hsla(${c.core} / 0.95)`);
      fill.addColorStop(0.6, `hsla(${c.glow} / 0.55)`);
      fill.addColorStop(1, `hsla(${c.ring} / 0.05)`);
      ctx.fillStyle = fill;
      ctx.shadowBlur = 60 + level * 80;
      ctx.shadowColor = `hsla(${c.glow} / 0.9)`;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Cœur lumineux.
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.5);
      core.addColorStop(0, `hsla(0 0% 100% / ${0.8 + level * 0.2})`);
      core.addColorStop(1, `hsla(${c.core} / 0)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [status, audioLevel]);

  const statusLabel: Record<string, string> = {
    idle: "En veille",
    listening: "À l'écoute",
    thinking: "Réflexion",
    speaking: "Réponse",
  };

  const statusColor: Record<string, string> = {
    idle: "text-cyan-300",
    listening: "text-sky-300",
    thinking: "text-cyan-300",
    speaking: "text-cyan-200",
  };

  const toggleMute = () => {
    if (muted) {
      setMuted(false);
      void startCall();
    } else {
      setMuted(true);
      endCall();
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#03040d] text-foreground">
      {/* Fond spatial */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 40%, hsl(230 80% 18% / 0.9), transparent 70%), radial-gradient(ellipse 60% 60% at 20% 80%, hsl(275 80% 15% / 0.8), transparent 70%), radial-gradient(ellipse 60% 60% at 80% 20%, hsl(195 80% 14% / 0.8), transparent 70%), #03040d",
        }}
      />
      {/* Étoiles */}
      <Stars />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-5">
        <Link
          to="/home"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-cyan-200/80 hover:text-cyan-100 border border-cyan-400/20 hover:border-cyan-400/40 bg-cyan-500/5 hover:bg-cyan-500/10 backdrop-blur-sm transition-colors"
        >
          <MessageSquare className="size-3.5" />
          Chat principal
        </Link>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full animate-pulse",
              status === "listening" && "bg-sky-400 shadow-[0_0_12px_hsl(200_100%_60%)]",
              status === "thinking" && "bg-cyan-400 shadow-[0_0_12px_hsl(275_90%_65%)]",
              status === "speaking" && "bg-cyan-300 shadow-[0_0_12px_hsl(180_100%_60%)]",
              status === "idle" && "bg-cyan-400/60",
            )}
          />
          <span className={cn("text-xs uppercase tracking-[0.25em]", statusColor[status])}>
            {statusLabel[status]}
          </span>
        </div>
      </div>

      {/* Canvas central */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Sphère vocale réactive"
      />

      {/* Transcription discrète (3 derniers tours) */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[68%] z-10 w-full max-w-2xl px-6 space-y-2 pointer-events-none">
        {transcript.slice(-3).map((turn) => (
          <div
            key={turn.id}
            className={cn(
              "text-center text-sm leading-relaxed transition-opacity",
              turn.role === "user"
                ? "text-sky-200/80"
                : "text-cyan-100/90 font-light",
            )}
          >
            {turn.role === "user" ? "❯ " : ""}
            {turn.text}
          </div>
        ))}
      </div>

      {/* Contrôles */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4">
        <Button
          onClick={toggleMute}
          size="lg"
          variant="outline"
          className={cn(
            "h-14 w-14 rounded-full border-2 backdrop-blur-md transition-all",
            muted
              ? "border-rose-400/60 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
              : "border-cyan-300/50 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20 shadow-[0_0_30px_hsl(190_100%_55%/0.4)]",
          )}
          aria-label={muted ? "Réactiver le micro" : "Couper le micro"}
        >
          {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </Button>

        <Button
          onClick={() => {
            endCall();
            setMuted(true);
          }}
          disabled={!isCallActive}
          size="lg"
          variant="outline"
          className={cn(
            "h-14 w-14 rounded-full border-2 backdrop-blur-md transition-all",
            "border-rose-400/60 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25",
            "shadow-[0_0_30px_hsl(0_85%_60%/0.35)]",
            "disabled:opacity-40 disabled:shadow-none",
          )}
          aria-label="Arrêter l'enregistrement"
          title="Arrêter l'enregistrement"
        >
          <Square className="size-5 fill-current" />
        </Button>

        <Button
          asChild
          size="lg"
          variant="outline"
          className="h-14 w-14 rounded-full border-2 border-white/10 bg-white/5 text-white/70 hover:bg-white/10 backdrop-blur-md"
          aria-label="Quitter"
        >
          <Link to="/">
            <X className="size-5" />
          </Link>
        </Button>
      </div>

      {!supported && (
        <div className="absolute inset-x-0 bottom-32 z-10 text-center text-sm text-rose-300">
          Ton navigateur ne supporte pas l'accès au micro.
        </div>
      )}
    </div>
  );
}

/** Champ d'étoiles statique (CSS) — léger, pas de canvas dédié. */
function Stars() {
  // Génère 60 points aléatoires une seule fois.
  const [stars] = useState(() =>
    Array.from({ length: 60 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      s: Math.random() * 1.6 + 0.3,
      d: Math.random() * 4 + 2,
      o: Math.random() * 0.6 + 0.2,
    })),
  );
  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.s}px`,
            height: `${s.s}px`,
            opacity: s.o,
            animationDuration: `${s.d}s`,
          }}
        />
      ))}
    </div>
  );
}
