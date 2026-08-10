#!/usr/bin/env node
/**
 * scripts/deploy.mjs — build, ship, then PROVE it shipped.
 *
 *   node scripts/deploy.mjs                 # verify -> deploy -> check production
 *   node scripts/deploy.mjs --skip-verify   # only when verify just ran
 *   node scripts/deploy.mjs --dry-run       # everything except the upload
 *
 * WHY IT EXISTS. Deployment was the one step in the loop that still needed a
 * person: build here, upload `dist/` by hand, then eyeball production. So an
 * unattended session could finish work but never ship it, and "done" meant
 * "committed", not "live".
 *
 * WHY IT VERIFIES AFTERWARDS. Every deploy this project has done needed a check
 * afterwards, and those checks kept finding things — a route serving a different
 * build, headers the live copy never had, a page byte-identical to the wrong
 * dist. `wrangler` exiting 0 means the upload succeeded, which is not the same
 * as the site being right. This asserts, against the live origin:
 *
 *   1. every route in the sitemap returns 200
 *   2. the security headers are actually served
 *   3. a sample of pages is BYTE-IDENTICAL to the local build
 *
 * (3) is the strong one. It is the difference between "a page loaded" and "the
 * bytes I built are the bytes being served".
 *
 * CREDENTIALS COME FROM THE ENVIRONMENT, never a file in the repo:
 *   CLOUDFLARE_API_TOKEN   scope it to Account -> Cloudflare Pages -> Edit ONLY
 *   CLOUDFLARE_ACCOUNT_ID
 *   CF_PAGES_PROJECT       optional, defaults below
 *
 * A token with broader scope can edit DNS and read billing. Deploying needs
 * neither, and a deploy script is exactly the thing that ends up in a log.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
/*
 * "noupload", not "keptpix". The repo, the domain and the product are all
 * KeptPix; the Pages project kept the original working name. `check:token`
 * caught the mismatch before a deploy did — with the wrong name, `wrangler pages
 * deploy` does not fail, it CREATES a new project, publishes to a different
 * *.pages.dev, and leaves keptpix.com serving the old build. A silent success
 * pointing at nothing.
 */
const PROJECT = process.env.CF_PAGES_PROJECT ?? 'noupload';
const SKIP_VERIFY = process.argv.includes('--skip-verify');
const DRY_RUN = process.argv.includes('--dry-run');

const say = (s) => process.stdout.write(s + '\n');
function die(msg) {
  process.stderr.write('\ndeploy: ' + msg + '\n');
  process.exit(1);
}

function run(cmd, { env = {}, timeout = 900_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      shell: true,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const cap = (d) => {
      out += d.toString();
      if (out.length > 200_000) out = out.slice(-200_000);
    };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const t = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out });
    });
  });
}

/* ── 1. Gate ───────────────────────────────────────────────────────────── */

if (!SKIP_VERIFY) {
  say('\nverifying before deploy...');
  const v = spawnSync(process.execPath, ['scripts/verify.mjs'], { stdio: 'inherit' });
  // Read verify's OWN exit code. Piping it through anything else means the
  // pipe's status is what gets tested, which shipped a failing commit once.
  if (v.status !== 0) die('verify failed — nothing was deployed');
} else {
  say('\n(--skip-verify: assuming verify just passed)');
}

if (!existsSync(DIST)) die('no dist/ — run the build');

/* ── 2. Credentials ────────────────────────────────────────────────────── */

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (DRY_RUN) {
  say('(--dry-run: skipping the upload)');
} else if (token === undefined || token === '' || account === undefined || account === '') {
  die(
    'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in the environment.\n' +
      '  Put them in .env (gitignored). Scope the token to Cloudflare Pages -> Edit only.',
  );
}

/* ── 3. Deploy ─────────────────────────────────────────────────────────── */

let deployedUrl = null;
if (!DRY_RUN) {
  /*
   * PRE-FLIGHT: the project must already exist.
   *
   * `wrangler pages deploy` silently creates a missing project rather than
   * erroring, so a typo in the name is not a failure — it is a successful deploy
   * of the right bytes to the wrong place, which is much harder to notice. Ask
   * the API first and refuse with the real names.
   */
  const list = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects`,
    { headers: { Authorization: 'Bearer ' + token } },
  )
    .then((r) => r.json())
    .catch(() => null);

  if (list?.success === true && Array.isArray(list.result)) {
    const names = list.result.map((p) => p?.name).filter((n) => typeof n === 'string');
    if (!names.includes(PROJECT)) {
      die(
        `no Pages project named "${PROJECT}".\n` +
          `  This account has: ${names.join(', ') || '(none)'}\n` +
          '  Set CF_PAGES_PROJECT to one of those. Deploying with a wrong name would\n' +
          '  CREATE a new project and publish where nobody is looking.',
      );
    }
  } else {
    say('  (could not list projects to pre-check the name — continuing)');
  }

  say(`deploying dist/ to Pages project "${PROJECT}"...`);
  // npx, NOT a dependency: wrangler is tens of megabytes and docs/07 §3 keeps
  // the toolchain lean. Nothing here reaches the shipped bundle either way.
  const d = await run(
    `npx --yes wrangler@latest pages deploy dist --project-name=${PROJECT} --commit-dirty=true`,
    { env: { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } },
  );
  // Never print the captured output verbatim — wrangler echoes environment
  // context and this runs unattended into logs.
  const urlMatch = /https:\/\/[a-z0-9.-]+\.pages\.dev/i.exec(d.out);
  deployedUrl = urlMatch === null ? null : urlMatch[0];
  if (d.code !== 0) {
    const reason = /(?:Error|error):?\s*([^\n]{0,160})/.exec(d.out);
    die('wrangler failed' + (reason ? ': ' + reason[1] : '') + ' (exit ' + d.code + ')');
  }
  say('  uploaded' + (deployedUrl ? ' — ' + deployedUrl : ''));
}

/* ── 4. Prove it ───────────────────────────────────────────────────────── */

const origin = process.env.DEPLOY_VERIFY_ORIGIN ?? 'https://keptpix.com';
say(`\nchecking ${origin} against the local build...`);

/** `build.format: 'file'` means /a/b lives at dist/a/b.html. */
function localFileFor(pathname) {
  const clean = pathname.replace(/\/$/, '');
  for (const candidate of [
    clean === '' ? 'index.html' : clean + '.html',
    path.join(clean, 'index.html'),
  ]) {
    const f = path.join(DIST, candidate);
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

async function get(url) {
  const res = await fetch(url, { redirect: 'manual' });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

const failures = [];

// Routes come from the sitemap the build just produced, so this cannot check a
// stale list of pages.
const sitemapPath = path.join(DIST, 'sitemap.xml');
if (!existsSync(sitemapPath)) die('dist/sitemap.xml missing — cannot enumerate routes');
const routes = [...readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
  m[1].replace(/^https?:\/\/[^/]+/, ''),
);
say(`  ${routes.length} routes in the sitemap`);

let ok200 = 0;
for (const route of routes) {
  const target = origin + (route === '' ? '/' : route);
  try {
    const r = await get(target);
    if (r.status === 200) ok200 += 1;
    else failures.push(`${route} returned ${r.status}`);
  } catch (e) {
    failures.push(`${route} threw ${String(e).slice(0, 60)}`);
  }
}
say(`  ${ok200}/${routes.length} returned 200`);

// Headers, on a real route rather than the origin root.
const probe = routes.find((r) => r !== '' && r !== '/') ?? '/';
const headerCheck = await get(origin + probe);
for (const name of [
  'content-security-policy',
  'strict-transport-security',
  'permissions-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
]) {
  if (!headerCheck.headers.has(name)) failures.push(`header missing in production: ${name}`);
}
const csp = headerCheck.headers.get('content-security-policy') ?? '';
if (!csp.includes("connect-src 'self'")) {
  failures.push('CSP no longer pins connect-src to self — the privacy claim depends on it');
}
say(`  security headers present: ${6 - failures.filter((f) => f.startsWith('header missing')).length}/6`);

/**
 * The strong check. A 200 proves a page loaded; byte-equality proves the bytes
 * being served are the bytes just built. Sampled rather than exhaustive so a
 * deploy does not take an hour, and the homepage is always included.
 */
const sample = [
  '/',
  // Deliberately include an island-bearing route. The content pages are mostly
  // static text and would still match after a JavaScript-only change.
  ...['/pdf/from-images', '/compress/jpg-to-100kb'].filter((r) => routes.includes(r)),
  ...routes.filter((r) => r !== '' && r !== '/').slice(0, 3),
];

/**
 * DIGEST, NOT LENGTH.
 *
 * The first version of this compared byte COUNTS and reported 5/5 identical
 * against a production build that was demonstrably older — because Astro's
 * content hashes are FIXED WIDTH. `ManifestToolShell.CdtcptOf.js` and
 * `ManifestToolShell.BSX1pOdI.js` are the same length, so a completely different
 * bundle yields an HTML file of identical size. The check could not fail, which
 * makes it worse than no check: it would have signed off every stale deploy.
 */
const digest = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

let identical = 0;
let compared = 0;
for (const route of new Set(sample)) {
  const local = localFileFor(route);
  if (local === null) continue;
  compared += 1;
  const localDigest = digest(readFileSync(local));
  try {
    const live = await get(origin + (route === '' ? '/' : route));
    if (digest(Buffer.from(live.body, 'utf8')) === localDigest) identical += 1;
    else failures.push(`${route} is not the build in dist/ (content differs)`);
  } catch (e) {
    failures.push(`${route} could not be fetched: ${String(e).slice(0, 60)}`);
  }
}
say(`  ${identical}/${compared} sampled pages identical to dist/ (sha256)`);

if (failures.length > 0) {
  say('\nDEPLOY VERIFICATION FAILED');
  for (const f of failures.slice(0, 20)) say('  - ' + f);
  say(
    '\nThe upload may have succeeded — Cloudflare can serve a previous build for a\n' +
      'short while. Re-run with --skip-verify in a minute before assuming a rollback.',
  );
  process.exit(1);
}

say(
  `\ndeployed and verified: ${routes.length} routes 200, headers intact, ` +
    `${identical}/${sample.length} byte-identical\n`,
);
