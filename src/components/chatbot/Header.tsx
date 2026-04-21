import { Bell, User, Plus } from "lucide-react";
import { ReactNode } from "react";
import { LanguageSelector } from "./LanguageSelector";
import { useLanguage } from "@/i18n/LanguageProvider";

interface HeaderProps {
  onNewChat?: () => void;
  searchSlot?: ReactNode;
}

export function Header({ onNewChat, searchSlot }: HeaderProps = {}) {
  const { t } = useLanguage();
  return (
    <header className="fixed top-0 left-[72px] right-0 h-14 flex items-center justify-between px-6 z-40"
      style={{ background: "linear-gradient(90deg, hsl(255, 75%, 50%, 0.9), hsl(290, 75%, 55%, 0.9))" }}>
      {/* Search slot (champ contrôlé par Index) */}
      {searchSlot}

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <LanguageSelector />
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
        <button className="w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/15 transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <button className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors">
          <User className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
