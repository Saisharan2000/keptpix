#!/usr/bin/env node
/**
 * inject-runtime-preload — modulepreload rolldown's shared runtime chunk in
 * every built page (docs/12 D-130).
 *
 * WHY. Vite 8 emits a shared `rolldown-runtime-*.js` that lazy chunks import.
 * Astro's own modulepreload list covers the island entry graph but NOT this
 * runtime, so the first lazy import on a page pays a live fetch for it — and
 * twice now that fetch has landed INSIDE a conversion, failing privacy.spec's
 * absolute zero-requests-during-a-job rule (first via the lazy-module path
 * fixed by ingest warm-up in D-124, then via a second interleaving under the
 * full suite). Preloading moves the fetch to page load, where it belongs:
 * after this, every later import of the runtime resolves from the module map
 * with no network request at all.
 *
 * Runs AFTER `astro build` and BEFORE the precache manifest, so the service
 * worker hashes the HTML that is actually served.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = 'dist';
const ASTRO_DIR = join(DIST, '_astro');

const runtimes = readdirSync(ASTRO_DIR).filter((f) => /^rolldown-runtime[-.].*\.js$/.test(f));
if (runtimes.length === 0) {
  // A future bundler may stop emitting it; that is success, not failure.
  console.log('inject-runtime-preload: no rolldown-runtime chunk in this build — nothing to do.');
  process.exit(0);
}

const tags = runtimes
  .map((f) => `<link rel="modulepreload" href="/_astro/${f}" crossorigin>`)
  .join('');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (extname(full) === '.html') out.push(full);
  }
  return out;
}

let patched = 0;
for (const file of walk(DIST)) {
  const html = readFileSync(file, 'utf8');
  if (html.includes('rolldown-runtime')) continue; // already carries it
  if (!html.includes('</head>')) continue;
  writeFileSync(file, html.replace('</head>', tags + '</head>'), 'utf8');
  patched += 1;
}

console.log(
  `inject-runtime-preload: ${runtimes.length} runtime chunk(s) preloaded in ${patched} page(s).`,
);
