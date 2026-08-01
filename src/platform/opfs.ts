/**
 * src/platform/opfs.ts
 *
 * Spec: docs/05-data-models.md §3 — session-scoped large blobs.
 *
 * Scope note (docs/12 D-51): §3 describes two uses — the `keepFilesForSession`
 * opt-in, and a memory-pressure escape valve where an oversized intermediate
 * "should leave the JS heap" during conversion. Only the storage PRIMITIVE is
 * built here: read/write/delete a session's blobs and manifest, and purge
 * sessions older than 24h. Wiring an automatic write-through into the live
 * pipeline (which would touch workers/pipeline.ts's decode/encode path
 * directly) and a session-restore UI are deliberately NOT included — neither
 * is in Milestone 8's own acceptance list, and the pipeline's existing
 * memory-ceiling guards (docs/04 §4, docs/12 D-43/D-45) already protect
 * against OOM without it.
 *
 * Every function here uses the STANDARD (async) File System Access API, not
 * FileSystemSyncAccessHandle. The sync handle §3 calls for is a worker-only
 * optimisation for a hot read/write path — relevant once the deferred
 * pipeline write-through above is built, not for the manifest/purge
 * operations this module actually performs today.
 *
 * ⚠️ Safari private browsing has no OPFS at all: `navigator.storage
 * .getDirectory` throws on first real use even though the API shape exists.
 * Every exported function feature-detects and degrades to a no-op/false/null
 * rather than throwing — a missing session store must never be a crash.
 */

export interface SessionManifestEntry {
  kind: 'source' | 'result';
  id: string; // sourceId or jobId
  name: string;
  sizeBytes: number;
}

export interface SessionManifest {
  sessionId: string;
  createdAt: number;
  entries: SessionManifestEntry[];
}

const SESSION_DIR_PREFIX = 'session-';
const MANIFEST_NAME = 'manifest.json';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let cachedRoot: FileSystemDirectoryHandle | null = null;

async function getRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (cachedRoot !== null) return cachedRoot;
  if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') {
    return null;
  }
  try {
    cachedRoot = await navigator.storage.getDirectory();
    return cachedRoot;
  } catch {
    // Safari private browsing: the API exists but throws here.
    return null;
  }
}

export async function isOpfsAvailable(): Promise<boolean> {
  return (await getRoot()) !== null;
}

async function getSessionDir(
  sessionId: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  const root = await getRoot();
  if (root === null) return null;
  try {
    return await root.getDirectoryHandle(SESSION_DIR_PREFIX + sessionId, { create });
  } catch {
    return null;
  }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<boolean> {
  try {
    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<Blob | null> {
  try {
    const fileHandle = await dir.getFileHandle(name);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function readManifest(sessionId: string): Promise<SessionManifest | null> {
  const dir = await getSessionDir(sessionId, false);
  if (dir === null) return null;
  const file = await readFile(dir, MANIFEST_NAME);
  if (file === null) return null;
  try {
    const parsed = JSON.parse(await file.text()) as SessionManifest;
    if (typeof parsed.sessionId !== 'string' || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    // A corrupt manifest is not durable data worth failing over — treat the
    // session as absent, same as if it had never been written.
    return null;
  }
}

async function writeManifest(sessionId: string, manifest: SessionManifest): Promise<void> {
  const dir = await getSessionDir(sessionId, true);
  if (dir === null) return;
  await writeFile(dir, MANIFEST_NAME, new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
}

async function upsertManifestEntry(sessionId: string, entry: SessionManifestEntry): Promise<void> {
  const existing = await readManifest(sessionId);
  const manifest: SessionManifest = existing ?? {
    sessionId,
    createdAt: Date.now(),
    entries: [],
  };
  const withoutDuplicate = manifest.entries.filter(
    (e) => !(e.kind === entry.kind && e.id === entry.id),
  );
  manifest.entries = [...withoutDuplicate, entry];
  await writeManifest(sessionId, manifest);
}

/** Writes a source's original bytes. Returns whether the write actually landed. */
export async function writeSourceBlob(
  sessionId: string,
  sourceId: string,
  name: string,
  blob: Blob,
): Promise<boolean> {
  const dir = await getSessionDir(sessionId, true);
  if (dir === null) return false;
  const sourcesDir = await dir.getDirectoryHandle('sources', { create: true }).catch(() => null);
  if (sourcesDir === null) return false;
  const ok = await writeFile(sourcesDir, sourceId + '.bin', blob);
  if (ok) await upsertManifestEntry(sessionId, { kind: 'source', id: sourceId, name, sizeBytes: blob.size });
  return ok;
}

/** Writes a job's encoded output bytes. Returns whether the write actually landed. */
export async function writeResultBlob(
  sessionId: string,
  jobId: string,
  name: string,
  blob: Blob,
): Promise<boolean> {
  const dir = await getSessionDir(sessionId, true);
  if (dir === null) return false;
  const resultsDir = await dir.getDirectoryHandle('results', { create: true }).catch(() => null);
  if (resultsDir === null) return false;
  const ok = await writeFile(resultsDir, jobId + '.bin', blob);
  if (ok) await upsertManifestEntry(sessionId, { kind: 'result', id: jobId, name, sizeBytes: blob.size });
  return ok;
}

export async function readSourceBlob(sessionId: string, sourceId: string): Promise<Blob | null> {
  const dir = await getSessionDir(sessionId, false);
  if (dir === null) return null;
  const sourcesDir = await dir.getDirectoryHandle('sources').catch(() => null);
  if (sourcesDir === null) return null;
  return readFile(sourcesDir, sourceId + '.bin');
}

export async function readResultBlob(sessionId: string, jobId: string): Promise<Blob | null> {
  const dir = await getSessionDir(sessionId, false);
  if (dir === null) return null;
  const resultsDir = await dir.getDirectoryHandle('results').catch(() => null);
  if (resultsDir === null) return null;
  return readFile(resultsDir, jobId + '.bin');
}

/** Deletes one session's entire directory, ignoring a session that never existed. */
export async function purgeSession(sessionId: string): Promise<void> {
  const root = await getRoot();
  if (root === null) return;
  try {
    await root.removeEntry(SESSION_DIR_PREFIX + sessionId, { recursive: true });
  } catch {
    /* already gone, or never existed — both are the desired end state */
  }
}

/**
 * Deletes every session directory whose manifest is older than 24h, or has
 * no readable manifest at all (a partially-written session from a crash is
 * not worth trying to recover). Call once per app start (docs/05 §3).
 */
export async function purgeStaleSessions(now: number = Date.now()): Promise<void> {
  const root = await getRoot();
  if (root === null) return;
  // AsyncIterable directory entries are not in every lib.dom.d.ts snapshot
  // yet, despite being supported at runtime everywhere OPFS is.
  const iterable = root as unknown as { keys(): AsyncIterable<string> };
  if (typeof iterable.keys !== 'function') return;

  const staleIds: string[] = [];
  for await (const key of iterable.keys()) {
    if (!key.startsWith(SESSION_DIR_PREFIX)) continue;
    const sessionId = key.slice(SESSION_DIR_PREFIX.length);
    const manifest = await readManifest(sessionId);
    if (manifest === null || now - manifest.createdAt > SESSION_MAX_AGE_MS) {
      staleIds.push(sessionId);
    }
  }
  await Promise.all(staleIds.map((id) => purgeSession(id)));
}
