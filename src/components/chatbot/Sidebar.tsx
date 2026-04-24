import { Sparkles, Settings, MessageCircle, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import nexLogo from "@/assets/nex-logo.png";

const navItems = [
  { icon: Sparkles, label: "AI Tools", to: "/" },
  { icon: MessageCircle, label: "WhatsApp", to: "/whatsapp" },
  { icon: Settings, label: "Settings", to: "/settings" },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Ferme automatiquement le drawer au changement de route
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Bloque le scroll du body quand le drawer mobile est ouvert
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  // ─── Sidebar desktop (>= md) ─── INCHANGÉE pour la version web ───
  const desktopAside = (
    <aside
      className="fixed left-0 top-0 h-full w-[72px] hidden md:flex flex-col items-center py-4 z-50"
      style={{ background: "linear-gradient(180deg, hsl(0, 0%, 4%), hsl(275, 85%, 45%))" }}
    >
      <div className="mb-6 w-10 h-10 rounded-xl overflow-hidden bg-black/40 flex items-center justify-center ring-1 ring-white/20 shadow-[0_0_20px_rgba(168,85,247,0.5)]">
        <img src={nexLogo} alt="Nex" className="w-full h-full object-cover" />
      </div>
      <nav className="flex flex-col gap-3">
        {navItems.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
                active ? "bg-white/25 text-white shadow-lg" : "text-white/60 hover:bg-white/15 hover:text-white",
              )}
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto mb-4 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-glow">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
    </aside>
  );

  // ─── Bouton hamburger (mobile uniquement) ───
  const mobileToggle = (
    <button
      type="button"
      onClick={() => setMobileOpen(true)}
      aria-label="Ouvrir le menu"
      className="md:hidden fixed top-2.5 left-2.5 z-50 w-10 h-10 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
    >
      <Menu className="w-5 h-5" />
    </button>
  );

  // ─── Drawer mobile ───
  const mobileDrawer = (
    <>
      {/* Overlay */}
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          "md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity duration-200",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-hidden="true"
      />
      {/* Panel */}
      <aside
        className={cn(
          "md:hidden fixed left-0 top-0 h-full w-64 max-w-[80vw] z-[61] flex flex-col py-4 px-3 transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ background: "linear-gradient(180deg, hsl(0, 0%, 4%), hsl(275, 85%, 35%))" }}
        aria-label="Menu de navigation"
      >
        <div className="flex items-center justify-between mb-6 px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-black/40 flex items-center justify-center ring-1 ring-white/20">
              <img src={nexLogo} alt="Nex" className="w-full h-full object-cover" />
            </div>
            <span className="text-white font-semibold text-base">Nex</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
            className="w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 h-11 rounded-lg text-sm font-medium transition-colors",
                  active ? "bg-white/20 text-white" : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );

  return (
    <>
      {desktopAside}
      {mobileToggle}
      {mobileDrawer}
    </>
  );
}
