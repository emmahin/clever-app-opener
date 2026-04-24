import { useMemo, useState } from "react";
import { FolderTree, Folder, File as FileIcon, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

interface OrganizeFilesWidgetProps {
  root_name: string;
  total: number;
  categories: Record<string, number>;
  mapping: { from: string; to: string }[];
  explanation?: string;
}

type Node = {
  name: string;
  isDir: boolean;
  children: Record<string, Node>;
};

function buildTree(rootName: string, mapping: { from: string; to: string }[]): Node {
  const root: Node = { name: rootName, isDir: true, children: {} };
  for (const { to } of mapping) {
    const parts = to.split("/").filter(Boolean);
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

function TreeView({ node, depth = 0 }: { node: Node; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
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
          open ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />
        ) : (
          <span className="w-3" />
        )}
        {node.isDir ? (
          <Folder className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
        ) : (
          <FileIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/70" />
        )}
        <span className="text-xs truncate">{node.name}</span>
      </button>
      {node.isDir && open && entries.map((c) => <TreeView key={c.name} node={c} depth={depth + 1} />)}
    </div>
  );
}

export function OrganizeFilesWidget({ root_name, total, categories, mapping, explanation }: OrganizeFilesWidgetProps) {
  const tree = useMemo(() => buildTree(root_name || "Dossier-Reorganise", mapping), [root_name, mapping]);
  const sortedCats = Object.entries(categories).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-2xl border border-border/40 bg-white/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <FolderTree className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">Proposition de tri · {total} fichier(s)</h4>
      </div>

      {sortedCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
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

      <div className="rounded-xl border border-border/30 bg-background/40 p-2 max-h-72 overflow-y-auto">
        <TreeView node={tree} />
      </div>

      {explanation && (
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{explanation}</p>
      )}

      <div className="mt-3 flex items-center justify-end">
        <Link
          to="/documents"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          Ouvrir le trieur complet (import + export ZIP)
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
