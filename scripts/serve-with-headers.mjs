#!/usr/bin/env node
/**
 * scripts/serve-with-headers.mjs
 *
 *   node scripts/serve-with-headers.mjs [port]
 *
 * Serve `dist/` the way Cloudflare Pages does — applying `public/_headers` and
 * resolving extensionless URLs to `.html` files — so header behaviour can be
 * tested before deploying.
 *
 * WHY THIS EXISTS. `astro preview` ignores `_headers` entirely, because it is a
 * Cloudflare feature. That left a real blind spot: nothing in the local suite
 * modelled the host, and two production-only bugs came out of it —
 *
 *   D-65: every canonical URL 308-redirected, because Astro's default build
 *         format contradicted `trailingSlash: 'never'`. Found by curl-ing
 *         production, after the full local gate was green.
 *   D-66: Cloudflare injected an analytics beacon at the edge, which the CSP in
 *         `_headers` now blocks. Shipping an untested CSP is how you discover
 *         you have blocked your own WASM codecs, in production.
 *
 * This is deliberately a MODEL, not an emulator: it covers the two behaviours
 * that have actually bitten (header application and URL resolution) and does not
 * pretend to reproduce Cloudflare's caching, redirects or Functions.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const HEADERS_FILE = path.join(ROOT, 'public', '_headers');
const PORT = Number(process.argv[2] ?? 4321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Parse `_headers`: a path pattern on a bare line, then indented `Name: value`
 * lines. Comments and blanks ignored. Only `/*` and `/prefix/*` globs are
 * supported, which is all this project uses.
 */
function parseHeaderRules() {
  if (!existsSync(HEADERS_FILE)) return [];
  const rules = [];
  let current = null;
  for (const raw of readFileSync(HEADERS_FILE, 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    const idx = line.indexOf(':');
    if (current !== null && idx > 0) {
      current.headers.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()]);
    }
  }
  return rules;
}

const RULES = parseHeaderRules();

function matches(pattern, pathname) {
  if (pattern.endsWith('/*')) return pathname.startsWith(pattern.slice(0, -1));
  return pattern === pathname;
}

/** Cloudflare serves `about.html` at `/about`; `/` maps to index.html. */
async function resolveFile(pathname) {
  const clean = pathname.split('?')[0];
  const candidates =
    clean === '/'
      ? ['index.html']
      : [clean.slice(1), clean.slice(1) + '.html', path.join(clean.slice(1), 'index.html')];

  for (const rel of candidates) {
    const full = path.join(DIST, rel);
    if (!full.startsWith(DIST)) continue; // path traversal
    try {
      if ((await stat(full)).isFile()) return full;
    } catch {
      /* next candidate */
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = await resolveFile(pathname);

  const send = async (status, filePath) => {
    const body = filePath === null ? Buffer.from('Not found') : await readFile(filePath);
    const ext = filePath === null ? '.txt' : path.extname(filePath);

    // Built as one object and passed to writeHead: setHeader() AFTER writeHead
    // throws ERR_HTTP_HEADERS_SENT and kills the server on the first request.
    const headers = { 'Content-Type': MIME[ext] ?? 'application/octet-stream' };
    // Later rules win, matching how this project's _headers is written
    // (general `/*` baseline first, specific paths after).
    for (const rule of RULES) {
      if (!matches(rule.pattern, pathname)) continue;
      for (const [name, value] of rule.headers) headers[name] = value;
    }

    res.writeHead(status, headers);
    res.end(body);
  };

  if (file === null) {
    const notFound = path.join(DIST, '404.html');
    await send(404, existsSync(notFound) ? notFound : null);
    return;
  }
  await send(200, file);
});

server.listen(PORT, () => {
  console.log(`serving dist/ with _headers applied on http://localhost:${PORT}`);
  const csp = RULES.flatMap((r) => r.headers).find(
    ([n]) => n.toLowerCase() === 'content-security-policy',
  );
  console.log(csp ? 'CSP active' : 'no CSP found in _headers');
});
