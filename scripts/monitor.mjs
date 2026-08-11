#!/usr/bin/env node
/**
 * scripts/monitor.mjs — watch production from outside, and queue what is broken.
 *
 *   node scripts/monitor.mjs                 # check, report, exit non-zero on problems
 *   node scripts/monitor.mjs --queue         # also file findings into the backlog
 *   node scripts/monitor.mjs --json
 *
 * WHY NOT SENTRY. The obvious answer to "how do we know when production breaks"
 * is an error reporter, and this product cannot have one. docs/06 §5 makes two
 * release-blocking assertions: **zero requests with a non-empty body, ever**, and
 * every request's origin in an allowlist of `self` only. A browser SDK POSTs
 * error payloads to a third party, which violates both, and CLAUDE.md forbids
 * "any analytics that transmits payloads". The privacy claim is the product; an
 * error reporter would trade the thing being sold for information about it.
 *
 * SO THIS WATCHES FROM OUTSIDE, like a user would. No client code, nothing
 * transmitted, nothing to trust. It cannot see a JavaScript exception in
 * somebody's browser — that is a real limit, and `/selftest` exists so a user can
 * run the diagnostic themselves on their own device — but it does catch the class
 * of failure that has actually happened here:
 *
 *   - Cloudflare injected a tracking beacon into every response (D-66). Nothing
 *     in the repo changed; the host added it on the way out.
 *   - A deploy that succeeded and changed nothing (D-97).
 *   - Security headers that production never served (D-88).
 *
 * Every finding carries the evidence that produced it, because a monitor that
 * says "something is wrong" without saying how it knows just moves the work.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { env } from './load-env.mjs';

const QUEUE = process.argv.includes('--queue');
const JSON_OUT = process.argv.includes('--json');
const ORIGIN = env('DEPLOY_VERIFY_ORIGIN') ?? 'https://keptpix.com';
const SITE = env('CLAUDE_BACKLOG_SITE') ?? 'keptpix';
const DIST = path.join(process.cwd(), 'dist');

const say = (s) => {
  if (!JSON_OUT) process.stdout.write(s + '\n');
};

/** @type {{severity:'critical'|'warning', title:string, evidence:string}[]} */
const findings = [];
const checked = [];

async function get(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    return { ok: true, status: res.status, headers: res.headers, body: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, error: String(e).slice(0, 100) };
  }
}

/* ── 1. Is it up, and are all the routes there? ─────────────────────────── */

/**
 * Routes come from the LIVE sitemap, not the local build.
 *
 * A monitor that reads the local sitemap only ever checks the routes this
 * checkout knows about, so a page deleted by a bad deploy would go unnoticed —
 * it is absent from both, and absence matches. The live sitemap is what the world
 * is being told exists, so that is the promise worth auditing.
 */
const sitemap = await get(ORIGIN + '/sitemap.xml');
let routes = [];
if (!sitemap.ok || sitemap.status !== 200) {
  findings.push({
    severity: 'critical',
    title: 'sitemap.xml is unreachable',
    evidence: `GET ${ORIGIN}/sitemap.xml -> ${sitemap.ok ? sitemap.status : sitemap.error}`,
  });
} else {
  routes = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].replace(/^https?:\/\/[^/]+/, ''),
  );
  checked.push(`${routes.length} routes from the live sitemap`);
}

const broken = [];
for (const r of routes) {
  const res = await get(ORIGIN + (r === '' ? '/' : r));
  if (!res.ok || res.status !== 200) {
    broken.push(`${r || '/'} -> ${res.ok ? res.status : res.error}`);
  }
}
if (broken.length > 0) {
  findings.push({
    severity: 'critical',
    title: `${broken.length} route(s) in the sitemap are not returning 200`,
    evidence: broken.slice(0, 8).join('; '),
  });
} else if (routes.length > 0) {
  checked.push(`all ${routes.length} returned 200`);
}

/* ── 2. Is the privacy posture intact? ──────────────────────────────────── */

const probe = routes.find((r) => r !== '' && r !== '/') ?? '/';
const page = await get(ORIGIN + probe);

if (page.ok) {
  const required = {
    'content-security-policy': null,
    'strict-transport-security': null,
    'permissions-policy': null,
    'x-frame-options': null,
    'x-content-type-options': null,
    'referrer-policy': null,
  };
  const missing = Object.keys(required).filter((h) => !page.headers.has(h));
  if (missing.length > 0) {
    findings.push({
      severity: 'critical',
      title: `${missing.length} security header(s) missing from production`,
      evidence: `${probe} is missing: ${missing.join(', ')}`,
    });
  } else {
    checked.push('all 6 security headers present');
  }

  const csp = page.headers.get('content-security-policy') ?? '';
  // The two directives the privacy claim rests on. `connect-src 'self'` is what
  // makes a body-carrying request impossible; a widened one is not a style
  // regression, it is the claim becoming false.
  for (const [directive, why] of [
    ["connect-src 'self'", 'nothing could be uploaded only because no origin is reachable'],
    ["default-src 'self'", 'the baseline every other directive inherits'],
  ]) {
    if (!csp.includes(directive)) {
      findings.push({
        severity: 'critical',
        title: `CSP no longer contains ${directive}`,
        evidence: `${why}. Served CSP: ${csp.slice(0, 180)}`,
      });
    }
  }
  if (csp.includes("connect-src 'self'")) checked.push("CSP still pins connect-src to 'self'");

  /*
   * A third-party script in the HTML. This is not hypothetical: Cloudflare
   * injected its RUM beacon into every response at the edge, invisible to any
   * grep of the repository, and only the CSP refused it (D-66). If the host does
   * that again, the tag appears here first.
   */
  const foreign = [...page.body.matchAll(/<script[^>]+src=["'](https?:)?\/\/([^"'/]+)/gi)]
    .map((m) => m[2])
    .filter((host) => !host.endsWith('keptpix.com'));
  if (foreign.length > 0) {
    findings.push({
      severity: 'critical',
      title: 'a third-party script tag is being served',
      evidence: `${probe} references: ${[...new Set(foreign)].join(', ')}`,
    });
  } else {
    checked.push('no third-party script tags in the HTML');
  }
}

/* ── 3. Is production the build we think it is? ──────────────────────────── */

if (existsSync(path.join(DIST, 'sitemap.xml'))) {
  const localRoutes = [
    ...readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g),
  ].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''));
  const onlyLive = routes.filter((r) => !localRoutes.includes(r));
  const onlyLocal = localRoutes.filter((r) => !routes.includes(r));
  if (onlyLocal.length > 0) {
    findings.push({
      severity: 'warning',
      title: `${onlyLocal.length} route(s) exist locally but not in production`,
      evidence: `not deployed yet, or dropped by a deploy: ${onlyLocal.slice(0, 6).join(', ')}`,
    });
  }
  if (onlyLive.length > 0) {
    findings.push({
      severity: 'warning',
      title: `${onlyLive.length} route(s) live but absent from this checkout`,
      evidence: `production is ahead, or these were removed here: ${onlyLive.slice(0, 6).join(', ')}`,
    });
  }
  if (onlyLive.length === 0 && onlyLocal.length === 0 && routes.length > 0) {
    checked.push('live route set matches this checkout');
  }
} else {
  checked.push('(no local dist — skipped the route-set comparison)');
}

/* ── report ─────────────────────────────────────────────────────────────── */

const critical = findings.filter((f) => f.severity === 'critical');

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify({ origin: ORIGIN, ok: critical.length === 0, checked, findings }, null, 2) + '\n',
  );
} else {
  say(`\nmonitor ${ORIGIN}\n`);
  for (const c of checked) say(`  ok    ${c}`);
  for (const f of findings) {
    say(`\n  ${f.severity === 'critical' ? 'CRITICAL' : 'warning '} ${f.title}`);
    say(`           ${f.evidence}`);
  }
  say(
    findings.length === 0
      ? '\nnothing wrong that can be seen from outside.\n'
      : `\n${critical.length} critical, ${findings.length - critical.length} warning\n`,
  );
}

/* ── queue, so a finding becomes work rather than a log line ─────────────── */

if (QUEUE && findings.length > 0) {
  const tool = path.join(os.homedir(), '.claude', 'backlog', 'backlog.mjs');
  if (!existsSync(tool)) {
    say('  (backlog tool not installed — nothing queued)');
  } else {
    for (const f of findings) {
      /*
       * `--unique` is what stops a persistent fault queueing itself every run.
       * This comment previously claimed `add` deduplicated by itself; it did not
       * — only `import` did — and the second run duly filed five duplicates.
       * The flag now exists and is passed; the behaviour is no longer assumed.
       */
      const title = `PRODUCTION: ${f.title}`;
      const res = spawnSync(
        process.execPath,
        [tool, 'add', SITE, title, '--unique', '--why', `${f.evidence} (found by monitor at ${new Date().toISOString().slice(0, 16)})`, ...(f.severity === 'critical' ? ['--first'] : [])],
        { encoding: 'utf8' },
      );
      say('  queued: ' + (res.stdout || res.stderr || '').trim() + ' — ' + title);
    }
  }
}

process.exitCode = critical.length === 0 ? 0 : 1;
