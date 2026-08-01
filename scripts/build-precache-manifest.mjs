#!/usr/bin/env node
/**
 * scripts/build-precache-manifest.mjs
 *
 * Runs after `astro build`. Vite content-hashes every asset filename, so a
 * service worker cannot hardcode a precache list — it would go stale on the
 * very next deploy. This script reads the ACTUAL dependency graph Astro
 * already emitted (every page's own <script>/<link modulepreload> tags) and
 * writes it to dist/precache-manifest.json for public/sw.ts to fetch at
 * install time.
 *
 * Deliberately excludes anything not referenced by any page's HTML — that is
 * exactly the WASM codec glue and binaries, which docs/10 M8 wants cached on
 * FIRST USE, not eagerly. This script does not know what a "WASM codec" is;
 * it only knows what every page eagerly declares, which is the same
 * distinction ADR-004 already draws, verified by construction rather than by
 * a hardcoded file-name pattern.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.join(process.cwd(), 'dist');

async function findHtmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await findHtmlFiles(full)));
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

/** dist/about/index.html -> /about ; dist/index.html -> / ; dist/404.html -> /404.html */
function htmlFileToRoute(distRelativePath) {
  const posix = distRelativePath.split(path.sep).join('/');
  if (posix === 'index.html') return '/';
  if (posix.endsWith('/index.html')) return '/' + posix.slice(0, -'/index.html'.length);
  return '/' + posix;
}

// href/src cover <link>/<script> tags; component-url/renderer-url cover
// Astro's <astro-island> custom element, which references its hydration
// bundle and Preact renderer that way instead — found by inspecting the
// actual built HTML, not by assuming a mechanism (docs/12 D-52).
const ASSET_ATTR_RE = /(?:href|src|component-url|renderer-url)="(\/_astro\/[^"]+)"/g;

async function main() {
  const htmlFiles = await findHtmlFiles(DIST);
  const urls = new Set(['/', '/favicon.svg', '/manifest.webmanifest']);

  for (const file of htmlFiles) {
    const relative = path.relative(DIST, file);
    urls.add(htmlFileToRoute(relative));

    const html = await readFile(file, 'utf8');
    for (const match of html.matchAll(ASSET_ATTR_RE)) {
      urls.add(match[1]);
    }
  }

  const sorted = [...urls].sort();
  const version = createHash('sha256').update(sorted.join('\n')).digest('hex').slice(0, 16);

  const manifestPath = path.join(DIST, 'precache-manifest.json');
  await writeFile(manifestPath, JSON.stringify({ version, urls: sorted }, null, 2));

  const sizeKb = ((await stat(manifestPath)).size / 1024).toFixed(1);
  console.log(
    `precache-manifest.json: ${sorted.length} URLs, version ${version} (${sizeKb} KB)`,
  );
}

main().catch((error) => {
  console.error('build-precache-manifest failed:', error);
  process.exitCode = 1;
});
