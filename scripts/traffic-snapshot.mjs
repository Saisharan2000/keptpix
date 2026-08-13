#!/usr/bin/env node
/**
 * traffic-snapshot — the week's traffic, from the host, with zero beacons
 * (docs/12 D-129, Cowork batch #6 / backlog #39).
 *
 *   node scripts/traffic-snapshot.mjs            # print the last 7 days
 *   node scripts/traffic-snapshot.mjs --journal  # also append one line to the
 *                                                # backlog journal
 *
 * WHY HOST-SIDE. The site ships no analytics script — that is a promise with
 * three gates behind it (CSP, check-claims, privacy.spec). Cloudflare already
 * terminates every request at its edge, so the zone's GraphQL analytics see
 * traffic without the page carrying anything. The trade is honesty about what
 * the numbers mean: edge requests count EVERY client, so crawlers and bots are
 * in here. Treat uniques as a CEILING on human visitors, not a count — the
 * D-111 ads gate (>1000 visits/day) reads these numbers conservatively for
 * exactly that reason.
 *
 * Needs the token permission Zone → Analytics → Read (added 13 Aug 2026 —
 * before that the same query returned authz 403, see D-127).
 */
import { appendFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEnvFile } from './load-env.mjs';

const JOURNAL = join(homedir(), '.claude', 'backlog', 'keptpix', 'journal.md');
const WRITE_JOURNAL = process.argv.includes('--journal');

const env = parseEnvFile(join(process.cwd(), '.env'));
const token = env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('traffic-snapshot: CLOUDFLARE_API_TOKEN missing from .env');
  process.exit(1);
}
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

const zoneRes = await fetch('https://api.cloudflare.com/client/v4/zones?name=keptpix.com', {
  headers,
});
const zone = (await zoneRes.json()).result?.[0]?.id;
if (!zone) {
  console.error('traffic-snapshot: could not resolve the keptpix.com zone id');
  process.exit(1);
}

const since = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
const query = `{
  viewer { zones(filter: {zoneTag: "${zone}"}) {
    httpRequests1dGroups(limit: 8, orderBy: [date_ASC], filter: {date_gt: "${since}"}) {
      dimensions { date }
      sum { requests pageViews cachedRequests }
      uniq { uniques }
    }
  } }
}`;

const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
  method: 'POST',
  headers,
  body: JSON.stringify({ query }),
});
const body = await res.json();
if (body.errors?.length) {
  console.error('traffic-snapshot: ' + JSON.stringify(body.errors[0]).slice(0, 200));
  process.exit(1);
}

const days = body.data.viewer.zones[0].httpRequests1dGroups;
if (days.length === 0) {
  console.log('traffic-snapshot: no data in the window.');
  process.exit(0);
}

console.log('\ntraffic, last 7 days (edge-side, INCLUDES bots — uniques are a ceiling)\n');
console.log('  date         requests   pageViews   uniques');
let tReq = 0, tPv = 0;
let maxUniq = 0;
for (const d of days) {
  tReq += d.sum.requests;
  tPv += d.sum.pageViews;
  maxUniq = Math.max(maxUniq, d.uniq.uniques);
  console.log(
    `  ${d.dimensions.date}   ${String(d.sum.requests).padStart(8)}   ${String(d.sum.pageViews).padStart(9)}   ${String(d.uniq.uniques).padStart(7)}`,
  );
}
const line =
  `traffic week to ${days[days.length - 1].dimensions.date}: ` +
  `${tReq} requests, ${tPv} pageViews, peak ${maxUniq} uniques/day (edge-side, bots included)`;
console.log('\n  ' + line + '\n');

if (WRITE_JOURNAL) {
  if (!existsSync(JOURNAL)) {
    console.error('traffic-snapshot: journal not found at ' + JOURNAL);
    process.exit(1);
  }
  appendFileSync(JOURNAL, `- ${new Date().toISOString().slice(0, 10)} ${line}\n`);
  console.log('  appended to the backlog journal.');
}
