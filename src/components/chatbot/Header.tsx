import { User, LogOut, Settings as SettingsIcon, Coins, Shield, Infinity as InfinityIcon, Calendar, ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
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
  // Le bouton retour est masqué sur l'accueil (rien à quitter).
  const showBack = location.pathname !== "/";
  const goBack = () => {
    // Si on a un historique applicatif, on revient en arrière, sinon on rentre à l'accueil.
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };
  return (
    <header
      className="fixed top-0 left-0 md:[left:var(--sidebar-w,280px)] md:transition-[left] md:duration-300 right-0 h-14 flex items-center justify-end pl-14 pr-3 md:px-6 gap-2 z-40"
      style={{ background: "linear-gradient(90deg, hsl(0, 0%, 4%, 0.95), hsl(190, 70%, 18%, 0.95))" }}>
      {showBack && (
        <button
          onClick={goBack}
          title="Retour"
          aria-label="Retour"
          className="mr-auto w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      {/* Right actions */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <button
          onClick={() => navigate("/agenda")}
          title="Agenda"
          aria-label="Agenda"
          className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
        >
          <Calendar className="w-5 h-5" />
        </button>
        {isAdmin ? (
          <button
            onClick={() => navigate("/billing")}
            title="Admin — crédits illimités"
            aria-label="Admin — crédits illimités"
            className="h-9 px-3 rounded-lg flex items-center gap-1.5 text-white text-xs font-semibold transition-colors"
            style={{ background: "linear-gradient(135deg, hsl(45, 95%, 55%), hsl(35, 95%, 50%))" }}
          >
            <InfinityIcon className="w-4 h-4" />
            <span>Admin</span>
          </button>
        ) : (
          <button
            onClick={() => navigate("/billing")}
            title="Crédits & abonnement"
            aria-label="Crédits & abonnement"
            className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
          >
            <Coins className="w-5 h-5" />
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => navigate("/admin/users")}
            title="Administration"
            aria-label="Administration"
            className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
          >
            <Shield className="w-5 h-5" />
          </button>
        )}
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors">
              <User className="w-5 h-5" />
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
