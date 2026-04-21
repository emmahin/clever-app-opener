import { Grid, Sparkles, Video, Activity, FileText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Grid, label: "Dashboard" },
  { icon: Sparkles, label: "AI Tools", active: true },
  { icon: Video, label: "Media" },
  { icon: Activity, label: "Analytics" },
  { icon: FileText, label: "Documents" },
  { icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-[72px] flex flex-col items-center py-4 z-50"
      style={{ background: "linear-gradient(180deg, hsl(280, 70%, 45%), hsl(315, 75%, 55%))" }}>
      {/* Logo */}
      <div className="mb-6 w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
        <span className="text-white font-bold text-lg">OK</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-3">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
              item.active
                ? "bg-white/25 text-white shadow-lg"
                : "text-white/60 hover:bg-white/15 hover:text-white"
            )}
            title={item.label}
          >
            <item.icon className="w-5 h-5" />
          </button>
        ))}
      </nav>

      {/* Bottom diamond icon */}
      <div className="mt-auto mb-4 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-glow">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
    </aside>
  );
}
