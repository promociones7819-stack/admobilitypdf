import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  activateProject,
  chooseProjectFolder,
  listProjects,
  setActiveProject,
  supportsProjectFolders,
  type LocalProject,
  renameProject,
  setProjectArchived,
} from "./storage";

interface ProjectContextValue {
  supported: boolean;
  projects: LocalProject[];
  current: LocalProject | null;
  chooseFolder: () => Promise<void>;
  selectProject: (project: LocalProject) => Promise<boolean>;
  renameCurrent: (name: string) => Promise<void>;
  archiveCurrent: () => Promise<void>;
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

  const chooseFolder = useCallback(async () => {
    const project = await chooseProjectFolder();
    setCurrent(project);
    setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
  }, []);

  const selectProject = useCallback(async (project: LocalProject) => {
    const ok = await activateProject(project);
    if (ok) {
      setCurrent(project);
      setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
    }
    return ok;
  }, []);

  const renameCurrent = useCallback(
    async (name: string) => {
      if (!current) return;
      const next = await renameProject(current, name);
      setCurrent(next);
      setProjects((items) => items.map((item) => (item.id === next.id ? next : item)));
    },
    [current],
  );

  const archiveCurrent = useCallback(async () => {
    if (!current) return;
    const archived = await setProjectArchived(current, true);
    setProjects((items) => items.map((item) => (item.id === archived.id ? archived : item)));
    setCurrent(null);
    setActiveProject(null);
  }, [current]);

  const value = useMemo(
    () => ({
      supported: supportsProjectFolders(),
      projects,
      current,
      chooseFolder,
      selectProject,
      renameCurrent,
      archiveCurrent,
    }),
    [archiveCurrent, chooseFolder, current, projects, renameCurrent, selectProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) throw new Error("useProjects debe usarse dentro de ProjectProvider");
  return value;
}
