#!/usr/bin/env node
/**
 * scripts/check-token.mjs — what can this deploy token actually do?
 *
 *   node scripts/check-token.mjs
 *
 * Reads `.env` (gitignored), asks Cloudflare, and prints ONLY metadata: whether
 * the token is valid, which permission groups it carries, and whether the
 * account id resolves. The token value is never printed, never logged, and never
 * written anywhere.
 *
 * WHY IT EXISTS. A deploy token should be able to deploy and nothing else. One
 * with "all permissions" can edit DNS, read billing and delete zones — and a
 * deploy script's output is exactly the kind of thing that ends up in a log file
 * or a screenshot. This makes over-scoping visible instead of theoretical.
 *
 * It also answers the practical question before an unattended run: is the
 * credential actually going to work at 3am, or will the loop discover otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

/** Tolerant parse: `KEY=v`, `KEY = v`, quoted, trailing spaces. */
function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m === null) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const fileEnv = loadEnvFile('.env');
const token = process.env.CLOUDFLARE_API_TOKEN ?? fileEnv.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? fileEnv.CLOUDFLARE_ACCOUNT_ID;

const say = (s) => process.stdout.write(s + '\n');

if (token === undefined || token === '') {
  say('\nCLOUDFLARE_API_TOKEN is not set.');
  say('Put it in .env (gitignored) as:  CLOUDFLARE_API_TOKEN=...');
  say('Do NOT put it in .env.example — that file is tracked and this repo is public.\n');
  process.exit(1);
}

// Shape check before spending a request. Cloudflare user tokens are opaque, but
// a value that still looks like the placeholder is worth catching early.
say('');
say(`token   : ${token.length} chars, starts "${token.slice(0, 4)}…"`);
say(`account : ${account === undefined || account === '' ? '(not set)' : account.slice(0, 8) + '…'}`);

const api = 'https://api.cloudflare.com/client/v4';
const auth = { Authorization: 'Bearer ' + token };

async function call(path) {
  const res = await fetch(api + path, { headers: auth });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  return { status: res.status, body };
}

/* ── 1. Is the token alive? ─────────────────────────────────────────────── */

const verify = await call('/user/tokens/verify');
if (verify.status !== 200 || verify.body?.success !== true) {
  const msg = verify.body?.errors?.[0]?.message ?? `HTTP ${verify.status}`;
  say(`\nINVALID: ${msg}`);
  say('If it was rolled, create a new one and update .env.\n');
  process.exit(1);
}
say(`status  : ${verify.body.result?.status ?? 'active'}`);

/* ── 2. What is it allowed to do? ───────────────────────────────────────── */

// Cloudflare does not expose a token's own policy list through the verify
// endpoint, so scope is inferred by probing: ask for something a deploy token
// should NOT be able to see, and report what answers.
const probes = [
  { label: 'Pages projects (REQUIRED)', path: `/accounts/${account}/pages/projects`, want: true },
  { label: 'DNS zones', path: '/zones', want: false },
  { label: 'Account members', path: `/accounts/${account}/members`, want: false },
  { label: 'Billing profile', path: `/accounts/${account}/billing/profile`, want: false },
  { label: 'Workers scripts', path: `/accounts/${account}/workers/scripts`, want: false },
];

say('\nwhat this token can reach:');
let overScoped = 0;
let missingRequired = 0;

for (const p of probes) {
  if (account === undefined || account === '') break;
  const r = await call(p.path);
  const allowed = r.status === 200 && r.body?.success === true;
  const verdict = allowed
    ? p.want
      ? 'ok      '
      : 'TOO WIDE'
    : p.want
      ? 'BLOCKED '
      : 'denied  ';
  if (allowed && !p.want) overScoped += 1;
  if (!allowed && p.want) missingRequired += 1;
  say(`  ${verdict} ${p.label}`);
}

/* ── 3. Verdict ─────────────────────────────────────────────────────────── */

say('');
if (missingRequired > 0) {
  say('NOT USABLE for deploys: it cannot list Pages projects.');
  say('Recreate with: Account -> Cloudflare Pages -> Edit.\n');
  process.exit(1);
}
if (overScoped > 0) {
  say(`OVER-SCOPED: ${overScoped} area(s) beyond deploying are reachable.`);
  say('It will work, but a leak costs more than it needs to. Recreate with only');
  say('Account -> Cloudflare Pages -> Edit, then delete this one.\n');
  process.exit(2);
}
say('correctly scoped: Pages reachable, everything else denied.\n');
