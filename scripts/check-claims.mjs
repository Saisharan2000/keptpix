#!/usr/bin/env node
/**
 * check-claims — the privacy copy and the privacy reality must agree.
 *
 * WHY THIS EXISTS
 *
 * Three times this project has shipped a sentence that used to be true:
 * jpg-to-1mb's FAQ, the /selftest footer claiming "no image dimensions" while
 * 400/300 sat on screen, and docs/14's "zero pages indexed" premise (docs/12
 * D-100). Each was written when it was correct and left alone while the thing
 * underneath it changed. Nothing in the toolchain reads prose: eslint doesn't,
 * the budget check counts bytes, and privacy.spec.ts asserts the network is quiet
 * without ever asking whether the page CLAIMS the network is quiet.
 *
 * The founder has chosen ad revenue (docs/12 D-111), which points straight at the
 * biggest instance of this failure mode — an ad script would falsify the footer on
 * every page the moment it loaded.
 *
 * WHAT THIS ENFORCES — four rules, against what is actually SERVED in dist/
 *
 *   1. STRUCTURAL   no foreign <script src>, <iframe src> or preconnect in any
 *                   served page. This is the one that catches a live ad tag.
 *   2. VENDOR       no ad-network or analytics vendor host anywhere in dist/,
 *                   unless that host is DECLARED below.
 *   3. DISCLOSURE   every declared third-party origin must still have its
 *                   CONDITIONAL disclosure on /privacy. Removing the disclosure
 *                   while keeping the loader is the quiet failure this catches.
 *   4. CSP          if the "no third-party scripts" claim is served, script-src
 *                   must be 'self'-only — so the claim is enforced by a header,
 *                   not merely asserted in prose.
 *
 * This does not block ads. It blocks shipping ads while still telling users there
 * are none. Whichever way the product goes, the copy goes with it in the same
 * commit, or the build fails.
 *
 * WHY IT READS dist/ AND NOT src/
 *
 * A claim in a component nobody renders is harmless; a claim in shipped HTML is
 * what users read. Grepping the wrong artefact is its own past mistake — a
 * 289-byte wrapper chunk instead of the 25 KB component it imports.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = 'dist';
const HEADERS = 'public/_headers';
const PRIVACY_PAGE = 'src/pages/privacy.astro';

/* Hosts that are us. Anything else serving executable content is third-party. */
const OWN_HOST = /(^|\.)keptpix\.com$|(^|\.)pages\.dev$|^localhost$/;

/**
 * Third-party origins this build is ALLOWED to contain a loader for, each with
 * the conditions that make it allowable. Cloudflare Web Analytics is here because
 * D-53 designed it as the one documented exception: inert unless a build sets
 * PUBLIC_CF_BEACON_TOKEN, never injected during a job, and — crucially — named on
 * /privacy by a conditional that turns on with the same flag.
 *
 * An entry here is not a free pass. Rule 3 checks the disclosure is still wired.
 */
const DECLARED = [
  {
    host: 'static.cloudflareinsights.com',
    why: 'Cloudflare Web Analytics, gated on PUBLIC_CF_BEACON_TOKEN (docs/12 D-53).',
    disclosedBy: 'analyticsOn',
  },
];

/**
 * Vendor hosts, written as HOSTS and not bare words. The bare word "doubleclick"
 * matched Preact's `ondoubleclick` → `ondblclick` property normalisation in
 * jsxRuntime, so the first version of this gate failed the build on the JSX
 * runtime. A dot-bearing host cannot collide with a DOM event name.
 */
const VENDOR_HOSTS = [
  // ad networks
  'googlesyndication.com', 'doubleclick.net', 'adservice.google.com',
  'adnxs.com', 'pubmatic.com', 'rubiconproject.com', 'criteo.com',
  'ezoic.net', 'mediavine.com', 'taboola.com', 'outbrain.com',
  // analytics / session recording
  'googletagmanager.com', 'google-analytics.com', 'plausible.io',
  'usefathom.com', 'hotjar.com', 'clarity.ms', 'mixpanel.com',
  'amplitude.com', 'cdn.segment.com', 'static.cloudflareinsights.com',
];

/** The `adsbygoogle` global is AdSense's tell even with no host string present. */
const VENDOR_GLOBALS = ['adsbygoogle'];

/**
 * The claims, and what each depends on. Matched case-insensitively against served
 * HTML. When a claim is deliberately retired, delete its entry here too.
 */
const CLAIMS = [
  { text: 'no tracking', depends: 'no ad or analytics vendor may actually load' },
  { text: 'no advertising', depends: 'no ad network may load' },
  { text: 'no third-party scripts', depends: "script-src must stay 'self'" },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function isForeign(url) {
  if (!url) return false;
  const trimmed = url.trim();
  // Relative, root-relative, data:, blob: — first-party by construction.
  if (!/^(https?:)?\/\//i.test(trimmed)) return false;
  try {
    return !OWN_HOST.test(new URL(trimmed.replace(/^\/\//, 'https://')).hostname);
  } catch {
    return false;
  }
}

if (!existsSync(DIST)) {
  process.stdout.write(`${DIST}/ not found — run npm run build first.\n`);
  process.exit(1);
}

const files = walk(DIST);
const html = files.filter((f) => extname(f) === '.html');
const code = files.filter((f) => ['.js', '.mjs', '.html'].includes(extname(f)));
const declaredHosts = new Set(DECLARED.map((d) => d.host));

const fails = [];
const notes = [];

/* ── Rule 1: structural — is anything foreign actually being LOADED? ───────── */
const loaded = [];
for (const file of html) {
  const src = readFileSync(file, 'utf8');
  for (const [what, re] of [
    ['script src', /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi],
    ['iframe src', /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi],
    ['preconnect', /<link\b[^>]*\brel\s*=\s*["'](?:preconnect|dns-prefetch|preload|modulepreload)["'][^>]*\bhref\s*=\s*["']([^"']+)["']/gi],
  ]) {
    for (const m of src.matchAll(re)) {
      if (isForeign(m[1])) loaded.push(`${file}: ${what}="${m[1]}"`);
    }
  }
}
if (loaded.length) {
  fails.push({
    rule: 'structural',
    detail: 'foreign content is LOADED by served HTML',
    lines: [...new Set(loaded)],
  });
} else {
  notes.push(`no foreign script, iframe or preconnect in ${html.length} served page(s)`);
}

/* ── Rule 2: vendor strings, excluding declared origins ───────────────────── */
const undeclared = new Map();
for (const file of code) {
  const src = readFileSync(file, 'utf8');
  for (const host of VENDOR_HOSTS) {
    if (src.includes(host) && !declaredHosts.has(host)) {
      if (!undeclared.has(host)) undeclared.set(host, new Set());
      undeclared.get(host).add(file);
    }
  }
  for (const g of VENDOR_GLOBALS) {
    if (src.includes(g)) {
      if (!undeclared.has(g)) undeclared.set(g, new Set());
      undeclared.get(g).add(file);
    }
  }
}
if (undeclared.size) {
  fails.push({
    rule: 'vendor',
    detail: 'an undeclared ad/analytics vendor is in the bundle',
    lines: [...undeclared].map(([h, fs]) => `${h} in ${[...fs].join(', ')}`),
  });
} else {
  notes.push(`no undeclared vendor host in ${code.length} built file(s)`);
}

/* ── Rule 3: every declared origin keeps its conditional disclosure ───────── */
const privacySrc = existsSync(PRIVACY_PAGE) ? readFileSync(PRIVACY_PAGE, 'utf8') : '';
for (const d of DECLARED) {
  const inBundle = code.some((f) => readFileSync(f, 'utf8').includes(d.host));
  if (!inBundle) {
    notes.push(`${d.host}: no loader in the bundle at all`);
    continue;
  }
  const named = privacySrc.includes(d.host);
  const conditional = privacySrc.includes(d.disclosedBy);
  const servedLive = loaded.some((l) => l.includes(d.host));
  if (!named || !conditional) {
    fails.push({
      rule: 'disclosure',
      detail: `${d.host} has a loader in the bundle but ${!named ? 'is not named on /privacy' : `its disclosure is no longer gated on \`${d.disclosedBy}\``}`,
      lines: [d.why],
    });
  } else {
    notes.push(
      `${d.host}: loader present, ${servedLive ? 'LIVE' : 'dormant'}, ` +
        `named on /privacy behind \`${d.disclosedBy}\``,
    );
  }
}

/* ── Rule 4: the CSP has to back the claims, not merely coexist with them ─── */
const present = CLAIMS.map((c) => ({
  ...c,
  pages: html.filter((f) => readFileSync(f, 'utf8').toLowerCase().includes(c.text)).length,
})).filter((c) => c.pages > 0);

if (present.some((c) => c.text === 'no third-party scripts') && existsSync(HEADERS)) {
  const csp = readFileSync(HEADERS, 'utf8').match(/^\s*Content-Security-Policy:\s*(.+)$/mi)?.[1] ?? '';
  const scriptSrc = csp.match(/script-src([^;]*)/i)?.[1] ?? '';
  const bad = [];
  if (!csp) bad.push('no Content-Security-Policy in public/_headers');
  else if (!/'self'/.test(scriptSrc)) bad.push("script-src does not include 'self'");
  for (const token of scriptSrc.trim().split(/\s+/).filter(Boolean)) {
    if (/^https?:/i.test(token) || token.startsWith('*') || (token.includes('.') && isForeign('https://' + token))) {
      bad.push(`script-src allows a foreign origin: ${token}`);
    }
  }
  if (bad.length) fails.push({ rule: 'csp', detail: 'the CSP no longer enforces the claim', lines: bad });
  else notes.push("CSP script-src is 'self'-only, so the claim is enforced and not just asserted");
}

/* ── Report ───────────────────────────────────────────────────────────────── */
process.stdout.write(`\ncheck-claims  ${html.length} page(s) served\n\n`);
for (const c of present) {
  process.stdout.write(`  claim  "${c.text}" on ${c.pages} page(s) — requires: ${c.depends}\n`);
}
if (present.length) process.stdout.write('\n');
for (const n of notes) process.stdout.write(`  ok     ${n}\n`);

for (const f of fails) {
  process.stdout.write(`\n  FAIL   [${f.rule}] ${f.detail}\n`);
  for (const l of f.lines) process.stdout.write(`         ${l}\n`);
}

if (fails.length) {
  process.stdout.write(
    '\n' +
      'The copy and the code disagree. Ads are a product decision, not a bug\n' +
      '(docs/12 D-111) — this gate only refuses to run them behind copy that says\n' +
      'there are none. If a vendor is being added deliberately, update in the SAME\n' +
      'commit:\n' +
      '  src/components/astro/Footer.astro   "no tracking" — unconditional, every page\n' +
      '  src/pages/privacy.astro             name it behind a flag, like D-53 did\n' +
      '  tests/e2e/privacy.spec.ts           4 of 5 tests assume total silence\n' +
      '  scripts/check-claims.mjs            add it to DECLARED with its conditions\n' +
      'Keep the claim that stays true either way: files never leave the device.\n',
  );
  process.exit(1);
}

process.stdout.write(
  `\nClean: ${present.length} claim(s) verified against what is actually served.\n`,
);
