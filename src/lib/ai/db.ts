// IndexedDB: cuadernos, fuentes, chunks (con embeddings), bytes de PDF y chat.
// Todo permanece en el dispositivo. Nunca se envía a un servidor.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ChatTurn, Chunk, Notebook, Source } from "./types";

interface AiDb extends DBSchema {
  notebooks: { key: string; value: Notebook };
  sources: { key: string; value: Source; indexes: { byNotebook: string } };
  chunks: {
    key: string;
    value: Chunk;
    indexes: { byNotebook: string; bySource: string };
  };
  blobs: { key: string; value: { id: string; bytes: ArrayBuffer } };
  chat: { key: string; value: ChatTurn; indexes: { byNotebook: string } };
  settings: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<AiDb>> | null = null;

export function getDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexeddb-unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB<AiDb>("pdf-ai", 1, {
      upgrade(db) {
        db.createObjectStore("notebooks", { keyPath: "id" });
        const sources = db.createObjectStore("sources", { keyPath: "id" });
        sources.createIndex("byNotebook", "notebookId");
        const chunks = db.createObjectStore("chunks", { keyPath: "id" });
        chunks.createIndex("byNotebook", "notebookId");
        chunks.createIndex("bySource", "sourceId");
        db.createObjectStore("blobs", { keyPath: "id" });
        const chat = db.createObjectStore("chat", { keyPath: "id" });
        chat.createIndex("byNotebook", "notebookId");
        db.createObjectStore("settings");
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------- notebooks
export async function listNotebooks(): Promise<Notebook[]> {
  const db = await getDb();
  const all = await db.getAll("notebooks");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putNotebook(notebook: Notebook) {
  const db = await getDb();
  await db.put("notebooks", notebook);
}

export async function deleteNotebook(id: string) {
  const db = await getDb();
  const sources = await db.getAllFromIndex("sources", "byNotebook", id);
  const chunks = await db.getAllKeysFromIndex("chunks", "byNotebook", id);
  const turns = await db.getAllKeysFromIndex("chat", "byNotebook", id);
  const tx = db.transaction(["notebooks", "sources", "chunks", "blobs", "chat"], "readwrite");
  await tx.objectStore("notebooks").delete(id);
  for (const source of sources) {
    await tx.objectStore("sources").delete(source.id);
    await tx.objectStore("blobs").delete(source.id);
  }
  for (const key of chunks) await tx.objectStore("chunks").delete(key);
  for (const key of turns) await tx.objectStore("chat").delete(key);
  await tx.done;
}

// ------------------------------------------------------------------ sources
export async function listSources(notebookId: string): Promise<Source[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("sources", "byNotebook", notebookId);
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export async function putSource(source: Source) {
  const db = await getDb();
  await db.put("sources", source);
}

export async function deleteSource(id: string) {
  const db = await getDb();
  const chunks = await db.getAllKeysFromIndex("chunks", "bySource", id);
  const tx = db.transaction(["sources", "chunks", "blobs"], "readwrite");
  await tx.objectStore("sources").delete(id);
  await tx.objectStore("blobs").delete(id);
  for (const key of chunks) await tx.objectStore("chunks").delete(key);
  await tx.done;
}

export async function putSourceBytes(id: string, bytes: Uint8Array) {
  const db = await getDb();
  const copy = bytes.slice(0);
  await db.put("blobs", { id, bytes: copy.buffer as ArrayBuffer });
}

export async function getSourceBytes(id: string): Promise<Uint8Array | null> {
  const db = await getDb();
  const record = await db.get("blobs", id);
  return record ? new Uint8Array(record.bytes) : null;
}

// ------------------------------------------------------------------- chunks
export async function putChunks(chunks: Chunk[]) {
  const db = await getDb();
  const tx = db.transaction("chunks", "readwrite");
  for (const chunk of chunks) await tx.store.put(chunk);
  await tx.done;
}

export async function getNotebookChunks(notebookId: string): Promise<Chunk[]> {
  const db = await getDb();
  return db.getAllFromIndex("chunks", "byNotebook", notebookId);
}

export async function removeChunksBySource(sourceId: string) {
  const db = await getDb();
  const keys = await db.getAllKeysFromIndex("chunks", "bySource", sourceId);
  const tx = db.transaction("chunks", "readwrite");
  for (const key of keys) await tx.store.delete(key);
  await tx.done;
}

// --------------------------------------------------------------------- chat
export async function listChat(notebookId: string): Promise<ChatTurn[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("chat", "byNotebook", notebookId);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putChatTurn(turn: ChatTurn) {
  const db = await getDb();
  await db.put("chat", turn);
}

export async function clearChat(notebookId: string) {
  const db = await getDb();
  const keys = await db.getAllKeysFromIndex("chat", "byNotebook", notebookId);
  const tx = db.transaction("chat", "readwrite");
  for (const key of keys) await tx.store.delete(key);
  await tx.done;
}

// ----------------------------------------------------------------- settings
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get("settings", key)) as T | undefined;
}

export async function setSetting(key: string, value: unknown) {
  const db = await getDb();
  await db.put("settings", value, key);
}
