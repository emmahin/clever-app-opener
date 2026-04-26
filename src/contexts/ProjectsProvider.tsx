import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProjectCategory =
  | "ai-tools"
  | "dashboard"
  | "video"
  | "analytics"
  | "documents"
  | "settings";

export interface SavedProject {
  id: string;
  category: ProjectCategory;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Snapshot libre — chaque page met ce qu'elle veut (messages, état, etc.) */
  data: unknown;
}

interface ProjectsContextValue {
  projects: SavedProject[];
  list: (category: ProjectCategory) => SavedProject[];
  save: (category: ProjectCategory, name: string, data: unknown) => SavedProject;
  update: (id: string, patch: Partial<Pick<SavedProject, "name" | "data">>) => void;
  remove: (id: string) => void;
  get: (id: string) => SavedProject | undefined;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<SavedProject[]>([]);

  // Charge les projets sauvegardés depuis la DB au mount + à chaque changement d'auth.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (active) setProjects([]); return; }
        const { data, error } = await supabase
          .from("saved_projects")
          .select("id, category, name, data, created_at, updated_at")
          .order("updated_at", { ascending: false });
        if (error) throw error;
        if (!active) return;
        setProjects((data ?? []).map((r) => ({
          id: r.id,
          category: r.category as ProjectCategory,
          name: r.name,
          data: r.data,
          createdAt: new Date(r.created_at).getTime(),
          updatedAt: new Date(r.updated_at).getTime(),
        })));
      } catch (e) {
        console.warn("[projects] load failed", e);
      }
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const list = useCallback(
    (category: ProjectCategory) =>
      projects
        .filter((p) => p.category === category)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [projects]
  );

  const save = useCallback(
    (category: ProjectCategory, name: string, data: unknown): SavedProject => {
      const now = Date.now();
      const proj: SavedProject = {
        id: crypto.randomUUID(),
        category,
        name: name.trim() || "Sans titre",
        createdAt: now,
        updatedAt: now,
        data,
      };
      setProjects((prev) => [proj, ...prev]);
      // Persistance DB en best-effort (n'attend pas pour l'UX).
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          await supabase.from("saved_projects").insert({
            id: proj.id,
            user_id: user.id,
            category: proj.category,
            name: proj.name,
            data: (proj.data ?? {}) as never,
          } as never);
        } catch (e) {
          console.warn("[projects] save failed", e);
        }
      })();
      return proj;
    },
    []
  );

  const update = useCallback(
    (id: string, patch: Partial<Pick<SavedProject, "name" | "data">>) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
        )
      );
      (async () => {
        try {
          const update: { name?: string; data?: never } = {};
          if (patch.name !== undefined) update.name = patch.name;
          if (patch.data !== undefined) update.data = patch.data as unknown as never;
          await supabase.from("saved_projects").update(update as never).eq("id", id);
        } catch (e) {
          console.warn("[projects] update failed", e);
        }
      })();
    },
    []
  );

  const remove = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    (async () => {
      try {
        await supabase.from("saved_projects").delete().eq("id", id);
      } catch (e) {
        console.warn("[projects] remove failed", e);
      }
    })();
  }, []);

  const get = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects]
  );

  const value = useMemo(
    () => ({ projects, list, save, update, remove, get }),
    [projects, list, save, update, remove, get]
  );

  return (
    <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectsProvider");
  return ctx;
}