#!/usr/bin/env node
/**
 * scripts/status.mjs — maintenance documentation, generated from evidence.
 *
 *   node scripts/status.mjs            # print
 *   node scripts/status.mjs --write    # write docs/STATUS.md
 *   node scripts/status.mjs --offline  # skip the live checks
 *
 * WHY GENERATED AND NOT WRITTEN. A hand-maintained status page is accurate on
 * the day it is written and slowly becomes fiction. Worse, this project has twice
 * shipped copy that described an INTENTION rather than the code — a FAQ claiming
 * already-small files came back untouched when they came back 57% larger (D-91),
 * and a UI saying "Saved images.pdf" when nothing had been saved (D-95). Both
 * told a user something false. A status document is the same hazard with a wider
 * blast radius, so every number here is read from something: git, the deviations
 * log, the backlog, the built output, or the live origin.
 *
 * Nothing in here is authored. If a fact cannot be measured it is marked unknown
 * rather than guessed, because "unknown" is useful and a confident wrong number
 * is not.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

const WRITE = process.argv.includes('--write');
const OFFLINE = process.argv.includes('--offline');
const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

const sh = (cmd, fallback = '') => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
};

/* ── what the repository says ───────────────────────────────────────────── */

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const branch = sh('git rev-parse --abbrev-ref HEAD', 'unknown');
const head = sh('git log -1 --format=%h %s'.replace('%h %s', '%h'), 'unknown');
const headSubject = sh('git log -1 --format=%s', '');
const headDate = sh('git log -1 --format=%cs', '');
// rev-list --count, not a pipe: execSync runs through cmd.exe on Windows where
// `2>/dev/null | wc -l` is not valid, and the failure showed as "?".
const unpushed = sh('git rev-list --count @{u}..HEAD', '?');
const dirty = sh('git status --porcelain', '').split('\n').filter((l) => l.trim() !== '').length;
const remote = sh('git remote get-url origin', '(none)');

/** Commit subjects since the last N, grouped by the area they touched. */
const recent = sh('git log -12 --format=%h%x09%cs%x09%s', '')
  .split('\n')
  .filter((l) => l.includes('\t'))
  .map((l) => {
    const [hash, date, ...rest] = l.split('\t');
    return { hash, date, subject: rest.join('\t') };
  });

/* ── what the deviations log says ───────────────────────────────────────── */

const devPath = path.join(ROOT, 'docs', '12-deviations.md');
let deviations = { count: 0, latest: [], outstanding: [] };
if (existsSync(devPath)) {
  const text = readFileSync(devPath, 'utf8');
  /*
   * The severity marker between `##` and the id is part of the convention —
   * `## 🔴 D-01 —` — and ten entries written later omitted it. A regex anchored
   * on `## D-` matched only those ten and reported 10 deviations against a file
   * holding 95, which is exactly the confident wrong number this script exists
   * to avoid. Tolerate any prefix, and any dash.
   */
  const headings = [...text.matchAll(/^#{2,3}\s*(?:\S+\s+)?(D-\d+)\s*[—–-]\s*(.+)$/gm)].map((m) => ({
    id: m[1],
    title: m[2].trim(),
  }));
  deviations.count = headings.length;
  deviations.latest = headings.slice(-5).reverse();
  // The outstanding table lives after a known heading; take its 🟠/🟡 rows only,
  // because ✅ rows are struck-through history.
  const tail = text.split('## Outstanding work')[1] ?? '';
  // The `u` flag is required: these markers are surrogate pairs, and without it
  // a character class splits them into halves that match neither.
  deviations.outstanding = [...tail.matchAll(/^\|\s*([🟠🟡🔴])\s*\|\s*(.+?)\s*\|/gmu)]
    .map((m) => ({ mark: m[1], text: m[2].replace(/\*\*/g, '').slice(0, 120) }))
    .slice(0, 8);
}

/* ── what the backlog says ──────────────────────────────────────────────── */

const site = process.env.CLAUDE_BACKLOG_SITE ?? path.basename(ROOT);
const statePath = path.join(os.homedir(), '.claude', 'backlog', site, 'state.json');
let backlog = null;
if (existsSync(statePath)) {
  const s = JSON.parse(readFileSync(statePath, 'utf8'));
  const by = (st) => s.items.filter((i) => i.status === st);
  backlog = {
    site: s.site,
    done: by('done').length,
    pending: by('pending'),
    blocked: by('blocked'),
  };
}

/* ── what the build says ────────────────────────────────────────────────── */

let build = { routes: null, builtAt: null, budgets: null };
if (existsSync(path.join(DIST, 'sitemap.xml'))) {
  const sm = readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  build.routes = [...sm.matchAll(/<loc>/g)].length;
  build.builtAt = statSync(path.join(DIST, 'sitemap.xml')).mtime.toISOString().slice(0, 16).replace('T', ' ');
}
// Budgets are re-read rather than remembered: the numbers in a doc must come
// from the checker, not from whatever was true when someone last looked.
const budgetOut = sh('node scripts/check-budgets.mjs 2>&1', '');
const jsBudget = /Baseline JS\s+max\s+([\d.]+ KB gz)\s*\/\s*([\d.]+ KB)/.exec(budgetOut);
const htmlBudget = /HTML per route\s+max\s+([\d.]+ KB gz)\s*\/\s*([\d.]+ KB)/.exec(budgetOut);

/* ── what production says ───────────────────────────────────────────────── */

let live = { origin: null, ok: null, total: null, headers: null, error: null };
if (!OFFLINE && build.routes !== null) {
  const origin = process.env.DEPLOY_VERIFY_ORIGIN ?? 'https://keptpix.com';
  live.origin = origin;
  try {
    const sm = readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
    const routes = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
      m[1].replace(/^https?:\/\/[^/]+/, ''),
    );
    let ok = 0;
    for (const r of routes) {
      const res = await fetch(origin + (r === '' ? '/' : r), { redirect: 'manual' }).catch(() => null);
      if (res?.status === 200) ok += 1;
    }
    live.ok = ok;
    live.total = routes.length;
    const probe = await fetch(origin + (routes[1] ?? '/'), { redirect: 'manual' }).catch(() => null);
    if (probe !== null) {
      const want = [
        'content-security-policy',
        'strict-transport-security',
        'permissions-policy',
        'x-frame-options',
        'x-content-type-options',
        'referrer-policy',
      ];
      live.headers = `${want.filter((h) => probe.headers.has(h)).length}/${want.length}`;
    }
  } catch (e) {
    live.error = String(e).slice(0, 80);
  }
}

/* ── render ─────────────────────────────────────────────────────────────── */

const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
const L = [];
const add = (s = '') => L.push(s);

add(`# Status — ${pkg.name}`);
add('');
add(`Generated ${now} UTC by \`scripts/status.mjs\`. **Do not edit by hand** — every`);
add('figure below is read from git, the deviations log, the backlog, the built');
add('output or the live origin, and hand edits are overwritten on the next run.');
add('');

add('## Live');
add('');
if (live.origin === null) {
  add('Not checked (`--offline`, or no build present).');
} else if (live.error !== null) {
  add(`Could not reach \`${live.origin}\`: ${live.error}`);
} else {
  add(`| | |`);
  add(`|---|---|`);
  add(`| Origin | ${live.origin} |`);
  add(`| Routes returning 200 | ${live.ok}/${live.total} |`);
  add(`| Security headers | ${live.headers ?? 'unknown'} |`);
  if (live.ok !== live.total) {
    add('');
    add(`**${live.total - live.ok} route(s) are not returning 200.** That is a live defect.`);
  }
}
add('');

add('## Build');
add('');
add(`| | |`);
add(`|---|---|`);
add(`| Routes in sitemap | ${build.routes ?? 'no build present'} |`);
add(`| Last built | ${build.builtAt ?? 'unknown'} |`);
add(`| Baseline JS | ${jsBudget ? `${jsBudget[1]} of ${jsBudget[2]}` : 'unknown'} |`);
add(`| HTML per route | ${htmlBudget ? `${htmlBudget[1]} of ${htmlBudget[2]}` : 'unknown'} |`);
add('');

add('## Repository');
add('');
add(`| | |`);
add(`|---|---|`);
add(`| Remote | ${remote} |`);
add(`| Branch | ${branch} |`);
add(`| HEAD | \`${head}\` ${headSubject} (${headDate}) |`);
add(`| Uncommitted files | ${dirty} |`);
add(`| Unpushed commits | ${unpushed} |`);
add('');

add('## Recent changes');
add('');
for (const c of recent) add(`- \`${c.hash}\` ${c.date} — ${c.subject}`);
add('');

add('## Known issues and deviations');
add('');
add(`\`docs/12-deviations.md\` holds **${deviations.count}** entries. Most are defects found`);
add('here and written down rather than quietly fixed; it is the most useful file in');
add('the repository for anyone about to repeat one.');
add('');
if (deviations.latest.length > 0) {
  add('Most recent:');
  add('');
  for (const d of deviations.latest) add(`- **${d.id}** — ${d.title}`);
  add('');
}
if (deviations.outstanding.length > 0) {
  add('Outstanding, from that log:');
  add('');
  for (const o of deviations.outstanding) add(`- ${o.mark} ${o.text}`);
  add('');
}

add('## Work queue');
add('');
if (backlog === null) {
  add(`No backlog for site \`${site}\`. Create one with \`backlog init\`.`);
} else {
  add(`Site \`${backlog.site}\` — ${backlog.done} done, ${backlog.pending.length} pending, ${backlog.blocked.length} blocked.`);
  add('');
  if (backlog.blocked.length > 0) {
    add('**Waiting on a human:**');
    add('');
    for (const b of backlog.blocked) add(`- #${b.id} ${b.title} — _${b.note ?? 'no reason given'}_`);
    add('');
  }
  if (backlog.pending.length > 0) {
    add('Queued:');
    add('');
    for (const p of backlog.pending) add(`- #${p.id} ${p.title}`);
    add('');
  }
}

const out = L.join('\n') + '\n';

if (WRITE) {
  const dest = path.join(ROOT, 'docs', 'STATUS.md');
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  process.stdout.write(`wrote ${path.relative(ROOT, dest)} (${out.length} bytes)\n`);
} else {
  process.stdout.write(out);
}
