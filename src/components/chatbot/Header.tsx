import { User, Plus, LogOut, Settings as SettingsIcon } from "lucide-react";
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageProvider";
import { NotificationBell } from "./NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  onNewChat?: () => void;
  searchSlot?: ReactNode;
}

export function Header({ onNewChat, searchSlot }: HeaderProps = {}) {
  const { t } = useLanguage();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="fixed top-0 left-[72px] right-0 h-14 flex items-center justify-between px-6 z-40"
      style={{ background: "linear-gradient(90deg, hsl(0, 0%, 4%, 0.95), hsl(275, 85%, 45%, 0.95))" }}>
      {/* Search slot (champ contrôlé par Index) */}
      {searchSlot}

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="h-9 px-3 rounded-lg bg-white/15 hover:bg-white/25 flex items-center gap-2 text-white text-sm font-medium transition-colors border border-white/20"
            title={t("newChatTitle")}
          >
            <Plus className="w-4 h-4" />
            {t("newChat")}
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
