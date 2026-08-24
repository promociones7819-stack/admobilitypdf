import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  activateProject,
  chooseProjectFolder,
  listProjects,
  setActiveProject,
  supportsProjectFolders,
  type LocalProject,
} from "./storage";

interface ProjectContextValue {
  supported: boolean;
  projects: LocalProject[];
  current: LocalProject | null;
  chooseFolder: () => Promise<void>;
  selectProject: (project: LocalProject) => Promise<boolean>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [current, setCurrent] = useState<LocalProject | null>(null);

  useEffect(() => {
    void listProjects().then((items) => {
      setProjects(items);
      // El permiso de escritura siempre se reactiva mediante un clic del usuario.
      setCurrent(null);
      setActiveProject(null);
    });
  }, []);

  async function chooseFolder() {
    const project = await chooseProjectFolder();
    setCurrent(project);
    setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
  }

  async function selectProject(project: LocalProject) {
    const ok = await activateProject(project);
    if (ok) {
      setCurrent(project);
      setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
    }
    return ok;
  }

  const value = useMemo(
    () => ({ supported: supportsProjectFolders(), projects, current, chooseFolder, selectProject }),
    [current, projects],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) throw new Error("useProjects debe usarse dentro de ProjectProvider");
  return value;
}
