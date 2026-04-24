import { useMemo, useState } from "react";
import {
  FolderTree,
  Folder,
  File as FileIcon,
  ChevronDown,
  ChevronRight,
  Download,
  Sparkles,
  Loader2,
} from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { getOrganizeFiles } from "@/lib/organizeRegistry";

interface OrganizeFilesWidgetProps {
  root_name: string;
  total: number;
  categories: Record<string, number>;
  mapping: { from: string; to: string }[];
  explanation?: string;
  /** id du message hôte — utilisé pour récupérer les fichiers bruts du registre. */
  messageId?: string;
}

type Node = {
  name: string;
  isDir: boolean;
  children: Record<string, Node>;
};

function buildTreeFromPaths(rootName: string, paths: string[]): Node {
  const root: Node = { name: rootName, isDir: true, children: {} };
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!node.children[part]) {
        node.children[part] = { name: part, isDir: !isLast, children: {} };
      }
      node = node.children[part];
    }
  }
  return root;
}

function buildSourceTree(files: File[]): Node {
  const root: Node = { name: "source", isDir: true, children: {} };
  for (const f of files) {
    const rel = (f as any).webkitRelativePath || f.name;
    const parts = rel.split("/").filter(Boolean);
    if (root.name === "source" && parts.length > 1) root.name = parts[0];
    let node = root;
    const start = parts.length > 1 ? 1 : 0;
    for (let i = start; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!node.children[part]) {
        node.children[part] = { name: part, isDir: !isLast, children: {} };
      }
      node = node.children[part];
    }
  }
  return root;
}

function TreeView({ node, depth = 0, defaultOpenDepth = 2 }: { node: Node; depth?: number; defaultOpenDepth?: number }) {
  const [open, setOpen] = useState(depth < defaultOpenDepth);
  const entries = Object.values(node.children).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => node.isDir && setOpen((v) => !v)}
        className={`w-full flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-white/5 text-left ${
          node.isDir ? "text-foreground" : "text-muted-foreground"
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {node.isDir ? (
          open ? (
            <ChevronDown className="w-3 h-3 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
          )
        ) : (
          <span className="w-3" />
        )}
        {node.isDir ? (
          <Folder className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
        ) : (
          <FileIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/70" />
        )}
        <span className="text-xs truncate flex-1">{node.name}</span>
        {node.isDir && (
          <span className="text-[10px] text-muted-foreground/60 ml-1">
            {Object.keys(node.children).length}
          </span>
        )}
      </button>
      {node.isDir && open && entries.map((c) => (
        <TreeView key={c.name} node={c} depth={depth + 1} defaultOpenDepth={defaultOpenDepth} />
      ))}
    </div>
  );
}

export function OrganizeFilesWidget({
  root_name,
  total,
  categories,
  mapping,
  explanation,
  messageId,
}: OrganizeFilesWidgetProps) {
  const rawFiles = messageId ? getOrganizeFiles(messageId) : undefined;
  const [zipping, setZipping] = useState(false);

  const sourceTree = useMemo(
    () => (rawFiles && rawFiles.length ? buildSourceTree(rawFiles) : null),
    [rawFiles],
  );
  const targetTree = useMemo(
    () => buildTreeFromPaths(root_name || "Dossier-Reorganise", mapping.map((m) => m.to)),
    [root_name, mapping],
  );

  const sortedCats = Object.entries(categories).sort((a, b) => b[1] - a[1]);

  const handleDownloadZip = async () => {
    if (!rawFiles?.length) {
      toast.error("Fichiers d'origine indisponibles pour générer le ZIP.");
      return;
    }
    setZipping(true);
    try {
      const zip = new JSZip();
      const root = zip.folder(root_name) || zip;

      // Lookup robuste : par chemin complet, par chemin sans la racine, et par nom de base.
      const byFull = new Map<string, File>();
      const byStripped = new Map<string, File>();
      const byBase = new Map<string, File>();
      for (const f of rawFiles) {
        const full = (f as any).webkitRelativePath || f.name;
        byFull.set(full, f);
        const stripped = full.includes("/") ? full.split("/").slice(1).join("/") : full;
        byStripped.set(stripped, f);
        byBase.set(full.split("/").pop() || full, f);
      }

      const norm = (p: string) => p.replace(/^\.?\/+/, "").replace(/\\/g, "/");
      let added = 0;
      const missing: string[] = [];
      for (const m of mapping) {
        const from = norm(m.from);
        const to = norm(m.to);
        const fromStripped = from.includes("/") ? from.split("/").slice(1).join("/") : from;
        const base = from.split("/").pop() || from;
        const src =
          byFull.get(from) ||
          byStripped.get(from) ||
          byStripped.get(fromStripped) ||
          byBase.get(base);
        if (!src) {
          missing.push(from);
          continue;
        }
        root.file(to, src);
        added++;
      }

      if (added === 0) {
        toast.error("Aucun fichier n'a pu être associé. Réessayez.");
        return;
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `${root_name}.zip`);
      toast.success(
        `ZIP téléchargé (${added} fichiers${missing.length ? `, ${missing.length} introuvables` : ""})`,
      );
    } catch (err: any) {
      console.error("ZIP error", err);
      toast.error(err?.message || "Erreur lors de la création du ZIP");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/40 bg-white/5 p-4 space-y-4">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">
              Tri proposé · {total} fichier{total > 1 ? "s" : ""}
            </h4>
            <span className="text-[10px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> 0 token
            </span>
          </div>
          {explanation && (
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">
              {explanation}
            </p>
          )}
        </div>
        {rawFiles?.length ? (
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={zipping}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {zipping ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> ZIP…
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" /> Télécharger ZIP
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* Catégories */}
      {sortedCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sortedCats.map(([cat, count]) => (
            <span
              key={cat}
              className="px-2 py-0.5 rounded-full text-[10px] bg-primary/15 border border-primary/30 text-primary"
            >
              {cat} · {count}
            </span>
          ))}
        </div>
      )}

      {/* Arbres : source (si dispo) + cible */}
      <div className={sourceTree ? "grid md:grid-cols-2 gap-3" : ""}>
        {sourceTree && (
          <div className="rounded-xl border border-border/30 bg-background/40 p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1.5 py-1">
              Avant
            </div>
            <div className="max-h-72 overflow-y-auto">
              <TreeView node={sourceTree} defaultOpenDepth={1} />
            </div>
          </div>
        )}
        <div className="rounded-xl border border-primary/30 bg-background/40 p-2">
          <div className="text-[10px] uppercase tracking-wide text-primary/90 font-semibold px-1.5 py-1">
            Après
          </div>
          <div className="max-h-72 overflow-y-auto">
            <TreeView node={targetTree} defaultOpenDepth={2} />
          </div>
        </div>
      </div>

      {!rawFiles?.length && (
        <p className="text-[10px] text-muted-foreground/70 italic">
          Pour télécharger un ZIP du dossier réorganisé, joignez les fichiers d'origine via le menu « + » puis demandez le tri.
        </p>
      )}
    </div>
  );
}