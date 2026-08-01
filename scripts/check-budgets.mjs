#!/usr/bin/env node
/**
 * scripts/check-budgets.mjs
 *
 * Enforces ALL THREE static budgets from docs/04-architecture.md §7:
 *
 *   1. HTML per route          < 25 KB gz
 *   2. Baseline island JS      < 60 KB gz   (per route, module graph included)
 *   3. Any single .wasm codec  < 1.2 MB     (raw — WASM ships uncompressed)
 *
 * Bundle creep is silent and cumulative, which is why this runs in CI and fails
 * the build rather than printing a warning. Standing rule 5 in docs/10: run it
 * before declaring any milestone done.
 *
 * Sizes are gzip level 9, matching precompressed static hosting on Cloudflare
 * Pages. Brotli would be smaller; gzip is the conservative number.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(REPO_ROOT, 'dist');

const KB = 1024;
const MB = 1024 * 1024;

const BUDGETS = {
  html: 25 * KB,
  js: 60 * KB,
  wasm: 1.2 * MB,
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

const gz = (buf) => gzipSync(buf, { level: 9 }).length;

const fmt = (bytes) =>
  bytes >= MB ? `${(bytes / MB).toFixed(2)} MB` : `${(bytes / KB).toFixed(1)} KB`;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Every JS entry point a page pulls in.
 *
 * The island attributes are not optional extras — they are THE entry points for
 * anything hydrated. Astro's `client:*` directives do not emit a `<script src>`;
 * they emit `<astro-island component-url="…" renderer-url="…">` and a minified
 * inline bootstrap that dynamic-imports those URLs. Miss them and this script
 * happily reports ~1.5 KB for a page shipping an entire UI framework.
 */
function extractEntryScripts(html) {
  const refs = new Set();
  const patterns = [
    /<script\b[^>]*\bsrc=["']([^"']+)["']/gi,
    /<link\b[^>]*\brel=["'](?:modulepreload|preload)["'][^>]*\bhref=["']([^"']+\.js)["']/gi,
    /<link\b[^>]*\bhref=["']([^"']+\.js)["'][^>]*\brel=["'](?:modulepreload|preload)["']/gi,
    /\bcomponent-url=["']([^"']+)["']/gi,
    /\brenderer-url=["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const src = m[1];
      if (src && !/^(https?:)?\/\//.test(src)) refs.add(src);
    }
  }
  return [...refs];
}

/**
 * Concatenated source of inline scripts in the document — the theme bootstrap
 * in docs/10 M1 ships this way, so it counts against the JS budget. JSON-LD and
 * other data blocks are skipped: they are not executable JavaScript.
 */
function inlineScriptSource(html) {
  let src = '';
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const type = /\btype=["']([^"']+)["']/i.exec(m[0])?.[1] ?? '';
    if (/json/i.test(type)) continue;
    src += m[1];
  }
  return src;
}

const isRelative = (spec) =>
  Boolean(spec) && (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/'));

function collect(code, patterns) {
  const refs = new Set();
  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      if (isRelative(m[1])) refs.add(m[1]);
    }
  }
  return [...refs];
}

/**
 * STATIC imports — what the browser must download before the island can
 * hydrate. This is what the docs/04 §7 "baseline island JS" budget governs.
 */
function extractStaticImports(code) {
  return collect(code, [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s+["']([^"']+)["']/g]);
}

/**
 * LAZY references — dynamic import() and `new Worker(new URL(...))`.
 *
 * These are NOT hydration cost and must not be charged to the baseline: the
 * image worker is fetched when the first conversion starts, and client-zip only
 * when someone downloads a ZIP. Counting them would push us to optimise the
 * wrong thing. They are reported separately so they can never grow unwatched.
 */
function extractLazyImports(code) {
  return collect(code, [
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /new\s+URL\s*\(\s*["']([^"']+\.js)["']/g,
  ]);
}

function resolveRef(spec, fromFile) {
  const p = spec.startsWith('/') ? join(DIST, spec) : resolve(dirname(fromFile), spec);
  return existsSync(p) && statSync(p).isFile() ? p : null;
}

/**
 * Total gzipped bytes of the JS module graph a single page pulls in.
 * Each module is counted once per page, matching what the browser downloads.
 */
function moduleGraphBytes(htmlFile, html) {
  const seen = new Set();
  const lazyRoots = new Set();
  const queue = extractEntryScripts(html)
    .map((s) => resolveRef(s, htmlFile))
    .filter(Boolean);

  let total = 0;
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    const code = readFileSync(file);
    total += gz(code);
    const text = code.toString('utf8');

    for (const spec of extractStaticImports(text)) {
      const next = resolveRef(spec, file);
      if (next && !seen.has(next)) queue.push(next);
    }
    for (const spec of extractLazyImports(text)) {
      const next = resolveRef(spec, file);
      if (next) lazyRoots.add(next);
    }
  }

  // Everything reachable only through a lazy edge, counted once.
  let lazyBytes = 0;
  const lazySeen = new Set();
  const lazyQueue = [...lazyRoots].filter((f) => !seen.has(f));
  while (lazyQueue.length) {
    const file = lazyQueue.pop();
    if (lazySeen.has(file) || seen.has(file)) continue;
    lazySeen.add(file);
    const code = readFileSync(file);
    lazyBytes += gz(code);
    const text = code.toString('utf8');
    for (const spec of [...extractStaticImports(text), ...extractLazyImports(text)]) {
      const next = resolveRef(spec, file);
      if (next && !lazySeen.has(next) && !seen.has(next)) lazyQueue.push(next);
    }
  }

  return { total, moduleCount: seen.size, lazyBytes, lazyCount: lazySeen.size };
}

/* ── run ─────────────────────────────────────────────────────────────────── */

if (!existsSync(DIST)) {
  console.error('✗ dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const wasmFiles = files.filter((f) => f.endsWith('.wasm'));

const violations = [];
const rows = [];

/* 1 + 2 — per-route HTML and JS */
for (const file of htmlFiles) {
  const raw = readFileSync(file);
  const html = raw.toString('utf8');
  const route = '/' + relative(DIST, file).split(/[\\/]/).join(posix.sep);

  const htmlGz = gz(raw);
  const { total: graphGz, moduleCount, lazyBytes, lazyCount } = moduleGraphBytes(file, html);
  const inline = inlineScriptSource(html);
  const jsGz = graphGz + (inline.trim() ? gz(Buffer.from(inline, 'utf8')) : 0);

  rows.push({ route, htmlGz, jsGz, moduleCount, lazyBytes, lazyCount });

  if (htmlGz > BUDGETS.html) {
    violations.push(`HTML  ${route} — ${fmt(htmlGz)} gz exceeds ${fmt(BUDGETS.html)}`);
  }
  if (jsGz > BUDGETS.js) {
    violations.push(`JS    ${route} — ${fmt(jsGz)} gz exceeds ${fmt(BUDGETS.js)}`);
  }
}

/* 3 — WASM codecs */
const wasmRows = [];
for (const file of wasmFiles) {
  const size = statSync(file).size;
  const name = relative(DIST, file).split(/[\\/]/).join(posix.sep);
  wasmRows.push({ name, size });
  if (size > BUDGETS.wasm) {
    violations.push(`WASM  ${name} — ${fmt(size)} exceeds ${fmt(BUDGETS.wasm)}`);
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */

console.log('\nStatic budgets — docs/04-architecture.md §7\n');

if (rows.length === 0) {
  console.log('  (no HTML routes built yet)\n');
} else {
  const worstHtml = rows.reduce((a, b) => (b.htmlGz > a.htmlGz ? b : a));
  const worstJs = rows.reduce((a, b) => (b.jsGz > a.jsGz ? b : a));

  console.log(`  Routes built            ${rows.length}`);
  console.log(
    `  HTML per route  max     ${fmt(worstHtml.htmlGz).padStart(9)} gz  / ${fmt(BUDGETS.html)}   ${worstHtml.route}`,
  );
  console.log(
    `  Baseline JS     max     ${fmt(worstJs.jsGz).padStart(9)} gz  / ${fmt(BUDGETS.js)}   ${worstJs.route}` +
      (worstJs.moduleCount ? `  (${worstJs.moduleCount} modules)` : '  (no JS)'),
  );
  const worstLazy = rows.reduce((a, b) => (b.lazyBytes > a.lazyBytes ? b : a));
  if (worstLazy.lazyBytes > 0) {
    console.log(
      `  Lazy chunks     max     ${fmt(worstLazy.lazyBytes).padStart(9)} gz  (not hydration cost: worker + on-demand imports, ${worstLazy.lazyCount} modules)`,
    );
  }
}

if (wasmRows.length === 0) {
  console.log(`  WASM codecs             none bundled`);
} else {
  const worstWasm = wasmRows.reduce((a, b) => (b.size > a.size ? b : a));
  console.log(
    `  WASM codecs     max     ${fmt(worstWasm.size).padStart(9)}     / ${fmt(BUDGETS.wasm)}   ${worstWasm.name}  (${wasmRows.length} total)`,
  );
}

if (violations.length) {
  console.error(`\n✗ ${violations.length} budget violation(s):\n`);
  for (const v of violations) console.error(`    ${v}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ All three static budgets pass.\n');
