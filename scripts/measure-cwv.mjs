#!/usr/bin/env node
/**
 * measure-cwv — the docs/04 §7 page-experience budgets, measured instead of cited.
 *
 *   node scripts/measure-cwv.mjs                       # live origin, 3 routes
 *   node scripts/measure-cwv.mjs --url http://localhost:4321
 *   node scripts/measure-cwv.mjs --routes /,/compress/jpg-to-100kb
 *   node scripts/measure-cwv.mjs --json
 *
 * WHY THIS EXISTS. The distribution strategy cited "111ms load, 100% green
 * Core Web Vitals" as a competitive claim, and nobody could say where that was
 * measured (docs/12 D-110). docs/04 §7 has carried Lighthouse-CI budgets since
 * the start — LCP < 2.0 s on mobile, TBT < 150 ms, all four categories ≥ 95
 * with SEO and A11y at 100 — and, like the memory budget before D-103, they
 * were instrumentable but unmeasured. A number used in a pitch has to have a
 * command that produces it.
 *
 * WHAT THIS IS AND IS NOT. Lighthouse mobile emulation (Moto G Power class,
 * slow-4G throttling — Lighthouse's defaults, deliberately unchanged so the
 * numbers are comparable to what anyone else would measure). It is a LAB
 * number: real-user field data (CrUX) needs 28 days of traffic this site does
 * not have yet. Lab-vs-field is exactly the distinction the "111ms" claim
 * blurred — this script prints which one it is.
 *
 * Runs `npx lighthouse` rather than adding a dependency: lighthouse is ~9 MB
 * of dev tooling used a few times a month, and CLAUDE.md's 100 KB rule is for
 * shipped dependencies — but there is no reason to carry it in the tree when
 * npx caches it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? fallback : argv[i + 1];
};
const JSON_OUT = argv.includes('--json');
const BASE = (flag('url', 'https://keptpix.com')).replace(/\/$/, '');

/** One hub, one money page, one converter — the shapes a visitor actually hits. */
const ROUTES = (flag('routes', '/,/compress/signature-to-20kb,/convert/heic-to-jpg'))
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

/** docs/04 §7, verbatim. */
const BUDGETS = {
  lcpMs: 2000,
  tbtMs: 150,
  categoryFloor: 95,
  perfectCategories: ['seo', 'accessibility'],
};

const results = [];
let failed = false;

for (const route of ROUTES) {
  const url = BASE + route;
  const dir = mkdtempSync(join(tmpdir(), 'cwv-'));
  const out = join(dir, 'report.json');
  process.stderr.write(`lighthouse ${url} …\n`);
  try {
    try {
      execFileSync(
        'npx',
        [
          'lighthouse',
          url,
          '--output=json',
          `--output-path=${out}`,
          '--quiet',
          '--chrome-flags=--headless=new',
        ],
        { stdio: ['ignore', 'ignore', 'ignore'], shell: process.platform === 'win32', timeout: 300_000 },
      );
    } catch {
      /*
       * chrome-launcher's temp-profile cleanup throws EBUSY on Windows AFTER
       * the report is written, poisoning the exit code of a run that
       * succeeded. The report file is the honest success signal: if it exists
       * and parses, the audit ran; if it does not, the throw below says so.
       */
    }
    const report = JSON.parse(readFileSync(out, 'utf8'));
    const audit = (id) => report.audits?.[id]?.numericValue;
    const cat = (id) => Math.round((report.categories?.[id]?.score ?? 0) * 100);

    const row = {
      route,
      lcpMs: Math.round(audit('largest-contentful-paint') ?? -1),
      tbtMs: Math.round(audit('total-blocking-time') ?? -1),
      cls: +(audit('cumulative-layout-shift') ?? -1).toFixed(3),
      fcpMs: Math.round(audit('first-contentful-paint') ?? -1),
      performance: cat('performance'),
      accessibility: cat('accessibility'),
      bestPractices: cat('best-practices'),
      seo: cat('seo'),
      fetchTime: report.fetchTime,
      lighthouseVersion: report.lighthouseVersion,
    };

    row.verdicts = {
      lcp: row.lcpMs > 0 && row.lcpMs < BUDGETS.lcpMs,
      tbt: row.tbtMs >= 0 && row.tbtMs < BUDGETS.tbtMs,
      categories:
        [row.performance, row.accessibility, row.bestPractices, row.seo].every(
          (s) => s >= BUDGETS.categoryFloor,
        ) &&
        row.seo === 100 &&
        row.accessibility === 100,
    };
    if (!row.verdicts.lcp || !row.verdicts.tbt || !row.verdicts.categories) failed = true;
    results.push(row);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ base: BASE, budgets: BUDGETS, results }, null, 2) + '\n');
} else {
  process.stdout.write(
    `\ncwv (Lighthouse mobile emulation, LAB numbers — not field data)  ${BASE}\n\n`,
  );
  for (const r of results) {
    const mark = (ok) => (ok ? 'ok  ' : 'FAIL');
    process.stdout.write(`  ${r.route}\n`);
    process.stdout.write(
      `    ${mark(r.verdicts.lcp)} LCP ${r.lcpMs} ms (budget < ${BUDGETS.lcpMs})   ` +
        `${mark(r.verdicts.tbt)} TBT ${r.tbtMs} ms (< ${BUDGETS.tbtMs})   CLS ${r.cls}\n`,
    );
    process.stdout.write(
      `    ${mark(r.verdicts.categories)} categories  perf ${r.performance} · a11y ${r.accessibility} · ` +
        `best-practices ${r.bestPractices} · seo ${r.seo}  (floor ${BUDGETS.categoryFloor}, seo+a11y must be 100)\n\n`,
    );
  }
  process.stdout.write(
    failed
      ? 'over budget somewhere — the numbers above say where.\n'
      : `Clean: ${results.length} route(s) inside every docs/04 §7 page-experience budget.\n`,
  );
}

process.exitCode = failed ? 1 : 0;
