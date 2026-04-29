import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { twinMemoryService, type UserMemory, type MemoryCategory } from "@/services";

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  habit: "Habitude",
  preference: "Préférence",
  goal: "Objectif",
  fact: "Fait",
  emotion: "Émotion",
  relationship: "Relation",
};

const CATEGORY_COLOR: Record<MemoryCategory, string> = {
  habit: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  preference: "bg-purple-500/15 text-purple-300 border-purple-400/30",
  goal: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  fact: "bg-slate-500/15 text-slate-300 border-slate-400/30",
  emotion: "bg-pink-500/15 text-pink-300 border-pink-400/30",
  relationship: "bg-amber-500/15 text-amber-300 border-amber-400/30",
};

export function MemorySection() {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMem, setNewMem] = useState<{ category: MemoryCategory; content: string; importance: number }>({
    category: "habit",
    content: "",
    importance: 3,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ content: string; importance: number; category: MemoryCategory }>({
    content: "", importance: 3, category: "fact",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const m = await twinMemoryService.listMemories();
      setMemories(m);
    } catch (e: any) {
      toast.error(e?.message || "Impossible de charger la mémoire");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addMemory = async () => {
    if (!newMem.content.trim()) return;
    try {
      await twinMemoryService.addMemory({
        category: newMem.category,
        content: newMem.content.trim(),
        importance: newMem.importance,
        source: "manual",
      });
      setNewMem({ category: "habit", content: "", importance: 3 });
      await refresh();
      toast.success("Souvenir ajouté");
    } catch (e: any) {
      toast.error(e?.message || "Échec d'ajout");
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      await twinMemoryService.deleteMemory(id);
      setMemories((m) => m.filter((x) => x.id !== id));
    } catch (e: any) {
      toast.error(e?.message || "Échec de suppression");
    }
  };

  const startEdit = (m: UserMemory) => {
    setEditingId(m.id);
    setEditDraft({ content: m.content, importance: m.importance, category: m.category });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await twinMemoryService.updateMemory(editingId, {
        content: editDraft.content.trim(),
        importance: editDraft.importance,
        category: editDraft.category,
      });
      setEditingId(null);
      await refresh();
      toast.success("Mis à jour");
    } catch (e: any) {
      toast.error(e?.message || "Échec");
    }
  };

  const grouped = useMemo(() => {
    const g: Record<MemoryCategory, UserMemory[]> = {
      habit: [], preference: [], goal: [], fact: [], emotion: [], relationship: [],
    };
    for (const m of memories) g[m.category].push(m);
    return g;
  }, [memories]);

  return (
    <div className="space-y-5">
      {/* Add */}
      <div className="space-y-2">
        <label className="text-sm font-medium block">Ajouter un souvenir</label>
        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto_auto] gap-2">
          <select
            value={newMem.category}
            onChange={(e) => setNewMem({ ...newMem, category: e.target.value as MemoryCategory })}
            className="px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
          >
            {(Object.keys(CATEGORY_LABEL) as MemoryCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
          <Input
            value={newMem.content}
            onChange={(e) => setNewMem({ ...newMem, content: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") addMemory(); }}
            placeholder="Ex : Je médite 10 min chaque matin"
          />
          <select
            value={newMem.importance}
            onChange={(e) => setNewMem({ ...newMem, importance: parseInt(e.target.value, 10) })}
            className="px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
            title="Importance"
          >
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
          </select>
          <Button onClick={addMemory}><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ces souvenirs sont utilisés par le double numérique pendant les appels vocaux pour mieux te conseiller.
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : memories.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border/60 rounded-lg">
          Aucun souvenir pour l'instant. Ajoute-en un ci-dessus, ou laisse ton double les enregistrer pendant un appel vocal.
        </div>
      ) : (
        <div className="space-y-4">
          {(Object.keys(grouped) as MemoryCategory[]).map((cat) => {
            const list = grouped[cat];
            if (list.length === 0) return null;
            return (
              <div key={cat}>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  {CATEGORY_LABEL[cat]} · {list.length}
                </div>
                <ul className="space-y-1.5">
                  {list.map((m) => {
                    const editing = editingId === m.id;
                    return (
                      <li key={m.id} className="group flex items-start gap-2 px-3 py-2 rounded-lg bg-secondary/40 hover:bg-secondary/60 border border-border/40">
                        {editing ? (
                          <>
                            <select
                              value={editDraft.category}
                              onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value as MemoryCategory })}
                              className="px-2 py-1 rounded bg-background border border-border text-xs"
                            >
                              {(Object.keys(CATEGORY_LABEL) as MemoryCategory[]).map((c) => (
                                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                              ))}
                            </select>
                            <select
                              value={editDraft.importance}
                              onChange={(e) => setEditDraft({ ...editDraft, importance: parseInt(e.target.value, 10) })}
                              className="px-2 py-1 rounded bg-background border border-border text-xs"
                            >
                              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
                            </select>
                            <Input
                              value={editDraft.content}
                              onChange={(e) => setEditDraft({ ...editDraft, content: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
                              className="flex-1 h-8 text-sm"
                              autoFocus
                            />
                            <button onClick={saveEdit} className="p-1.5 rounded hover:bg-emerald-500/15 text-emerald-400" title="Enregistrer">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground" title="Annuler">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <Badge variant="outline" className={"text-[10px] " + CATEGORY_COLOR[m.category]}>
                              {"★".repeat(m.importance)}
                            </Badge>
                            <span className="flex-1 text-sm">{m.content}</span>
                            <button
                              onClick={() => startEdit(m)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-primary/15 text-primary transition"
                              title="Modifier"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteMemory(m.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/15 text-destructive transition"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}