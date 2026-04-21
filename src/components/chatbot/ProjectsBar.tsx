import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Search, FolderOpen, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProjects, ProjectCategory, SavedProject } from "@/contexts/ProjectsProvider";

interface ProjectsBarProps {
  category: ProjectCategory;
  /** Renvoie le snapshot à sauvegarder (état courant de la page) */
  getSnapshot: () => unknown;
  /** Appelé quand l'utilisateur charge un projet sauvegardé */
  onLoad?: (project: SavedProject) => void;
  className?: string;
}

export function ProjectsBar({ category, getSnapshot, onLoad, className }: ProjectsBarProps) {
  const { list, save, remove } = useProjects();
  const items = list(category);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }, [items, query]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const confirmSave = () => {
    const finalName = name.trim() || `Projet ${items.length + 1}`;
    const snap = getSnapshot();
    save(category, finalName, snap);
    toast.success(`Projet « ${finalName} » sauvegardé`);
    setName("");
    setSaving(false);
  };

  return (
    <div ref={containerRef} className={cn("relative flex items-center gap-2", className)}>
      {/* Save button / inline name input */}
      {saving ? (
        <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-lg border border-white/15 pl-3 pr-1 py-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmSave();
              if (e.key === "Escape") { setSaving(false); setName(""); }
            }}
            placeholder="Nom du projet..."
            className="bg-transparent outline-none text-sm placeholder:text-muted-foreground w-40"
          />
          <button
            onClick={confirmSave}
            className="p-1 rounded-md hover:bg-white/15 text-emerald-400"
            title="Confirmer"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setSaving(false); setName(""); }}
            className="p-1 rounded-md hover:bg-white/15 text-muted-foreground"
            title="Annuler"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSaving(true)}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur-md text-sm font-medium flex items-center gap-2 transition-colors border border-white/10"
          title="Sauvegarder ce projet"
        >
          <Save className="w-4 h-4" />
          Sauvegarder
        </button>
      )}

      {/* Search field */}
      <div className="relative">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 focus-within:bg-white/10 backdrop-blur-md border border-white/10 transition-colors">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Rechercher un projet..."
            className="bg-transparent outline-none text-sm placeholder:text-muted-foreground w-44"
          />
          {items.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">
              {items.length}
            </span>
          )}
        </div>

        {open && (
          <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-xl bg-popover/95 backdrop-blur-xl border border-border shadow-xl z-50">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                {items.length === 0
                  ? "Aucun projet sauvegardé"
                  : "Aucun résultat"}
              </div>
            ) : (
              <ul className="py-1">
                {filtered.map((p) => (
                  <li
                    key={p.id}
                    className="group flex items-center gap-2 px-3 py-2 hover:bg-accent/60 cursor-pointer"
                    onClick={() => {
                      onLoad?.(p);
                      setOpen(false);
                      toast.success(`« ${p.name} » chargé`);
                    }}
                  >
                    <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(p.id);
                        toast.success("Projet supprimé");
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-destructive transition-opacity"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}