import { Search, Bell, User, Plus } from "lucide-react";

interface HeaderProps {
  onNewChat?: () => void;
}

export function Header({ onNewChat }: HeaderProps = {}) {
  return (
    <header className="fixed top-0 left-[72px] right-0 h-14 flex items-center justify-between px-6 z-40"
      style={{ background: "linear-gradient(90deg, hsl(255, 75%, 50%, 0.9), hsl(290, 75%, 55%, 0.9))" }}>
      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
        <input
          type="text"
          placeholder="Search..."
          className="w-full h-9 pl-10 pr-4 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:bg-white/15 transition-all"
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="h-9 px-3 rounded-lg bg-white/15 hover:bg-white/25 flex items-center gap-2 text-white text-sm font-medium transition-colors border border-white/20"
            title="Démarrer une nouvelle conversation"
          >
            <Plus className="w-4 h-4" />
            Nouveau chat
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
