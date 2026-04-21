import { ProjectsBar } from "./ProjectsBar";
import { ProjectCategory, SavedProject } from "@/contexts/ProjectsProvider";

interface Props {
  category: ProjectCategory;
  getSnapshot: () => unknown;
  onLoad?: (p: SavedProject) => void;
}

/** Barre flottante en haut à droite — pour les pages sans bouton "Plein écran" */
export function FloatingProjectsBar({ category, getSnapshot, onLoad }: Props) {
  return (
    <div className="fixed top-16 right-6 z-30">
      <ProjectsBar category={category} getSnapshot={getSnapshot} onLoad={onLoad} />
    </div>
  );
}