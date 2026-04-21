import { Grid, Sparkles, Clapperboard, Activity, FileText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import nexLogo from "@/assets/nex-logo.png";

const navItems = [
  { icon: Sparkles, label: "AI Tools", to: "/" },
  { icon: Clapperboard, label: "Montage vidéo", to: "/video" },
  { icon: FileText, label: "Documents", to: "/documents" },
  { icon: Grid, label: "Dashboard", to: "/dashboard" },
  { icon: Activity, label: "Analytics", to: "/analytics" },
  { icon: Settings, label: "Settings", to: "/settings" },
];

export function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="fixed left-0 top-0 h-full w-[72px] flex flex-col items-center py-4 z-50"
      style={{ background: "linear-gradient(180deg, hsl(0, 0%, 4%), hsl(275, 85%, 45%))" }}>
      {/* Logo */}
      <div className="mb-6 w-10 h-10 rounded-xl overflow-hidden bg-black/40 flex items-center justify-center ring-1 ring-white/20 shadow-[0_0_20px_rgba(168,85,247,0.5)]">
        <img src={nexLogo} alt="Nex" className="w-full h-full object-cover" />
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-3">
        {navItems.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
                active
                  ? "bg-white/25 text-white shadow-lg"
                  : "text-white/60 hover:bg-white/15 hover:text-white"
              )}
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
            </Link>
          );
        })}
      </nav>

      {/* Bottom diamond icon */}
      <div className="mt-auto mb-4 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-glow">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
    </aside>
  );
}
