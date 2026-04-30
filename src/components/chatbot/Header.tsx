import { User, LogOut, Settings as SettingsIcon, Coins, Shield, Infinity as InfinityIcon, Calendar, ArrowLeft, Phone, Mic, MicOff, Square } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  /** Conservé pour compatibilité, mais plus utilisé (le bouton est dans la sidebar). */
  onNewChat?: () => void;
}

export function Header(_props: HeaderProps = {}) {
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const voice = useTwinVoiceContext();
  // Le bouton retour est masqué sur l'accueil (rien à quitter).
  const showBack = location.pathname !== "/";
  const goBack = () => {
    // Si on a un historique applicatif, on revient en arrière, sinon on rentre à l'accueil.
    if (window.history.length > 1) navigate(-1);
    else navigate("/app");
  };
  // Bouton « Mode vocal » : toggle l'appel directement (inline dans /app).
  // Si on n'est pas sur /app, on y navigue d'abord, puis on déclenche le démarrage.
  const startVoice = () => {
    if (location.pathname !== "/") {
      navigate("/app");
      setTimeout(() => window.dispatchEvent(new Event("app:start-voice")), 250);
    } else {
      window.dispatchEvent(new Event("app:start-voice"));
    }
  };
  const stopVoice = () => {
    window.dispatchEvent(new Event("app:stop-voice"));
  };
  const isCallActive = voice.isCallActive;
  return (
    <header
      className="fixed top-0 left-0 md:[left:var(--sidebar-w,280px)] md:transition-[left] md:duration-300 right-0 h-12 flex items-center justify-end pl-14 pr-3 md:px-5 gap-1.5 z-40 border-b border-white/5"
      style={{ background: "linear-gradient(90deg, hsl(0, 0%, 2%, 0.95), hsl(265, 18%, 5%, 0.95))" }}>
      {showBack && (
        <div className="mr-auto flex items-center gap-1.5">
          <button
            onClick={goBack}
            title="Retour"
            aria-label="Retour"
            className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Contrôles vocaux dans la barre du haut — visibles partout */}
      <div className={showBack ? "flex items-center gap-1.5" : "mr-auto flex items-center gap-1.5"}>
        {!isCallActive ? (
          <button
            onClick={startVoice}
            title="Démarrer le mode vocal"
            aria-label="Démarrer le mode vocal"
            className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-white text-[11px] font-semibold transition-colors"
            style={{ background: "linear-gradient(135deg, hsl(265, 30%, 18%), hsl(280, 25%, 14%))" }}
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vocal</span>
          </button>
        ) : (
          <>
            <button
              onClick={() => voice.setMuted(!voice.muted)}
              title={voice.muted ? "Réactiver le micro" : "Couper le micro"}
              aria-label={voice.muted ? "Réactiver le micro" : "Couper le micro"}
              className={
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors " +
                (voice.muted
                  ? "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
                  : "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25")
              }
            >
              {voice.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={stopVoice}
              title="Arrêter l'enregistrement"
              aria-label="Arrêter l'enregistrement"
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
            <span className="hidden sm:inline text-[11px] text-white/70 ml-1">
              {voice.status === "speaking" ? "Lia parle…" : voice.status === "thinking" ? "Réflexion…" : "À l'écoute"}
            </span>
          </>
        )}
      </div>
      {/* Right actions */}
      <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
        <button
          onClick={() => navigate("/agenda")}
          title="Agenda"
          aria-label="Agenda"
          className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
        >
          <Calendar className="w-4 h-4" />
        </button>
        {isAdmin ? (
          <button
            onClick={() => navigate("/billing")}
            title="Admin — crédits illimités"
            aria-label="Admin — crédits illimités"
            className="h-8 px-2.5 rounded-lg flex items-center gap-1 text-white text-[11px] font-semibold transition-colors"
            style={{ background: "linear-gradient(135deg, hsl(45, 95%, 55%), hsl(35, 95%, 50%))" }}
          >
            <InfinityIcon className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        ) : (
          <button
            onClick={() => navigate("/billing")}
            title="Crédits & abonnement"
            aria-label="Crédits & abonnement"
            className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <Coins className="w-4 h-4" />
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => navigate("/admin/users")}
            title="Administration"
            aria-label="Administration"
            className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <Shield className="w-4 h-4" />
          </button>
        )}
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
              <User className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {user && (
              <>
                <DropdownMenuLabel className="font-normal">
                  <div className="text-xs text-muted-foreground">Connecté en tant que</div>
                  <div className="text-sm truncate">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <SettingsIcon className="w-4 h-4 mr-2" />
              Paramètres
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate("/admin/users")}>
                <Shield className="w-4 h-4 mr-2" />
                Administration
              </DropdownMenuItem>
            )}
            {user && (
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="w-4 h-4 mr-2" />
                Se déconnecter
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
