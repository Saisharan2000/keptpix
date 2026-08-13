/**
 * scripts/check-seo.mjs
 *
 * Audits the BUILT output for the on-page problems that silently cost clicks.
 *
 * A gate rather than a one-off, for the same reason `check:budgets` is one: an
 * eyeballed audit is accurate on the day it is run and decays immediately.
 * These are all mechanical properties of the HTML, so there is no reason for a
 * human to be checking them at all.
 *
 * What it deliberately does NOT check: anything requiring judgement about
 * whether copy is good. It only catches the things that are unambiguously
 * wrong — truncated in a result page, duplicated across routes, or missing.
 *
 * Exits non-zero on an error. Warnings are printed and do not fail the build,
 * because a 62-character title is worth knowing about and not worth blocking on.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = join(process.cwd(), 'dist');

/**
 * Google truncates around 580px, which is roughly 60 characters — the exact
 * pixel width depends on the glyphs, so treat this as the point past which
 * truncation becomes likely rather than certain.
 */
const TITLE_MAX = 60;
const TITLE_MIN = 15;
/** Descriptions are truncated around 155-160 characters on desktop. */
const DESC_MAX = 160;
/** Below this a description is not doing the job of earning the click. */
const DESC_MIN = 70;

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

const routeOf = (file) =>
  '/' +
  relative(DIST, file)
    .split(sep)
    .join('/')
    .replace(/index\.html$/, '')
    .replace(/\.html$/, '');

/** Attribute value from a meta/link tag, or null. */
function meta(html, pattern) {
  const match = pattern.exec(html);
  return match === null ? null : (match[1] ?? '').trim();
}

/** Entities decoded just enough to measure real length. */
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—');

const errors = [];
const warnings = [];
const seenTitles = new Map();
const seenDescriptions = new Map();

let files;
try {
  files = htmlFiles(DIST);
} catch {
  console.error('check:seo — no dist/ found. Run `npm run build` first.');
  process.exit(1);
}

for (const file of files) {
  const route = routeOf(file);
  // The 404 page is not a search result and is exempt from every rule here.
  if (route === '/404') continue;

  const html = readFileSync(file, 'utf8');
  const noindex = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html);

  const title = decode(meta(html, /<title>([\s\S]*?)<\/title>/i) ?? '');
  const description = decode(meta(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i) ?? '');
  const canonical = meta(html, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  const ogTitle = meta(html, /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i);
  const ogImage = meta(html, /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i);

  const err = (msg) => errors.push(`${route}: ${msg}`);
  const warn = (msg) => warnings.push(`${route}: ${msg}`);

  if (title.length === 0) err('no <title>');
  else if (title.length < TITLE_MIN) err(`title is only ${title.length} chars`);
  else if (title.length > TITLE_MAX) warn(`title is ${title.length} chars, likely truncated: "${title}"`);

  if (description.length === 0) err('no meta description');
  else if (description.length > DESC_MAX)
    warn(`description is ${description.length} chars, likely truncated`);
  else if (description.length < DESC_MIN) warn(`description is only ${description.length} chars`);

  if (canonical === null) err('no canonical URL');
  else if (!canonical.startsWith('http')) err(`canonical is not absolute: ${canonical}`);

  if (h1s.length === 0) err('no <h1>');
  else if (h1s.length > 1) err(`${h1s.length} <h1> elements`);

  if (ogTitle === null) warn('no og:title — link previews fall back to the title');
  if (ogImage === null) warn('no og:image — shared links render without a card');

  // Duplicates matter only among indexable pages: two noindex pages sharing a
  // title costs nothing, two indexable ones compete with each other.
  if (!noindex) {
    if (title.length > 0) {
      const prev = seenTitles.get(title);
      if (prev !== undefined) err(`duplicate <title> with ${prev}: "${title}"`);
      else seenTitles.set(title, route);
    }
    if (description.length > 0) {
      const prev = seenDescriptions.get(description);
      if (prev !== undefined) err(`duplicate description with ${prev}`);
      else seenDescriptions.set(description, route);
    }
  }
}

/*
 * SITEMAP COVERAGE — every indexable built page must be IN the sitemap.
 *
 * The inverse of the no-orphans rule, and it had no gate until
 * /keptpix-vs-ilovepdf shipped live, footer-linked, returning 200 — and
 * absent from the sitemap, because the generator's STATIC_ENTRIES list is
 * hand-maintained and nobody's checklist said "update it" (docs/12 D-123).
 * The no-orphans spec walks sitemap → links; nothing walked built pages →
 * sitemap. Noindex pages and /404 are exempt for the same reason they are
 * exempt from every other rule here: they are not search results.
 */
{
  const sitemapXml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
  const inSitemap = new Set(
    [...sitemapXml.matchAll(/<loc>\s*https?:\/\/[^/<]+([^<\s]*)\s*<\/loc>/g)].map((m) => {
      // "https://keptpix.com/" captures "/" and "https://keptpix.com" captures
      // "" — both are the root. Strip a trailing slash only when something
      // remains, or the homepage flags itself as missing.
      const p = m[1] === '' ? '/' : m[1];
      return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
    }),
  );
  for (const file of files) {
    const route = routeOf(file);
    if (route === '/404') continue;
    const html = readFileSync(file, 'utf8');
    if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html)) continue;
    if (!inSitemap.has(route)) {
      errors.push(`${route}: built and indexable but MISSING from sitemap.xml`);
    }
  }
}

console.log(`\nOn-page SEO — ${files.length} built pages\n`);
if (errors.length > 0) {
  console.log('  ERRORS');
  for (const e of errors) console.log('    ' + e);
  console.log('');
}
if (warnings.length > 0) {
  console.log('  WARNINGS');
  for (const w of warnings) console.log('    ' + w);
  console.log('');
}
if (errors.length === 0 && warnings.length === 0) {
  console.log('  Clean: titles, descriptions, canonicals, h1s and OG tags all present and unique.\n');
} else {
  console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)\n`);
}

process.exit(errors.length > 0 ? 1 : 0);
