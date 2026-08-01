#!/usr/bin/env node
/**
 * scripts/build-sw.mjs
 *
 * Runs after scripts/build-precache-manifest.mjs. Transpiles public/sw.ts to
 * plain JS (no bundling needed — the file has zero imports by design) and
 * bakes this build's real precache manifest into it by replacing the two
 * placeholder tokens declared in sw.ts, so the SERVICE WORKER'S OWN BYTES
 * change whenever any precached asset does. That is what makes the browser
 * notice there is a new version to install — see the comment in sw.ts.
 */
import esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'public', 'sw.ts');
const MANIFEST = path.join(ROOT, 'dist', 'precache-manifest.json');
const OUT = path.join(ROOT, 'dist', 'sw.js');

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));

  const result = await esbuild.build({
    entryPoints: [SRC],
    bundle: false,
    write: false,
    format: 'esm',
    target: 'es2022',
    minify: true,
  });

  const file = result.outputFiles[0];
  if (file === undefined) throw new Error('esbuild produced no output for ' + SRC);

  const withManifest = file.text
    .replace('__PRECACHE_VERSION__', JSON.stringify(manifest.version))
    .replace('__PRECACHE_URLS__', JSON.stringify(manifest.urls));

  if (withManifest.includes('__PRECACHE_')) {
    throw new Error('a __PRECACHE_*__ placeholder survived substitution — check sw.ts and this script agree');
  }

  await writeFile(OUT, withManifest);
  console.log(`dist/sw.js: ${(withManifest.length / 1024).toFixed(1)} KB, manifest ${manifest.version}`);
}

main().catch((error) => {
  console.error('build-sw failed:', error);
  process.exitCode = 1;
});
