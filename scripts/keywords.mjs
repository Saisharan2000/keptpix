#!/usr/bin/env node
/**
 * keywords — turn REAL search queries into route decisions, using the matcher
 * that is already in production.
 *
 * THE PROBLEM WITH THE DOCUMENTED PLAN
 *
 * The distribution strategy proposes generating 150–400 landing pages from ~15
 * templates over a guessed query space. docs/05 §5 calls a page that ranks while
 * being less useful than its destination a doorway, and that rule has already
 * killed two proposed routes here. The doc is not wrong that the query space is
 * large; it is wrong that we have to guess at it.
 *
 * WHAT THIS DOES INSTEAD
 *
 * Google Search Console already knows which queries this site is shown for, how
 * often, and at what position. Export that, and every proposed page carries a
 * measured impression count instead of a template. A page justified by real
 * impressions is not a doorway — it is a page for demand we are provably already
 * receiving and failing to serve.
 *
 * WHY IT CAN USE THE REAL MATCHER
 *
 * `src/core/` is pure TypeScript that must run under plain Node (ADR-006), and
 * `query-index.ts` derives every entry from published route data. So this script
 * bundles and runs the SAME `matchQuery` a visitor hits on the homepage. No
 * reimplementation to drift out of sync: if the matcher would send a real user
 * nowhere, it sends this script nowhere too, and that is the finding.
 *
 * That purity rule was written to keep tests fast. This is the second thing it
 * paid for.
 *
 * USAGE
 *
 *   Search Console → Performance → Queries → Export → CSV
 *
 *   node scripts/keywords.mjs --from Queries.csv
 *   node scripts/keywords.mjs --from Queries.csv --queue     # write backlog items
 *   node scripts/keywords.mjs --from Queries.csv --min 5     # ignore noise
 *
 * Nothing here talks to Google. It reads a file the founder exported, so there is
 * no API credential, no OAuth, and no service that can start failing silently.
 */
import esbuild from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? fallback : (argv[i + 1] ?? true);
};
const FROM = flag('from');
const QUEUE = argv.includes('--queue');
const MIN_IMPRESSIONS = Number(flag('min', 1));
const SITE = flag('site', 'keptpix');

if (FROM === undefined) {
  process.stdout.write(
    '\nusage: node scripts/keywords.mjs --from <Queries.csv> [--queue] [--min N]\n\n' +
      'Get the CSV from Search Console:\n' +
      '  1. search.google.com/search-console → keptpix.com\n' +
      '  2. Performance → Queries tab\n' +
      '  3. set the date range as wide as it goes\n' +
      '  4. Export ▾ → Download CSV → use Queries.csv from the zip\n\n' +
      'Impressions are what matter here, not clicks. A query with impressions and\n' +
      'no route is demand arriving at a door that does not exist.\n',
  );
  process.exit(2);
}

if (!existsSync(FROM)) {
  process.stdout.write(`keywords: no such file: ${FROM}\n`);
  process.exit(1);
}

/* ── Load the production matcher ───────────────────────────────────────────── */
/**
 * Bundled through esbuild (already a devDependency, precedent in build-sw.mjs)
 * and imported from a data: URL, so this leaves no temp file to go stale or to be
 * committed by a stray `git add -A`.
 */
async function loadMatcher() {
  const result = await esbuild.build({
    stdin: {
      contents: [
        "export { QUERY_INDEX } from './src/content/query-index.ts';",
        "export { matchQuery, parseSize, formatSize } from './src/core/query-match.ts';",
      ].join('\n'),
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    // query-index reaches route data that reads build-time env through Vite's
    // import.meta.env, which does not exist under plain Node. esbuild's `define`
    // only accepts an entity name or a JS literal — not an object expression — so
    // the empty object is declared in a banner and the define points at its name.
    define: { 'import.meta.env': '__KEPTPIX_ENV__' },
    banner: { js: 'const __KEPTPIX_ENV__ = Object.create(null);' },
    logLevel: 'silent',
  });
  const code = result.outputFiles?.[0]?.text;
  if (code === undefined) throw new Error('esbuild produced no output');
  return import('data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64'));
}

/* ── CSV ───────────────────────────────────────────────────────────────────── */
/**
 * Minimal RFC-4180-ish reader. Search Console exports quoted fields, a UTF-8 BOM,
 * and localised percentages ("3.4%"), so none of those may be assumed away.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  // A UTF-8 BOM is stripped by CODE POINT rather than by a literal character in
  // this source: eslint's no-irregular-whitespace rejects a raw BOM in a regex,
  // and a rule that stops an invisible character being pasted into a pattern is
  // right to. Search Console's export carries one, and left in place it becomes
  // part of the first header name, so "Top queries" stops being found.
  const BOM = String.fromCharCode(0xfeff);
  const src = text.startsWith(BOM) ? text.slice(BOM.length) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const rows = parseCsv(readFileSync(FROM, 'utf8'));
if (rows.length < 2) {
  process.stdout.write(`keywords: ${FROM} has no data rows\n`);
  process.exit(1);
}

const header = rows[0].map((h) => h.trim().toLowerCase());
const col = (...names) => {
  for (const n of names) {
    const i = header.findIndex((h) => h === n);
    if (i !== -1) return i;
  }
  return -1;
};
const iQuery = col('top queries', 'query', 'queries');
const iImpr = col('impressions');
const iClicks = col('clicks');
const iPos = col('position', 'average position');

if (iQuery === -1 || iImpr === -1) {
  process.stdout.write(
    `keywords: ${FROM} does not look like a Search Console Queries export.\n` +
      `  wanted a "Top queries" and an "Impressions" column, got: ${header.join(', ')}\n`,
  );
  process.exit(1);
}

const num = (s) => {
  const n = Number(String(s ?? '').replace(/[%,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const queries = rows.slice(1).map((r) => ({
  query: (r[iQuery] ?? '').trim(),
  impressions: num(r[iImpr]),
  clicks: iClicks === -1 ? 0 : num(r[iClicks]),
  position: iPos === -1 ? null : num(r[iPos]),
})).filter((q) => q.query !== '' && q.impressions >= MIN_IMPRESSIONS);

/* ── Classify every query through the real matcher ─────────────────────────── */
const { QUERY_INDEX, matchQuery } = await loadMatcher();

const GAP = [];    // impressions, no route at all — demand we cannot serve
const WEAK = [];   // routed on a single token — low confidence, a human should look
const NEAR = [];   // routed, ranking 5–20 — the page exists and underperforms
const FAR = [];    // routed, ranking worse than 20 — page 3+, effectively invisible
const SERVED = []; // routed, ranking top 4 — nothing to do

for (const q of queries) {
  const hits = matchQuery(q.query, QUERY_INDEX, 3);
  const top = hits[0];
  if (top === undefined) { GAP.push(q); continue; }
  const entry = { ...q, path: top.path, label: top.label, score: top.score };
  const pos = q.position;
  if (top.score <= 1) WEAK.push(entry);
  else if (pos !== null && pos >= 5 && pos <= 20) NEAR.push(entry);
  /*
   * FAR exists because the first version of this had no bucket for it and swept
   * position 31 into SERVED — labelling "leave alone" a query ranking on page 4.
   * The `else` was doing double duty for "top 4" and "off the map", which are
   * opposite findings.
   */
  else if (pos !== null && pos > 20) FAR.push(entry);
  else SERVED.push(entry);
}

const byImpr = (a, b) => b.impressions - a.impressions;
for (const list of [GAP, WEAK, NEAR, FAR, SERVED]) list.sort(byImpr);

const total = queries.reduce((s, q) => s + q.impressions, 0);
const pct = (n) => (total === 0 ? '0' : ((n / total) * 100).toFixed(1));
const sum = (list) => list.reduce((s, q) => s + q.impressions, 0);

/* ── Report ────────────────────────────────────────────────────────────────── */
process.stdout.write(
  `\nkeywords  ${queries.length} queries · ${total} impressions · ` +
    `${QUERY_INDEX.length} routes in the matcher\n` +
    `          source: ${FROM}${MIN_IMPRESSIONS > 1 ? ` (min ${MIN_IMPRESSIONS} impressions)` : ''}\n\n`,
);

function section(title, list, note) {
  process.stdout.write(
    `── ${title}  ${list.length} queries · ${sum(list)} impressions (${pct(sum(list))}%)\n   ${note}\n\n`,
  );
  for (const q of list.slice(0, 15)) {
    const pos = q.position === null ? '   —' : `p${q.position.toFixed(1).padStart(5)}`;
    const route = q.path === undefined ? '' : `  → ${q.path}`;
    process.stdout.write(
      `   ${String(q.impressions).padStart(6)} impr  ${String(q.clicks).padStart(4)} clk  ${pos}  ${q.query}${route}\n`,
    );
  }
  if (list.length > 15) process.stdout.write(`   … and ${list.length - 15} more\n`);
  process.stdout.write('\n');
}

section('GAP', GAP, 'Shown for these and we have no route. Measured demand, so a new page here is not a doorway.');
section('WEAK', WEAK, 'Routed on a single token. Check the matcher is not confidently sending people to the wrong tool.');
section('NEAR', NEAR, 'Page exists, ranks 5–20. Strengthening one of these is cheaper than a new page.');
section('FAR', FAR, 'Page exists, ranks worse than 20 — page 3 and beyond, so the impressions are noise.');
section('SERVED', SERVED, 'Routed and ranking top 4. Leave alone.');

/* ── Optionally turn the top findings into backlog items ───────────────────── */
if (QUEUE) {
  const items = [
    ...GAP.slice(0, 5).map((q) => ({
      title: `Route for "${q.query}" — no page exists`,
      why: `${q.impressions} impressions, ${q.clicks} clicks, position ${q.position ?? '?'}. ` +
        `The production matcher returns nothing for this query, so a visitor typing it on our own ` +
        `homepage also gets nothing. Measured demand, not a template guess (docs/05 §5).`,
    })),
    ...NEAR.slice(0, 3).map((q) => ({
      title: `Strengthen ${q.path} for "${q.query}" (position ${q.position?.toFixed(1)})`,
      why: `${q.impressions} impressions at position ${q.position?.toFixed(1)}. The page exists and ` +
        `underperforms; improving it beats adding another page.`,
    })),
    ...WEAK.slice(0, 3).map((q) => ({
      title: `Matcher sends "${q.query}" to ${q.path} on one token — verify that is right`,
      why: `${q.impressions} impressions, match score ${q.score}. A single-token match is how the ` +
        `matcher confidently sends someone to a tool that cannot do the job.`,
    })),
  ];

  if (items.length === 0) {
    process.stdout.write('nothing worth queueing.\n');
  } else {
    for (const it of items) {
      try {
        execFileSync('node', ['scripts/backlog.mjs', 'add', SITE, it.title, '--why', it.why], {
          encoding: 'utf8',
          stdio: 'pipe',
        });
        process.stdout.write(`  queued: ${it.title}\n`);
      } catch (err) {
        process.stdout.write(`  FAILED to queue "${it.title}": ${err.message}\n`);
      }
    }
  }
}

if (GAP.length === 0 && NEAR.length === 0) {
  process.stdout.write('No gaps and nothing stuck at 5–20. Either the coverage is genuinely good\n');
  process.stdout.write('or the export is too small to say anything yet.\n');
}
