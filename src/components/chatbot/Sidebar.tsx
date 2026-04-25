import { Menu, X, Search, MessageSquare, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import nexLogo from "@/assets/nex-logo.png";
import { useProjects } from "@/contexts/ProjectsProvider";
import { toast } from "sonner";

const SIDEBAR_WIDTH = 280;

export function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { list, remove } = useProjects();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");

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

  const chats = list("ai-tools");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.name.toLowerCase().includes(q));
  }, [chats, query]);

  const loadChat = (proj: { id: string; name: string }) => {
    if (pathname !== "/") navigate("/");
    // Petit délai pour laisser Index monter avant de dispatch
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

  const panelContent = (compact: boolean) => (
    <div className="flex flex-col h-full">
      {/* Logo = AI Tools (lien vers /) */}
      <Link
        to="/"
        title="AI Tools"
        className={cn(
          "flex items-center gap-2.5 px-3 py-3 rounded-xl hover:bg-white/10 transition-colors",
          pathname === "/" && "bg-white/10"
        )}
      >
        <div className="w-9 h-9 rounded-xl overflow-hidden bg-black/40 flex items-center justify-center ring-1 ring-white/20 shadow-[0_0_18px_rgba(168,85,247,0.45)] flex-shrink-0">
          <img src={nexLogo} alt="Nex" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0">
          <div className="text-white font-semibold text-sm leading-tight">AI Tools</div>
          <div className="text-white/55 text-[11px] leading-tight">Nex assistant</div>
        </div>
      </Link>

      {/* Nouveau chat */}
      <button
        onClick={newChat}
        className="mt-3 mx-2 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium flex items-center gap-2 transition-colors border border-white/15"
      >
        <Plus className="w-4 h-4" />
        Nouveau chat
      </button>

      {/* Recherche */}
      <div className="mt-3 mx-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus-within:bg-white/15">
        <Search className="w-4 h-4 text-white/60 flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un chat..."
          className="bg-transparent outline-none text-sm text-white placeholder:text-white/50 w-full"
        />
      </div>

      {/* Historique */}
      <div className="mt-3 px-2 text-[10px] uppercase tracking-wider text-white/45 font-semibold">
        Historique
      </div>
      <div className="flex-1 overflow-y-auto mt-1 px-1 pb-3">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-white/45">
            {chats.length === 0 ? "Aucun chat sauvegardé" : "Aucun résultat"}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  onClick={() => loadChat(c)}
                  className="w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left hover:bg-white/10 transition-colors"
                >
                  <MessageSquare className="w-4 h-4 mt-0.5 text-white/60 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{c.name}</div>
                    <div className="text-[10px] text-white/45">
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
    </div>
  );

  // ─── Sidebar desktop (>= md) ───
  const desktopAside = (
    <aside
      className="fixed left-0 top-0 h-full hidden md:flex flex-col z-50"
      style={{
        width: `${SIDEBAR_WIDTH}px`,
        background: "linear-gradient(180deg, hsl(0, 0%, 4%), hsl(275, 85%, 30%))",
      }}
    >
      {panelContent(false)}
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
          "md:hidden fixed left-0 top-0 h-full w-72 max-w-[85vw] z-[61] flex flex-col transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ background: "linear-gradient(180deg, hsl(0, 0%, 4%), hsl(275, 85%, 30%))" }}
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
        {panelContent(false)}
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
