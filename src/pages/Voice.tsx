import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, LayoutGrid, Volume2, VolumeX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";
import { VoiceOrb, getStateLabel, type OrbState } from "@/components/voice/VoiceOrb";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Routes accessibles à la voix. On réutilise la logique éprouvée de
 * VoiceCallMode mais en mode plus large : ici, l'utilisateur PARLE pour
 * naviguer dans toute l'app.
 */
function detectRoute(text: string): { path: string; label: string } | null {
  const t = text.toLowerCase();
  const triggers = /\b(ouvre|ouvrir|va|vas|aller|am[eè]ne|emm[eè]ne|montre|montrer|affiche|afficher|acc[eè]de|retour|retourne|reviens|page|menu)\b/;
  if (!triggers.test(t)) return null;
  const map: Array<{ path: string; label: string; re: RegExp }> = [
    { path: "/menu",          label: "Chat",            re: /\b(menu|chat|discussion|conversation|messages?)\b/ },
    { path: "/agenda",        label: "Agenda",          re: /\b(agenda|calendrier|planning|emploi du temps|rendez[-\s]?vous|rdv)\b/ },
    { path: "/dashboard",     label: "Tableau de bord", re: /\b(tableau de bord|dashboard|accueil)\b/ },
    { path: "/analytics",     label: "Analytics",       re: /\b(analytics|analyses?|statistiques?|stats)\b/ },
    { path: "/documents",     label: "Documents",       re: /\b(documents?|fichiers?)\b/ },
    { path: "/video",         label: "Éditeur vidéo",   re: /\b(vid[ée]o|montage)\b/ },
    { path: "/notifications", label: "Notifications",   re: /\b(notifications?|alertes?)\b/ },
    { path: "/settings",      label: "Paramètres",      re: /\b(param[èe]tres?|r[ée]glages?|settings?|pr[ée]f[ée]rences?)\b/ },
    { path: "/billing",       label: "Facturation",     re: /\b(facturation|abonnement|billing|cr[ée]dits?)\b/ },
  ];
  for (const r of map) if (r.re.test(t)) return { path: r.path, label: r.label };
  return null;
}

/**
 * Page d'accueil — Assistant vocal immersif (style Jarvis).
 * L'utilisateur parle, l'orbe réagit, l'IA répond. Toutes les autres pages
 * de l'app restent accessibles : à la souris via la sidebar, à la voix via
 * "ouvre l'agenda", "ouvre le menu", etc.
 */
export default function Voice() {
  const navigate = useNavigate();
  const {
    isCallActive,
    status,
    transcript,
    audioLevel,
    supported,
    startCall,
    endCall,
  } = useTwinVoiceContext();

  const [muted, setMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [starting, setStarting] = useState(false);
  const handledIdsRef = useRef<Set<string>>(new Set());

  // Mappe le status interne du provider vers l'état visuel de l'orbe.
  const orbState: OrbState = !isCallActive
    ? "idle"
    : status === "thinking"
    ? "thinking"
    : status === "speaking"
    ? "speaking"
    : status === "listening"
    ? "listening"
    : "idle";

  // Démarrage automatique au mount si supporté.
  useEffect(() => {
    if (!supported || isCallActive || muted) return;
    let cancelled = false;
    setStarting(true);
    startCall()
      .catch((err) => {
        if (cancelled) return;
        console.warn("[Voice] startCall failed", err);
        toast.error("Micro indisponible. Active-le et réessaie.");
      })
      .finally(() => { if (!cancelled) setStarting(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // Coupe l'appel quand on quitte la page.
  useEffect(() => () => { endCall(); }, [endCall]);

  // Détection d'intention vocale → navigation.
  useEffect(() => {
    transcript.forEach((turn) => {
      if (turn.role !== "user" || handledIdsRef.current.has(turn.id)) return;
      handledIdsRef.current.add(turn.id);
      const route = detectRoute(turn.text);
      if (route) {
        toast.success(`Direction : ${route.label}`);
        navigate(route.path);
      }
    });
  }, [transcript, navigate]);

  const toggleMute = useCallback(async () => {
    if (muted) {
      setMuted(false);
      try { await startCall(); } catch (e) { console.warn(e); }
    } else {
      setMuted(true);
      endCall();
    }
  }, [muted, startCall, endCall]);

  const lastUser = [...transcript].reverse().find((t) => t.role === "user");
  const lastAssistant = [...transcript].reverse().find((t) => t.role === "assistant");

  return (
    <>
      <Sidebar />
      <main
        className="min-h-screen w-full md:[padding-left:var(--sidebar-w,280px)] md:transition-[padding] md:duration-300 relative overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 30% 20%, hsl(265 80% 22% / 0.9), transparent 60%)," +
            "radial-gradient(ellipse 80% 60% at 75% 80%, hsl(195 90% 18% / 0.85), transparent 60%)," +
            "linear-gradient(160deg, hsl(240 60% 6%) 0%, hsl(255 70% 8%) 50%, hsl(225 60% 5%) 100%)",
        }}
      >
        {/* Étoiles d'arrière-plan (pseudo-particules immobiles, ultra léger) */}
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
          <div className="absolute inset-0" style={{
            backgroundImage:
              "radial-gradient(1px 1px at 12% 18%, white, transparent 50%)," +
              "radial-gradient(1px 1px at 28% 72%, white, transparent 50%)," +
              "radial-gradient(1.5px 1.5px at 55% 33%, white, transparent 50%)," +
              "radial-gradient(1px 1px at 78% 22%, white, transparent 50%)," +
              "radial-gradient(1px 1px at 88% 64%, white, transparent 50%)," +
              "radial-gradient(1.5px 1.5px at 42% 88%, white, transparent 50%)," +
              "radial-gradient(1px 1px at 65% 75%, white, transparent 50%)",
            opacity: 0.55,
          }} />
        </div>

        {/* Bouton retour menu (haut droit) */}
        <button
          onClick={() => navigate("/menu")}
          className="absolute top-4 right-4 z-30 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm backdrop-blur-md transition"
          aria-label="Ouvrir le menu (chat)"
        >
          <LayoutGrid className="w-4 h-4" />
          <span className="hidden sm:inline">Menu</span>
        </button>

        {/* Contenu central */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-16">
          <VoiceOrb state={orbState} level={muted ? 0 : audioLevel} />

          {/* Pastille d'état */}
          <div className="mt-8 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/85 text-sm backdrop-blur">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                orbState === "listening" && "bg-cyan-400 animate-pulse",
                orbState === "thinking" && "bg-fuchsia-400 animate-pulse",
                orbState === "speaking" && "bg-teal-300 animate-pulse",
                orbState === "idle" && "bg-blue-400/60",
              )}
            />
            {muted ? "Micro coupé" : starting ? "Démarrage…" : getStateLabel(orbState)}
          </div>

          {/* Transcription discrète */}
          {showTranscript && (lastUser || lastAssistant) && (
            <div className="mt-8 w-full max-w-2xl space-y-2 text-center">
              {lastUser && (
                <p className="text-white/55 text-sm italic">« {lastUser.text} »</p>
              )}
              {lastAssistant && (
                <p className="text-white text-base leading-relaxed">{lastAssistant.text}</p>
              )}
            </div>
          )}
        </div>

        {/* Barre d'actions bas */}
        <div className="absolute bottom-6 left-0 right-0 z-30 flex items-center justify-center gap-3 px-4">
          <button
            onClick={() => setShowTranscript((v) => !v)}
            title={showTranscript ? "Masquer la transcription" : "Afficher la transcription"}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 backdrop-blur-md text-white/80 flex items-center justify-center transition"
          >
            {showTranscript ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          <button
            onClick={toggleMute}
            disabled={!supported}
            className={cn(
              "relative w-16 h-16 rounded-full flex items-center justify-center transition shadow-[0_0_30px_rgba(120,180,255,0.45)] border",
              muted
                ? "bg-red-500/30 border-red-300/40 text-red-100 hover:bg-red-500/40"
                : "bg-cyan-400/20 border-cyan-300/40 text-cyan-100 hover:bg-cyan-400/30",
            )}
            title={muted ? "Activer le micro" : "Couper le micro"}
            aria-label={muted ? "Activer le micro" : "Couper le micro"}
          >
            {muted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
          </button>

          <button
            onClick={() => navigate("/menu")}
            title="Aller au chat"
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 backdrop-blur-md text-white/80 flex items-center justify-center transition"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      </main>
    </>
  );
}