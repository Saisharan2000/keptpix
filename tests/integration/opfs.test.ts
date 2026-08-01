/**
 * docs/12 D-51 — the OPFS session-blob primitive, against a real
 * origin-private file system. Runs in a real browser deliberately:
 * `navigator.storage.getDirectory()` does not exist under plain Node.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  isOpfsAvailable,
  purgeSession,
  purgeStaleSessions,
  readManifest,
  readResultBlob,
  readSourceBlob,
  writeResultBlob,
  writeSourceBlob,
} from '../../src/platform/opfs';

describe('OPFS session store (docs/12 D-51)', () => {
  let available = false;

  beforeAll(async () => {
    available = await isOpfsAvailable();
  });

  it('is available in this real Chromium', () => {
    // Not a hard requirement of the module (Safari private browsing lacks
    // it entirely, and every function degrades gracefully) but if it is
    // NOT available here, every test below is only exercising the fallback
    // path, not the real filesystem this module exists to use.
    expect(available).toBe(true);
  });

  it('writes and reads back a source blob byte-for-byte', async () => {
    const sessionId = 'test-' + Date.now();
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252]);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });

    const wrote = await writeSourceBlob(sessionId, 'source-1', 'photo.jpg', blob);
    expect(wrote).toBe(true);

    const readBack = await readSourceBlob(sessionId, 'source-1');
    expect(readBack).not.toBeNull();
    const readBytes = new Uint8Array(await readBack!.arrayBuffer());
    expect([...readBytes]).toEqual([...bytes]);

    await purgeSession(sessionId);
  });

  it('writes a result blob and records both in one manifest', async () => {
    const sessionId = 'test-' + Date.now();
    const sourceBlob = new Blob(['source bytes'], { type: 'application/octet-stream' });
    const resultBlob = new Blob(['result bytes'], { type: 'image/jpeg' });

    await writeSourceBlob(sessionId, 'src-a', 'a.png', sourceBlob);
    await writeResultBlob(sessionId, 'job-a', 'a.jpg', resultBlob);

    const manifest = await readManifest(sessionId);
    expect(manifest).not.toBeNull();
    expect(manifest?.sessionId).toBe(sessionId);
    expect(manifest?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'source', id: 'src-a', name: 'a.png' }),
        expect.objectContaining({ kind: 'result', id: 'job-a', name: 'a.jpg' }),
      ]),
    );

    const resultBack = await readResultBlob(sessionId, 'job-a');
    expect(await resultBack?.text()).toBe('result bytes');

    await purgeSession(sessionId);
  });

  it('reading an unknown session or blob returns null, never throws', async () => {
    await expect(readManifest('never-existed')).resolves.toBeNull();
    await expect(readSourceBlob('never-existed', 'x')).resolves.toBeNull();
    await expect(readResultBlob('never-existed', 'x')).resolves.toBeNull();
  });

  it('purgeSession on a session that never existed is a silent no-op', async () => {
    await expect(purgeSession('definitely-never-existed-' + Date.now())).resolves.toBeUndefined();
  });

  it('purgeStaleSessions deletes only sessions older than 24h, keeps fresh ones', async () => {
    const fresh = 'fresh-' + Date.now();
    const stale = 'stale-' + Date.now();
    await writeSourceBlob(fresh, 's', 'f.bin', new Blob(['x']));
    await writeSourceBlob(stale, 's', 'f.bin', new Blob(['x']));

    // Backdate the stale session's manifest to 25 hours ago, writing it with
    // the exact same file the module itself reads — no private API reach-in,
    // just a direct write to the one JSON file readManifest() parses.
    const staleManifest = await readManifest(stale);
    expect(staleManifest).not.toBeNull();
    const backdated = { ...staleManifest!, createdAt: Date.now() - 25 * 60 * 60 * 1000 };
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('session-' + stale);
    const fileHandle = await dir.getFileHandle('manifest.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([JSON.stringify(backdated)]));
    await writable.close();

    await purgeStaleSessions();

    await expect(readManifest(fresh)).resolves.not.toBeNull();
    await expect(readManifest(stale)).resolves.toBeNull();

    await purgeSession(fresh);
  });
});
