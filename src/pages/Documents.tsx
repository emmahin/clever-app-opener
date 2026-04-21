import { useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, File, Folder, FolderTree, Loader2, Sparkles, Upload, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: Record<string, TreeNode>;
  file?: File;
};

function emptyRoot(name = "root"): TreeNode {
  return { name, path: "", isDir: true, children: {} };
}

function buildTree(files: File[]): TreeNode {
  const root = emptyRoot();
  for (const f of files) {
    const rel = (f as any).webkitRelativePath || f.name;
    const parts = rel.split("/");
    let node = root;
    if (!root.name || root.name === "root") root.name = parts[0] || "root";
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!node.children[part]) {
        node.children[part] = {
          name: part,
          path: parts.slice(1, i + 1).join("/"),
          isDir: !isLast,
          children: {},
          file: isLast ? f : undefined,
        };
      }
      node = node.children[part];
    }
  }
  return root;
}

function buildTreeFromPaths(paths: string[]): TreeNode {
  const root = emptyRoot("Dossier-Reorganise");
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!node.children[part]) {
        node.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          isDir: !isLast,
          children: {},
        };
      }
      node = node.children[part];
    }
  }
  return root;
}

function TreeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const entries = Object.values(node.children).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (depth === 0) {
    return (
      <div className="text-sm">
        <div className="flex items-center gap-2 py-1 font-medium text-foreground">
          <FolderTree className="w-4 h-4 text-primary" />
          <span>{node.name}</span>
        </div>
        <div className="ml-2 border-l border-border/50 pl-2">
          {entries.map((c) => <TreeView key={c.path} node={c} depth={depth + 1} />)}
        </div>
      </div>
    );
  }

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 py-0.5 hover:text-primary transition-colors w-full text-left"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Folder className="w-4 h-4 text-amber-400" />
          <span className="truncate">{node.name}</span>
          <span className="text-xs text-muted-foreground ml-1">({Object.keys(node.children).length})</span>
        </button>
        {open && (
          <div className="ml-3 border-l border-border/40 pl-2">
            {entries.map((c) => <TreeView key={c.path} node={c} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 py-0.5 pl-4 text-muted-foreground">
      <File className="w-3.5 h-3.5" />
      <span className="truncate">{node.name}</span>
    </div>
  );
}

export default function Documents() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [folderName, setFolderName] = useState<string>("");
  const [instructions, setInstructions] = useState("");
  const [organizing, setOrganizing] = useState(false);
  const [mapping, setMapping] = useState<{ from: string; to: string }[] | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [newRootName, setNewRootName] = useState("Dossier-Reorganise");

  const sourceTree = useMemo(() => (files.length ? buildTree(files) : null), [files]);
  const targetTree = useMemo(
    () => (mapping ? buildTreeFromPaths(mapping.map((m) => m.to)) : null),
    [mapping],
  );

  const handleFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    setFiles(arr);
    const first = (arr[0] as any).webkitRelativePath || arr[0].name;
    setFolderName(first.split("/")[0] || "dossier");
    setMapping(null);
    setExplanation("");
    toast.success(`${arr.length} fichiers importés`);
  };

  const handleOrganize = async () => {
    if (!files.length) {
      toast.error("Importez d'abord un dossier");
      return;
    }
    setOrganizing(true);
    setMapping(null);
    try {
      const paths = files.map((f) => (f as any).webkitRelativePath || f.name);
      const { data, error } = await supabase.functions.invoke("organize-documents", {
        body: { files: paths, instructions },
      });
      if (error) throw error;
      const map = Array.isArray(data?.mapping) ? data.mapping : [];
      if (!map.length) throw new Error("Réponse IA invalide");
      setMapping(map);
      setExplanation(data?.explanation || "");
      setNewRootName(data?.rootName || "Dossier-Reorganise");
      toast.success("Arborescence proposée par l'IA");
    } catch (e: any) {
      toast.error(e.message || "Erreur d'organisation");
    } finally {
      setOrganizing(false);
    }
  };

  const handleDownload = async () => {
    if (!mapping || !files.length) return;
    try {
      const zip = new JSZip();
      const root = zip.folder(newRootName) || zip;

      // Build robust lookup: full path, path without root, basename
      const byFull = new Map<string, File>();
      const byStripped = new Map<string, File>();
      const byBase = new Map<string, File>();
      for (const f of files) {
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
          byFull.get(`${folderName}/${from}`) ||
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
        console.error("ZIP empty. Mapping sample:", mapping.slice(0, 3), "Files sample:", Array.from(byFull.keys()).slice(0, 3));
        toast.error("Aucun fichier n'a pu être associé. Réessayez l'organisation.");
        return;
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `${newRootName}.zip`);
      toast.success(`ZIP téléchargé (${added} fichiers${missing.length ? `, ${missing.length} introuvables` : ""})`);
    } catch (err: any) {
      console.error("ZIP error", err);
      toast.error(err?.message || "Erreur lors de la création du ZIP");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <main className="pl-[88px] pr-6 pt-20 pb-10 max-w-[1400px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-primary" /> Documents
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Importez un dossier, visualisez l'arbre généalogique de vos fichiers et laissez l'IA proposer une organisation parfaitement triée.
          </p>
        </div>

        {/* Upload zone */}
        <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur p-6 mb-6">
          <input
            ref={inputRef}
            type="file"
            multiple
            // @ts-ignore non-standard attributes for folder pick
            webkitdirectory=""
            // @ts-ignore
            directory=""
            className="hidden"
            onChange={handleFolder}
          />
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition"
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="font-medium">Cliquez pour importer un dossier</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tous les fichiers et sous-dossiers seront analysés. Aucun upload serveur — tout reste dans votre navigateur.
            </p>
            {files.length > 0 && (
              <p className="text-sm text-primary mt-3">
                ✓ <strong>{folderName}</strong> — {files.length} fichiers
              </p>
            )}
          </div>
        </div>

        {/* Two columns trees */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5 min-h-[300px]">
            <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Arbre source</h2>
            {sourceTree ? (
              <div className="max-h-[500px] overflow-auto pr-2">
                <TreeView node={sourceTree} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun dossier importé</p>
            )}
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/40 p-5 min-h-[300px]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Proposition IA</h2>
              {mapping && (
                <Button size="sm" onClick={handleDownload} variant="secondary" className="gap-1">
                  <Download className="w-3.5 h-3.5" /> ZIP
                </Button>
              )}
            </div>
            {targetTree ? (
              <>
                {explanation && (
                  <p className="text-xs text-muted-foreground mb-3 italic">{explanation}</p>
                )}
                <div className="max-h-[460px] overflow-auto pr-2">
                  <TreeView node={targetTree} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">L'organisation proposée apparaîtra ici.</p>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 mt-6">
          <h2 className="font-semibold mb-2 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Consignes d'organisation
          </h2>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Ex: Trie par année puis par type (factures, contrats, photos). Mets toutes les images dans un dossier 'Médias'…"
            className="min-h-[100px] resize-none"
          />
          <div className="flex justify-end mt-3">
            <Button onClick={handleOrganize} disabled={!files.length || organizing} className="gap-2">
              {organizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Organiser avec l'IA
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}