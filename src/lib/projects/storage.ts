import { openDB, type DBSchema } from "idb";
import type { WorkspaceSnapshot } from "@/lib/pdf/recovery";

export interface LocalProject {
  id: string;
  name: string;
  directory: FileSystemDirectoryHandle;
  updatedAt: number;
  archived?: boolean;
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

const dbPromise =
  typeof window === "undefined"
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

export async function renameProject(project: LocalProject, name: string): Promise<LocalProject> {
  const next = { ...project, name: name.trim() || project.name, updatedAt: Date.now() };
  await rememberProject(next);
  if (activeProject?.id === project.id) activeProject = next;
  window.dispatchEvent(new CustomEvent("pdf-maestro:project-active"));
  return next;
}

export async function setProjectArchived(
  project: LocalProject,
  archived: boolean,
): Promise<LocalProject> {
  const next = { ...project, archived, updatedAt: Date.now() };
  await rememberProject(next);
  if (archived && activeProject?.id === project.id) activeProject = null;
  return next;
}

export async function chooseProjectFolder(): Promise<LocalProject> {
  const projectWindow = window as unknown as Window & {
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
  window.dispatchEvent(new CustomEvent("pdf-maestro:project-active"));
  return project;
}

export async function activateProject(project: LocalProject): Promise<boolean> {
  const directory = project.directory as WritableDirectoryHandle;
  let permission = await directory.queryPermission({ mode: "readwrite" });
  if (permission !== "granted")
    permission = await directory.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") return false;
  const next = { ...project, updatedAt: Date.now() };
  activeProject = next;
  await rememberProject(next);
  window.dispatchEvent(new CustomEvent("pdf-maestro:project-active"));
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
  if (/\.(zip|html)$/i.test(fileName)) return "Flipbooks";
  if (/\.json$/i.test(fileName)) return "Configuracion";
  return "Archivos";
}

interface ProjectStateFile {
  version: 1;
  updatedAt: number;
  fileName: string;
  pages: WorkspaceSnapshot["pages"];
  annotations: WorkspaceSnapshot["annotations"];
  coverExport: WorkspaceSnapshot["coverExport"];
  sources: Array<{ id: string; name: string; pageCount: number; file: string }>;
  images: Array<{
    id: string;
    mime: "image/png" | "image/jpeg";
    width: number;
    height: number;
    file: string;
  }>;
}

export interface ProjectVersionInfo {
  file: string;
  label: string;
  updatedAt: number;
  documentName: string;
}

async function writeFileIfChanged(
  directory: FileSystemDirectoryHandle,
  fileName: string,
  data: Blob | ArrayBuffer,
): Promise<void> {
  const handle = await directory.getFileHandle(safeName(fileName), { create: true });
  const nextSize = data instanceof Blob ? data.size : data.byteLength;
  try {
    const current = await handle.getFile();
    if (current.size === nextSize && nextSize > 0) return;
  } catch {
    // El fichero acaba de crearse.
  }
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

/** Guarda un proyecto editable: estado pequeño + fuentes e imágenes separadas. */
export async function saveWorkspaceToActiveProject(snapshot: WorkspaceSnapshot): Promise<boolean> {
  const project = activeProject;
  if (!project || !(await hasWritePermission(project.directory))) return false;
  try {
    const root = await project.directory.getDirectoryHandle("Proyecto", { create: true });
    const sourcesFolder = await root.getDirectoryHandle("Fuentes", { create: true });
    const imagesFolder = await root.getDirectoryHandle("Imagenes", { create: true });

    const sources: ProjectStateFile["sources"] = [];
    for (const source of snapshot.sources) {
      const file = `${source.id}-${source.name}`;
      await writeFileIfChanged(sourcesFolder, file, source.bytes);
      sources.push({
        id: source.id,
        name: source.name,
        pageCount: source.pageCount,
        file: safeName(file),
      });
    }

    const images: ProjectStateFile["images"] = [];
    for (const image of snapshot.images) {
      const extension = image.mime === "image/png" ? "png" : "jpg";
      const file = `${image.id}.${extension}`;
      await writeFileIfChanged(imagesFolder, file, image.bytes);
      images.push({
        id: image.id,
        mime: image.mime,
        width: image.width,
        height: image.height,
        file: safeName(file),
      });
    }

    const state: ProjectStateFile = {
      version: 1,
      updatedAt: snapshot.updatedAt,
      fileName: snapshot.fileName,
      pages: snapshot.pages,
      annotations: snapshot.annotations,
      coverExport: snapshot.coverExport,
      sources,
      images,
    };
    await writeFile(root, "proyecto.pdfmaestro.json", JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.warn("[projects] no se pudo guardar el proyecto editable", error);
    return false;
  }
}

export async function loadWorkspaceFromActiveProject(): Promise<WorkspaceSnapshot | null> {
  const project = activeProject;
  if (!project || !(await hasWritePermission(project.directory))) return null;
  try {
    const root = await project.directory.getDirectoryHandle("Proyecto");
    const stateHandle = await root.getFileHandle("proyecto.pdfmaestro.json");
    const state = JSON.parse(await (await stateHandle.getFile()).text()) as ProjectStateFile;
    if (state.version !== 1 || !Array.isArray(state.pages) || !Array.isArray(state.sources)) {
      return null;
    }
    const sourcesFolder = await root.getDirectoryHandle("Fuentes");
    const sources = await Promise.all(
      state.sources.map(async (source) => ({
        id: source.id,
        name: source.name,
        pageCount: source.pageCount,
        bytes: await (
          await sourcesFolder.getFileHandle(source.file)
        )
          .getFile()
          .then((file) => file.arrayBuffer()),
      })),
    );
    const imagesFolder = state.images.length ? await root.getDirectoryHandle("Imagenes") : null;
    const images = await Promise.all(
      state.images.map(async (image) => ({
        id: image.id,
        mime: image.mime,
        width: image.width,
        height: image.height,
        bytes: await (
          await imagesFolder!.getFileHandle(image.file)
        )
          .getFile()
          .then((file) => file.arrayBuffer()),
      })),
    );
    return {
      version: 1,
      updatedAt: state.updatedAt,
      fileName: state.fileName,
      pages: state.pages,
      annotations: state.annotations,
      coverExport: state.coverExport,
      sources,
      images,
    };
  } catch {
    return null;
  }
}

export async function getActiveProjectWorkspaceInfo(): Promise<{
  fileName: string;
  updatedAt: number;
} | null> {
  const project = activeProject;
  if (!project || !(await hasWritePermission(project.directory))) return null;
  try {
    const root = await project.directory.getDirectoryHandle("Proyecto");
    const stateHandle = await root.getFileHandle("proyecto.pdfmaestro.json");
    const state = JSON.parse(await (await stateHandle.getFile()).text()) as ProjectStateFile;
    return { fileName: state.fileName, updatedAt: state.updatedAt };
  } catch {
    return null;
  }
}

export async function saveProjectVersion(
  snapshot: WorkspaceSnapshot,
  label: string,
): Promise<ProjectVersionInfo | null> {
  const project = activeProject;
  if (!project || !(await hasWritePermission(project.directory))) return null;
  try {
    // Ensure the sources and images referenced by the version exist.
    await saveWorkspaceToActiveProject(snapshot);
    const root = await project.directory.getDirectoryHandle("Proyecto", { create: true });
    const versions = await root.getDirectoryHandle("Versiones", { create: true });
    const sources = snapshot.sources.map((source) => ({
      id: source.id,
      name: source.name,
      pageCount: source.pageCount,
      file: safeName(`${source.id}-${source.name}`),
    }));
    const images = snapshot.images.map((image) => ({
      id: image.id,
      mime: image.mime,
      width: image.width,
      height: image.height,
      file: safeName(`${image.id}.${image.mime === "image/png" ? "png" : "jpg"}`),
    }));
    const state: ProjectStateFile & { versionLabel: string } = {
      version: 1,
      updatedAt: Date.now(),
      fileName: snapshot.fileName,
      pages: snapshot.pages,
      annotations: snapshot.annotations,
      coverExport: snapshot.coverExport,
      sources,
      images,
      versionLabel: label.trim() || "Versión manual",
    };
    const file = `${new Date(state.updatedAt).toISOString().replace(/[:.]/g, "-")}.json`;
    await writeFile(versions, file, JSON.stringify(state, null, 2));
    return {
      file,
      label: state.versionLabel,
      updatedAt: state.updatedAt,
      documentName: state.fileName,
    };
  } catch (error) {
    console.warn("[projects] no se pudo guardar la versión", error);
    return null;
  }
}

export async function listProjectVersions(): Promise<ProjectVersionInfo[]> {
  const project = activeProject;
  if (!project || !(await hasWritePermission(project.directory))) return [];
  try {
    const root = await project.directory.getDirectoryHandle("Proyecto");
    const versions = await root.getDirectoryHandle("Versiones");
    const result: ProjectVersionInfo[] = [];
    for await (const [file, handle] of (
      versions as FileSystemDirectoryHandle & {
        entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
      }
    ).entries()) {
      if (handle.kind !== "file" || !file.endsWith(".json")) continue;
      try {
        const state = JSON.parse(
          await (handle as FileSystemFileHandle).getFile().then((value) => value.text()),
        ) as ProjectStateFile & { versionLabel?: string };
        result.push({
          file,
          label: state.versionLabel ?? "Versión manual",
          updatedAt: state.updatedAt,
          documentName: state.fileName,
        });
      } catch {
        /* omite versiones dañadas */
      }
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function loadProjectVersion(fileName: string): Promise<WorkspaceSnapshot | null> {
  const project = activeProject;
  if (!project || !(await hasWritePermission(project.directory))) return null;
  try {
    const root = await project.directory.getDirectoryHandle("Proyecto");
    const versions = await root.getDirectoryHandle("Versiones");
    const state = JSON.parse(
      await (
        await versions.getFileHandle(safeName(fileName))
      )
        .getFile()
        .then((file) => file.text()),
    ) as ProjectStateFile;
    const sourcesFolder = await root.getDirectoryHandle("Fuentes");
    const sources = await Promise.all(
      state.sources.map(async (source) => ({
        id: source.id,
        name: source.name,
        pageCount: source.pageCount,
        bytes: await (
          await sourcesFolder.getFileHandle(source.file)
        )
          .getFile()
          .then((file) => file.arrayBuffer()),
      })),
    );
    const imagesFolder = state.images.length ? await root.getDirectoryHandle("Imagenes") : null;
    const images = await Promise.all(
      state.images.map(async (image) => ({
        id: image.id,
        mime: image.mime,
        width: image.width,
        height: image.height,
        bytes: await (
          await imagesFolder!.getFileHandle(image.file)
        )
          .getFile()
          .then((file) => file.arrayBuffer()),
      })),
    );
    return {
      version: 1,
      updatedAt: state.updatedAt,
      fileName: state.fileName,
      pages: state.pages,
      annotations: state.annotations,
      coverExport: state.coverExport,
      sources,
      images,
    };
  } catch (error) {
    console.warn("[projects] versión no recuperable", error);
    return null;
  }
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
