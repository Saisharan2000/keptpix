#!/usr/bin/env node
/**
 * scripts/check-token.mjs — what can this deploy token actually do?
 *
 *   npm run check:token
 *
 * Reads `.env` (gitignored), asks Cloudflare, and prints ONLY metadata: whether
 * the token works, what it can reach, and whether the account id resolves. The
 * token value is never printed, never logged, never written anywhere.
 *
 * WHY IT EXISTS. A deploy token should deploy and nothing else. One with "all
 * permissions" can edit DNS, read billing and delete zones — and a deploy
 * script's output is exactly what ends up in a log or a screenshot. This makes
 * over-scoping visible instead of theoretical, and answers the practical
 * question before an unattended run: will this credential work at 3am.
 *
 * TWO THINGS THIS GOT WRONG FIRST (docs/12 D-96):
 *
 * 1. It checked only `/user/tokens/verify`, which accepts USER tokens. An
 *    ACCOUNT-OWNED token — what you create when scoping to one account's Pages —
 *    returns a flat "Invalid API Token" there, so a perfectly good token was
 *    declared dead. Both endpoints are tried now, and neither is decisive: the
 *    authoritative test is whether it can reach Pages, because that is the thing
 *    we actually need it for.
 *
 * 2. It called `process.exit()` while fetch keep-alive sockets were open, which
 *    trips a libuv assertion on Windows:
 *      Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:76
 *    `process.exitCode` lets Node close its handles and leave on its own.
 */
import process from 'node:process';
import { env } from './load-env.mjs';

const say = (s) => process.stdout.write(s + '\n');
const API = 'https://api.cloudflare.com/client/v4';

async function main() {
  const token = env('CLOUDFLARE_API_TOKEN');
  const account = env('CLOUDFLARE_ACCOUNT_ID');

  if (token === undefined || token === '') {
    say('\nCLOUDFLARE_API_TOKEN is not set.');
    say('Put it in .env (gitignored):  CLOUDFLARE_API_TOKEN=...');
    say('NOT in .env.example — that file is tracked and this repo is public.\n');
    return 1;
  }

  const headers = { Authorization: 'Bearer ' + token };
  const call = async (path) => {
    try {
      const res = await fetch(API + path, { headers });
      let body = null;
      try {
        body = await res.json();
      } catch {
        /* an HTML error page */
      }
      return { status: res.status, body };
    } catch (e) {
      return { status: 0, body: null, network: String(e).slice(0, 80) };
    }
  };
  const errOf = (r) => r.body?.errors?.[0]?.message ?? r.network ?? `HTTP ${r.status}`;

  say('');
  say(`token   : ${token.length} chars, starts "${token.slice(0, 4)}…"`);
  say(`account : ${account === undefined || account === '' ? '(NOT SET)' : account.slice(0, 8) + '…'}`);

  /* ── 1. Which kind of token is it? Informative, not decisive. ─────────── */

  const hasAccount = account !== undefined && account !== '';
  let verified = null;
  for (const v of [
    { label: 'user token', path: '/user/tokens/verify' },
    ...(hasAccount ? [{ label: 'account-owned token', path: `/accounts/${account}/tokens/verify` }] : []),
  ]) {
    const r = await call(v.path);
    if (r.status === 200 && r.body?.success === true) {
      verified = `${v.label}, ${r.body.result?.status ?? 'active'}`;
      break;
    }
  }
  say(`verify  : ${verified ?? 'neither endpoint accepted it — judging on the Pages probe'}`);

  if (!hasAccount) {
    say('\nCLOUDFLARE_ACCOUNT_ID is missing, so nothing can be checked.');
    say('Cloudflare dashboard -> Workers & Pages -> the Account ID on the right.\n');
    return 1;
  }

  /* ── 2. What can it reach? ───────────────────────────────────────────── */

  const probes = [
    { label: 'Pages projects (REQUIRED)', path: `/accounts/${account}/pages/projects`, want: true },
    { label: 'DNS zones', path: '/zones', want: false },
    { label: 'Account members', path: `/accounts/${account}/members`, want: false },
    { label: 'Billing profile', path: `/accounts/${account}/billing/profile`, want: false },
    { label: 'Workers scripts', path: `/accounts/${account}/workers/scripts`, want: false },
  ];

  say('\nwhat this token can reach:');
  let overScoped = 0;
  let blockedReason = null;
  let projectNames = [];

  for (const p of probes) {
    const r = await call(p.path);
    const allowed = r.status === 200 && r.body?.success === true;
    if (allowed && p.want && Array.isArray(r.body.result)) {
      projectNames = r.body.result.map((x) => x?.name).filter((n) => typeof n === 'string');
    }
    if (allowed && !p.want) overScoped += 1;
    // Keep the REAL message: "BLOCKED" cannot distinguish a wrong account id
    // from a missing permission, and those need opposite fixes.
    if (!allowed && p.want) blockedReason = errOf(r);
    const verdict = allowed ? (p.want ? 'ok      ' : 'TOO WIDE') : p.want ? 'BLOCKED ' : 'denied  ';
    say(`  ${verdict} ${p.label}`);
  }

  /* ── 3. Verdict ──────────────────────────────────────────────────────── */

  say('');
  if (blockedReason !== null) {
    say(`NOT USABLE for deploys: ${blockedReason}`);
    if (/invalid|expired|malformed|9109|6003/i.test(blockedReason)) {
      say('');
      say('That is the token, not the permissions. Rolling a token CHANGES its');
      say('value — the new value is shown once, at roll time. If the old value was');
      say('pasted back in, it is now dead. Create a fresh token:');
      say('  dash.cloudflare.com/profile/api-tokens -> Create Token -> Custom');
      say('  Permissions: Account | Cloudflare Pages | Edit');
      say('  Account Resources: include your account, and nothing else');
    } else if (/account|not found|authenticate|8000007|7003/i.test(blockedReason)) {
      say('');
      say('That reads like the account id rather than the token. Check it under');
      say('Workers & Pages in the dashboard, right-hand column.');
    } else {
      say('');
      say('Add: Account -> Cloudflare Pages -> Edit to the token.');
    }
    say('');
    return 1;
  }

  say(
    `Pages reachable — ${projectNames.length} project(s)` +
      (projectNames.length > 0 ? ': ' + projectNames.join(', ') : ''),
  );
  if (projectNames.length > 0 && !projectNames.includes(env('CF_PAGES_PROJECT') ?? 'noupload')) {
    say(
      `NOTE: no project named "${env('CF_PAGES_PROJECT') ?? 'noupload'}" — set CF_PAGES_PROJECT ` +
        'to one of the names above, or deploy will create a new project.',
    );
  }

  if (overScoped > 0) {
    say('');
    say(`OVER-SCOPED: ${overScoped} area(s) beyond deploying are reachable.`);
    say('It works, but a leak costs more than it needs to. Recreate with only');
    say('Account -> Cloudflare Pages -> Edit, then delete this one.\n');
    return 2;
  }

  say('\ncorrectly scoped: Pages reachable, everything else denied.\n');
  return 0;
}

process.exitCode = await main();
