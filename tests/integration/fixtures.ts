/**
 * Runtime fixture loading.
 *
 * These are loaded by FETCH rather than by a `?url` import on purpose. A `?url`
 * import is resolved at build time, so a missing fixture would break the whole
 * suite from compiling — and the fixtures are deliberately git-ignored, because
 * real camera photos carry GPS coordinates (see tests/fixtures/images/README.md).
 *
 * Fetching instead means a fresh clone runs green with those suites skipped, and
 * a machine that has the photos gets the full coverage.
 */

const BASE = '/tests/fixtures/images/';

export async function loadFixture(name: string): Promise<Blob | null> {
  try {
    const response = await fetch(BASE + name);
    if (!response.ok) return null;
    const blob = await response.blob();
    // A dev server that rewrites unknown paths to index.html would hand back
    // HTML with a 200, so check the payload actually looks like a file.
    if (blob.size < 1024) return null;
    return blob;
  } catch {
    return null;
  }
}

export async function hasFixture(name: string): Promise<boolean> {
  return (await loadFixture(name)) !== null;
}

export async function fixtureFile(name: string, as = name, type = ''): Promise<File> {
  const blob = await loadFixture(name);
  if (blob === null) throw new Error('fixture not available: ' + name);
  return new File([blob], as, { type });
}
