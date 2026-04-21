import { useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, File, Folder, FolderTree, Loader2, Sparkles, Upload, Download, Bot, User, Zap, Cloud, Wand2, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { FloatingProjectsBar } from "@/components/chatbot/FloatingProjectsBar";
import { organizeLocally, parseCustomRules } from "@/lib/localOrganizer";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  const [organizing, setOrganizing] = useState(false);
  const [mapping, setMapping] = useState<{ from: string; to: string }[] | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [newRootName, setNewRootName] = useState("Dossier-Reorganise");
  const [groupByYear, setGroupByYear] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [customRulesText, setCustomRulesText] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  // Chat de récap : messages échangés entre l'utilisateur et le "trieur"
  type ChatMsg = { role: "user" | "assistant"; content: string; ts: number };
  const [chat, setChat] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "👋 Bonjour ! Importez un dossier puis cliquez sur **Organiser**. Je vous expliquerai ici, étape par étape, ce que j'ai fait sur vos fichiers.",
      ts: Date.now(),
    },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const pushChat = (msg: Omit<ChatMsg, "ts">) =>
    setChat((c) => [...c, { ...msg, ts: Date.now() }]);

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
    const paths = files.map((f) => (f as any).webkitRelativePath || f.name);
    const customRules = parseCustomRules(customRulesText);
    pushChat({
      role: "user",
      content:
        `Organise mes ${paths.length} fichiers${groupByYear ? " (regroupés par année)" : ""}` +
        (customRules.length ? ` avec ${customRules.length} règle(s) perso.` : "."),
    });
    try {
      // ⚡ Tri 100% local — aucun token consommé pour le tri lui-même
      const result = organizeLocally(paths, { groupByYear, useSubcategories: true, customRules });
      setMapping(result.mapping);
      setExplanation(result.explanation);
      setNewRootName(result.rootName);
      const cats = Object.entries(result.stats.categories)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `• **${k}** : ${v} fichier${v > 1 ? "s" : ""}`)
        .join("\n");
      pushChat({
        role: "assistant",
        content:
          `✅ **Tri local terminé** — ${result.stats.total} fichiers traités, 0 token utilisé pour le tri.\n\n` +
          `📂 **Catégories créées :**\n${cats}`,
      });
      toast.success("Tri local terminé");

      // 🤖 Demande à l'IA d'expliquer ce que le logiciel a fait (stats uniquement, ~150 tokens)
      setExplaining(true);
      try {
        const { data, error } = await supabase.functions.invoke("explain-organization", {
          body: {
            stats: result.stats,
            options: { groupByYear, customRulesCount: customRules.length },
          },
        });
        if (error) throw error;
        if (data?.explanation) {
          pushChat({ role: "assistant", content: `🤖 **L'IA explique :**\n\n${data.explanation}` });
        }
      } catch (err: any) {
        pushChat({
          role: "assistant",
          content: `⚠️ Impossible d'obtenir l'explication IA (${err.message || "erreur"}). Le tri local est néanmoins complet.`,
        });
      } finally {
        setExplaining(false);
      }
    } catch (e: any) {
      pushChat({ role: "assistant", content: `❌ Erreur : ${e.message || "organisation impossible"}` });
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
      <FloatingProjectsBar
        category="documents"
        getSnapshot={() => ({ folderName, mapping, explanation, newRootName, chat, groupByYear })}
        onLoad={(p) => {
          const d = p.data as any;
          if (!d) return;
          if (typeof d.folderName === "string") setFolderName(d.folderName);
          if (Array.isArray(d.mapping)) setMapping(d.mapping);
          if (typeof d.explanation === "string") setExplanation(d.explanation);
          if (typeof d.newRootName === "string") setNewRootName(d.newRootName);
          if (Array.isArray(d.chat)) setChat(d.chat);
          if (typeof d.groupByYear === "boolean") setGroupByYear(d.groupByYear);
        }}
      />
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

        {/* Chat de récap + contrôles moteur */}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 mt-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" /> Journal du trieur
            </h2>
            <div className="flex items-center gap-4 flex-wrap">
              {/* Badge moteur */}
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs">
                <Zap className="w-3 h-3" /> Tri local
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRules((v) => !v)}
                className="gap-1 text-xs h-8"
              >
                <Wand2 className="w-3 h-3" /> Mes règles
                {showRules ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
              {/* Option année */}
              <div className="flex items-center gap-2">
                <Switch id="year" checked={groupByYear} onCheckedChange={setGroupByYear} />
                <Label htmlFor="year" className="text-xs text-muted-foreground cursor-pointer">
                  Grouper par année
                </Label>
              </div>
              <Button onClick={handleOrganize} disabled={!files.length || organizing} className="gap-2" size="sm">
                {organizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Organiser
              </Button>
            </div>
          </div>

          {showRules && (
            <div className="mb-4 rounded-xl border border-border/40 bg-background/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Wand2 className="w-3 h-3 text-primary" /> Règles personnalisées (prioritaires)
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {parseCustomRules(customRulesText).length} règle(s) détectée(s)
                </span>
              </div>
              <Textarea
                value={customRulesText}
                onChange={(e) => setCustomRulesText(e.target.value)}
                placeholder={`Une règle par ligne. Format : critère(s) -> dossier/cible\n\nExemples :\nfacture, invoice -> Comptabilité/Factures\n.pdf -> Documents/PDFs\nphoto, img -> Médias/Photos\nfacture + .pdf -> Comptabilité/Factures-PDF\ncv, resume -> Personnel/CV`}
                className="min-h-[120px] text-xs font-mono resize-y"
              />
              <p className="text-[10px] text-muted-foreground mt-2">
                💡 Mots-clés séparés par des virgules. Préfixez les extensions par <code>.</code> (ex: <code>.pdf</code>). Combinez avec <code>+</code> (ex: <code>facture + .pdf</code>). Ces règles passent <strong>avant</strong> les règles automatiques.
              </p>
            </div>
          )}

          <div className="rounded-xl bg-background/40 border border-border/40 p-3 max-h-[360px] overflow-y-auto space-y-3">
            {chat.map((m, i) => (
              <div key={i} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                    m.role === "assistant" ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {m.role === "assistant" ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                </div>
                <div
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap leading-relaxed",
                    m.role === "assistant"
                      ? "bg-card border border-border/50 text-foreground"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {m.content.split("\n").map((line, j) => (
                    <div key={j}>
                      {line.split(/(\*\*[^*]+\*\*)/g).map((part, k) =>
                        part.startsWith("**") && part.endsWith("**") ? (
                          <strong key={k}>{part.slice(2, -2)}</strong>
                        ) : (
                          <span key={k}>{part}</span>
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1 flex-wrap">
            <Zap className="w-3 h-3 text-emerald-400" />
            Le tri est 100% local (0 token).
            <Cloud className="w-3 h-3 text-primary ml-1" />
            Seule l'explication est rédigée par l'IA (~150 tokens).
            {explaining && <span className="ml-2 italic text-primary">L'IA rédige son explication…</span>}
          </p>
        </div>
      </main>
    </div>
  );
}