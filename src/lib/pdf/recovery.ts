import { openDB, type DBSchema } from "idb";
import type { Annotation, ImageAsset } from "./annotations";
import type { CoverExportMode } from "./export";
import type { PageEntry, PdfSource } from "./types";

export interface StoredSource {
  id: string;
  name: string;
  pageCount: number;
  bytes: ArrayBuffer;
}

export interface StoredImage {
  id: string;
  mime: ImageAsset["mime"];
  width: number;
  height: number;
  bytes: ArrayBuffer;
}

export interface WorkspaceSnapshot {
  version: 1;
  updatedAt: number;
  fileName: string;
  pages: PageEntry[];
  annotations: Annotation[];
  coverExport: CoverExportMode;
  sources: StoredSource[];
  images: StoredImage[];
}

interface WorkspaceStateRecord {
  key: "current";
  version: 1;
  updatedAt: number;
  fileName: string;
  pages: PageEntry[];
  annotations: Annotation[];
  coverExport: CoverExportMode;
  sourceIds: string[];
  imageIds: string[];
}

interface RecoveryDb extends DBSchema {
  state: { key: string; value: WorkspaceStateRecord };
  sources: { key: string; value: StoredSource };
  images: { key: string; value: StoredImage };
}

const dbPromise =
  typeof window === "undefined"
    ? null
    : openDB<RecoveryDb>("pdf-maestro-recovery", 1, {
        upgrade(db) {
          db.createObjectStore("state", { keyPath: "key" });
          db.createObjectStore("sources", { keyPath: "id" });
          db.createObjectStore("images", { keyPath: "id" });
        },
      });

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function createWorkspaceSnapshot(input: {
  fileName: string | null;
  pages: PageEntry[];
  annotations: Annotation[];
  coverExport: CoverExportMode;
  sources: Record<string, PdfSource>;
  images: Record<string, ImageAsset>;
}): WorkspaceSnapshot {
  const usedSources = new Set(input.pages.map((page) => page.sourceId));
  const usedImages = new Set(
    input.annotations
      .map((annotation) => annotation.imageId)
      .filter((id): id is string => typeof id === "string"),
  );
  return {
    version: 1,
    updatedAt: Date.now(),
    fileName: input.fileName ?? "documento.pdf",
    pages: input.pages,
    annotations: input.annotations,
    coverExport: input.coverExport,
    sources: Object.values(input.sources)
      .filter((source) => usedSources.has(source.id))
      .map((source) => ({
        id: source.id,
        name: source.name,
        pageCount: source.pageCount,
        bytes: copyBuffer(source.bytes),
      })),
    images: Object.values(input.images)
      .filter((image) => usedImages.has(image.id))
      .map((image) => ({
        id: image.id,
        mime: image.mime,
        width: image.width,
        height: image.height,
        bytes: copyBuffer(image.bytes),
      })),
  };
}

export async function saveRecovery(snapshot: WorkspaceSnapshot): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  const tx = db.transaction(["state", "sources", "images"], "readwrite");
  const sourceIds = snapshot.sources.map((source) => source.id);
  const imageIds = snapshot.images.map((image) => image.id);

  for (const source of snapshot.sources) {
    const currentKey = await tx.objectStore("sources").getKey(source.id);
    if (currentKey === undefined) await tx.objectStore("sources").put(source);
  }
  for (const image of snapshot.images) {
    const currentKey = await tx.objectStore("images").getKey(image.id);
    if (currentKey === undefined) await tx.objectStore("images").put(image);
  }

  for (const id of await tx.objectStore("sources").getAllKeys()) {
    if (!sourceIds.includes(String(id))) await tx.objectStore("sources").delete(id);
  }
  for (const id of await tx.objectStore("images").getAllKeys()) {
    if (!imageIds.includes(String(id))) await tx.objectStore("images").delete(id);
  }

  await tx.objectStore("state").put({
    key: "current",
    version: 1,
    updatedAt: snapshot.updatedAt,
    fileName: snapshot.fileName,
    pages: snapshot.pages,
    annotations: snapshot.annotations,
    coverExport: snapshot.coverExport,
    sourceIds,
    imageIds,
  });
  await tx.done;
}

export async function getRecoveryInfo(): Promise<{
  fileName: string;
  updatedAt: number;
} | null> {
  if (!dbPromise) return null;
  const state = await (await dbPromise).get("state", "current");
  return state ? { fileName: state.fileName, updatedAt: state.updatedAt } : null;
}

export async function loadRecovery(): Promise<WorkspaceSnapshot | null> {
  if (!dbPromise) return null;
  const db = await dbPromise;
  const state = await db.get("state", "current");
  if (!state) return null;
  const sources = (await Promise.all(state.sourceIds.map((id) => db.get("sources", id)))).filter(
    (source): source is StoredSource => !!source,
  );
  if (sources.length !== state.sourceIds.length) return null;
  const images = (await Promise.all(state.imageIds.map((id) => db.get("images", id)))).filter(
    (image): image is StoredImage => !!image,
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
}

export async function clearRecovery(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  const tx = db.transaction(["state", "sources", "images"], "readwrite");
  await Promise.all([
    tx.objectStore("state").clear(),
    tx.objectStore("sources").clear(),
    tx.objectStore("images").clear(),
  ]);
  await tx.done;
}
