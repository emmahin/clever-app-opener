import {
  Menu,
  X,
  Search,
  MessageSquare,
  Trash2,
  Plus,
  Newspaper,
  Activity,
  Calendar,
  Settings as SettingsIcon,
  Mic,
  FileText,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import nexLogo from "@/assets/nex-logo.png";
import { useProjects } from "@/contexts/ProjectsProvider";
import { toast } from "sonner";

const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED = 64;
const STORAGE_KEY = "nex.sidebar.collapsed";

function setRootSidebarWidth(px: number) {
  document.documentElement.style.setProperty("--sidebar-w", `${px}px`);
}

export function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { list, remove } = useProjects();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [query, setQuery] = useState("");

  // Synchronise la variable CSS avec l'état (desktop uniquement, mobile = overlay)
  useEffect(() => {
    setRootSidebarWidth(collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH);
    try { window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* noop */ }
  }, [collapsed]);

  // Au mount, force la valeur initiale (au cas où une autre page n'aurait pas remonté Sidebar)
  useEffect(() => {
    setRootSidebarWidth(collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH);
  }, []);

  // Ferme automatiquement le drawer mobile au changement de route
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Bloque le scroll du body quand le drawer mobile est ouvert
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  const chats = list("ai-tools");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.name.toLowerCase().includes(q));
  }, [chats, query]);

  const loadChat = (proj: { id: string; name: string }) => {
    if (pathname !== "/") navigate("/");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("nex:loadChat", { detail: { id: proj.id } }));
    }, 50);
    toast.success(`« ${proj.name} » chargé`);
    setMobileOpen(false);
  };

  const newChat = () => {
    if (pathname !== "/") navigate("/");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("nex:newChat"));
    }, 50);
    setMobileOpen(false);
  };

  const handleLogoClick = () => {
    // Sur mobile (drawer), juste ferme
    // Sur desktop, toggle l'état replié
    setCollapsed((v) => !v);
  };

  const goAiTools = () => {
    if (pathname !== "/") navigate("/");
  };

  // ─── Nav rail (icônes principales toujours visibles) ───
  const navItems = [
    { to: "/", label: "AI Tools", icon: MessageSquare },
    { to: "/dashboard", label: "Dashboard", icon: Newspaper },
    { to: "/analytics", label: "Analytics", icon: Activity },
    { to: "/agenda", label: "Agenda", icon: Calendar },
    { to: "/documents", label: "Documents", icon: FileText },
    { to: "/video", label: "Video", icon: Video },
    { to: "/admin/voice", label: "Voice", icon: Mic },
    { to: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  const NavRailItem = ({ to, label, Icon }: { to: string; label: string; Icon: typeof MessageSquare }) => {
    const active = pathname === to;
    return (
      <button
        onClick={() => { navigate(to); setMobileOpen(false); }}
        title={label}
        className={cn(
          "group relative w-10 h-10 rounded-sm flex items-center justify-center transition-all border",
          active
            ? "bg-primary/20 text-primary border-primary/70 shadow-[0_0_14px_hsl(var(--primary)/0.55)]"
            : "text-primary/55 border-transparent hover:text-primary hover:bg-primary/10 hover:border-primary/40",
        )}
      >
        <Icon className="w-4 h-4" />
        {active && (
          <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full shadow-[0_0_6px_hsl(var(--primary))]" />
        )}
      </button>
    );
  };

  // ─── Contenu replié (rail vertical) ───
  const collapsedContent = (
    <div className="flex flex-col items-center h-full py-3 gap-2">
      <button
        onClick={handleLogoClick}
        title="Afficher l'historique"
        className="w-10 h-10 rounded-sm overflow-hidden bg-background border border-primary/60 shadow-[0_0_14px_hsl(var(--primary)/0.5)] hover:border-primary transition relative"
      >
        <img src={nexLogo} alt="Nex" className="w-full h-full object-cover" />
        <span className="pointer-events-none absolute inset-0 bg-primary/10 mix-blend-overlay" />
      </button>
      <span className="block w-6 h-px bg-primary/40 my-1" />
      {navItems.map((it) => (
        <NavRailItem key={it.to} to={it.to} label={it.label} Icon={it.icon} />
      ))}
      <span className="block w-6 h-px bg-primary/40 my-1" />
      <button
        onClick={newChat}
        title="Nouveau chat"
        className="w-10 h-10 rounded-sm flex items-center justify-center bg-primary/15 border border-primary/60 text-primary hover:bg-primary/25 hover:shadow-[0_0_12px_hsl(var(--primary)/0.55)] transition animate-hud-pulse"
      >
        <Plus className="w-4 h-4" />
      </button>
      <div className="mt-auto flex flex-col items-center gap-1 pb-2">
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-primary/50">NEX</span>
        <span className="block w-1 h-1 bg-primary rounded-full animate-hud-pulse" />
      </div>
    </div>
  );

  // ─── Contenu déployé ───
  const expandedContent = (
    <div className="flex flex-col h-full">
      {/* Logo cliquable = toggle volet */}
      <button
        onClick={handleLogoClick}
        title="Masquer l'historique"
        className="flex items-center gap-2.5 px-3 py-3 mx-1 mt-1 rounded-sm hover:bg-primary/10 border border-transparent hover:border-primary/40 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-sm overflow-hidden bg-background flex items-center justify-center border border-primary/60 shadow-[0_0_14px_hsl(var(--primary)/0.5)] flex-shrink-0">
          <img src={nexLogo} alt="Nex" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-bold uppercase tracking-[0.14em] text-neon leading-tight">NEX</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary/60 leading-tight mt-0.5">// AI cockpit</div>
        </div>
        <span className="ml-auto block w-1.5 h-1.5 rounded-full bg-primary animate-hud-pulse" />
      </button>

      {/* Mini nav rail horizontale */}
      <div className="mx-2 mt-2 px-2 py-2 rounded-sm border border-primary/30 bg-background/50 flex flex-wrap gap-1.5 justify-center">
        {navItems.slice(0, 8).map((it) => (
          <NavRailItem key={it.to} to={it.to} label={it.label} Icon={it.icon} />
        ))}
      </div>

      {/* Nouveau chat */}
      <button
        onClick={newChat}
        className="mt-3 mx-2 px-3 py-2 rounded-sm bg-primary/15 hover:bg-primary/25 text-primary text-xs font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2 transition-all border border-primary/60 hover:shadow-[0_0_14px_hsl(var(--primary)/0.5)] font-display"
      >
        <Plus className="w-3.5 h-3.5" />
        Nouveau chat
      </button>

      {/* Recherche */}
      <div className="mt-3 mx-2 flex items-center gap-2 px-3 py-2 rounded-sm bg-background/60 border border-primary/30 focus-within:border-primary focus-within:shadow-[0_0_10px_hsl(var(--primary)/0.45)] transition-all">
        <Search className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SEARCH..."
          className="bg-transparent outline-none text-xs text-primary placeholder:text-primary/40 placeholder:tracking-widest placeholder:uppercase w-full font-mono"
        />
      </div>

      {/* Historique */}
      <div className="mt-4 mx-3 flex items-center gap-2">
        <span className="block w-1 h-1 bg-primary rounded-full" />
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-primary/70">// LOGS</span>
        <span className="block flex-1 h-px bg-primary/25" />
        <span className="font-mono text-[9px] text-primary/50">{filtered.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto mt-1 px-1 pb-3">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center font-mono text-[10px] uppercase tracking-wider text-primary/40">
            {chats.length === 0 ? "// no logs" : "// no match"}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  onClick={() => loadChat(c)}
                  className="w-full flex items-start gap-2 px-3 py-2 rounded-sm text-left hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-primary/70 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground truncate">{c.name}</div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-primary/50">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(c.id); toast.success("Chat supprimé"); }}
                  className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-300 transition-opacity"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Footer status */}
      <div className="mx-2 mb-2 px-3 py-2 rounded-sm border border-primary/25 bg-background/50 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em]">
        <span className="flex items-center gap-1.5 text-primary/80">
          <span className="block w-1.5 h-1.5 rounded-full bg-primary animate-hud-pulse" />
          ONLINE
        </span>
        <span className="text-primary/50">CORE · STABLE</span>
      </div>
    </div>
  );

  // ─── Sidebar desktop (>= md) ───
  const desktopAside = (
    <aside
      className="fixed left-0 top-0 h-full hidden md:flex flex-col z-50 transition-[width] duration-300 ease-out overflow-hidden border-r border-primary/40 shadow-[0_0_30px_hsl(185_100%_50%_/_0.25)]"
      style={{
        width: collapsed ? `${SIDEBAR_COLLAPSED}px` : `${SIDEBAR_WIDTH}px`,
        background:
          "linear-gradient(180deg, hsl(200 85% 4%) 0%, hsl(200 80% 6%) 50%, hsl(200 85% 3%) 100%)",
      }}
    >
      {/* Decorative HUD vertical line */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/70 to-transparent" />
      <div className="pointer-events-none absolute right-2 top-12 w-2 h-2 border-r border-t border-primary/70" />
      <div className="pointer-events-none absolute right-2 bottom-12 w-2 h-2 border-r border-b border-primary/70" />
      {collapsed ? collapsedContent : expandedContent}
    </aside>
  );

  // ─── Bouton hamburger (mobile uniquement) ───
  const mobileToggle = (
    <button
      type="button"
      onClick={() => setMobileOpen(true)}
      aria-label="Ouvrir le menu"
      className="md:hidden fixed top-2.5 left-2.5 z-50 w-10 h-10 rounded-sm bg-background/80 backdrop-blur-md border border-primary/60 text-primary flex items-center justify-center shadow-[0_0_14px_hsl(var(--primary)/0.4)] active:scale-95 transition-transform"
    >
      <Menu className="w-5 h-5" />
    </button>
  );

  // ─── Drawer mobile ───
  const mobileDrawer = (
    <>
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          "md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity duration-200",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "md:hidden fixed left-0 top-0 h-full w-72 max-w-[85vw] z-[61] flex flex-col transition-transform duration-200 ease-out border-r border-primary/40",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          background:
            "linear-gradient(180deg, hsl(200 85% 4%) 0%, hsl(200 80% 6%) 50%, hsl(200 85% 3%) 100%)",
        }}
        aria-label="Menu de navigation"
      >
        <div className="flex items-center justify-end px-2 pt-2">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
            className="w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {expandedContent}
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

export const SIDEBAR_WIDTH_PX = SIDEBAR_WIDTH;
