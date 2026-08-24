import { openDB, type DBSchema } from "idb";

export interface LocalProject {
  id: string;
  name: string;
  directory: FileSystemDirectoryHandle;
  updatedAt: number;
}

interface ProjectDb extends DBSchema {
  projects: {
    key: string;
    value: LocalProject;
    indexes: { "by-updated": number };
  };
  settings: {
    key: string;
    value: { key: string; value: string };
  };
}

const dbPromise = typeof window === "undefined"
  ? null
  : openDB<ProjectDb>("pdf-maestro-projects", 1, {
      upgrade(db) {
        const projects = db.createObjectStore("projects", { keyPath: "id" });
        projects.createIndex("by-updated", "updatedAt");
        db.createObjectStore("settings", { keyPath: "key" });
      },
    });

let activeProject: LocalProject | null = null;

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
};

export function supportsProjectFolders(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function listProjects(): Promise<LocalProject[]> {
  if (!dbPromise) return [];
  const values = await (await dbPromise).getAllFromIndex("projects", "by-updated");
  return values.reverse();
}

export async function getLastProjectId(): Promise<string | null> {
  if (!dbPromise) return null;
  return (await (await dbPromise).get("settings", "last-project"))?.value ?? null;
}

export async function rememberProject(project: LocalProject): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.put("projects", project);
  await db.put("settings", { key: "last-project", value: project.id });
}

export async function chooseProjectFolder(): Promise<LocalProject> {
  const projectWindow = window as Window & {
    showDirectoryPicker: (options?: { mode?: "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  };
  if (!projectWindow.showDirectoryPicker) throw new Error("folder-picker-unavailable");
  const directory = await projectWindow.showDirectoryPicker({ mode: "readwrite" });
  const project: LocalProject = {
    id: `${directory.name}-${Date.now().toString(36)}`,
    name: directory.name,
    directory,
    updatedAt: Date.now(),
  };
  await writeProjectManifest(project);
  await rememberProject(project);
  activeProject = project;
  return project;
}

export async function activateProject(project: LocalProject): Promise<boolean> {
  const directory = project.directory as WritableDirectoryHandle;
  let permission = await directory.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") permission = await directory.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") return false;
  const next = { ...project, updatedAt: Date.now() };
  activeProject = next;
  await rememberProject(next);
  return true;
}

export function setActiveProject(project: LocalProject | null): void {
  activeProject = project;
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "_").trim() || "archivo";
}

function outputFolder(fileName: string): string {
  if (/\.pdf$/i.test(fileName)) return "PDF";
  if (/\.zip$/i.test(fileName)) return "Flipbooks";
  if (/\.json$/i.test(fileName)) return "Configuracion";
  return "Archivos";
}

async function hasWritePermission(directory: FileSystemDirectoryHandle): Promise<boolean> {
  const handle = directory as WritableDirectoryHandle;
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
}

async function writeFile(
  directory: FileSystemDirectoryHandle,
  fileName: string,
  data: Blob | string,
): Promise<void> {
  const file = await directory.getFileHandle(safeName(fileName), { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
}

async function writeProjectManifest(project: LocalProject): Promise<void> {
  await writeFile(
    project.directory,
    ".pdf-maestro-project.json",
    JSON.stringify({ name: project.name, createdWith: "PDF Maestro", version: 1 }, null, 2),
  );
}

/** Guarda en la carpeta activa. Devuelve false para usar la descarga normal. */
export async function saveToActiveProject(blob: Blob, fileName: string): Promise<boolean> {
  const project = activeProject;
  if (!project) return false;
  try {
    if (!(await hasWritePermission(project.directory))) return false;
    const folderName = outputFolder(fileName);
    const folder = await project.directory.getDirectoryHandle(folderName, { create: true });
    await writeFile(folder, fileName, blob);
    project.updatedAt = Date.now();
    await rememberProject(project);
    window.dispatchEvent(
      new CustomEvent("pdf-maestro:file-saved", {
        detail: { project: project.name, fileName, folder: folderName },
      }),
    );
    return true;
  } catch (error) {
    console.warn("[projects] no se pudo guardar en la carpeta vinculada", error);
    return false;
  }
}
