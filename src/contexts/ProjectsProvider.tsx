import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

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
    },
    []
  );

  const remove = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
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