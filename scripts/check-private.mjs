#!/usr/bin/env node
/**
 * check-private — nothing that must stay private is tracked by git.
 *
 * WHY THIS EXISTS
 *
 * This repository is public. `git add -A` committed a Cowork strategy document —
 * target keywords, revenue projections, competitor analysis — to the public repo
 * in 0a69e04, and nobody noticed until the founder read the commit (docs/12 D-111).
 *
 * .gitignore alone is not the guard. It stops `git add -A`, and nothing else:
 * `git add -f` overrides it, a file already tracked keeps being tracked no matter
 * what .gitignore says, and the ignore line itself can be edited away. This check
 * asks git the only question that matters — *is it in the index right now* — and
 * fails the build if the answer is yes.
 *
 * It is deliberately about PATHS, not content. A secret scanner looks for things
 * shaped like credentials; the strategy doc was not credential-shaped, it was just
 * something that should not have been public. Directories whose whole purpose is
 * "private working material" are enumerated here and kept out by name.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Paths that must never appear in the index of a public repository.
 * Each entry says why, because a bare path list rots into cargo cult.
 */
const NEVER_TRACKED = [
  {
    path: 'claude-cowork-docs/',
    why: 'Cowork strategy material: target keywords, revenue figures, competitor analysis.',
  },
  {
    path: '.env',
    why: 'Cloudflare API token. .env.example is the tracked one.',
  },
  {
    path: 'screenshots/',
    why: 'Regenerable marketing PNGs; 1 MB of churn, never served.',
  },
];

let failed = false;

for (const { path, why } of NEVER_TRACKED) {
  let tracked = '';
  try {
    // `ls-files --` lists only what is IN THE INDEX. An untracked file on disk,
    // ignored or not, produces nothing here — which is exactly the state we want.
    tracked = execFileSync('git', ['ls-files', '--', path], { encoding: 'utf8' }).trim();
  } catch (err) {
    process.stdout.write(`  ??  ${path.padEnd(24)} could not ask git: ${err.message}\n`);
    failed = true;
    continue;
  }

  if (tracked) {
    const files = tracked.split('\n');
    process.stdout.write(`  FAIL ${path.padEnd(24)} ${files.length} file(s) TRACKED in a public repo\n`);
    for (const f of files) process.stdout.write(`       ${f}\n`);
    process.stdout.write(`       ${why}\n`);
    process.stdout.write(`       Fix: git rm -r --cached "${path}" && git commit\n`);
    failed = true;
  } else {
    process.stdout.write(`  ok   ${path.padEnd(24)} not tracked\n`);
  }
}

/* ── TIP_URL must never be a UPI ID ───────────────────────────────────────────
 *
 * A VPA is `name@bank`, and the founder's carries his real name. Pasted into
 * site.ts it would render on all 32 pages, be committed to a public repo, and be
 * mirrored anywhere that clones it — permanently, because git history keeps it.
 * He flagged this himself when choosing a coffee URL over UPI (docs/12 D-111).
 *
 * `@` is the whole test: a VPA always has one, an email always has one, and a
 * payment page URL never does. A guard that would have to guess the bank suffix
 * list would miss the next one.
 */
const SITE_TS = 'src/content/site.ts';
if (existsSync(SITE_TS)) {
  const tipUrl = readFileSync(SITE_TS, 'utf8').match(/^export const TIP_URL\s*=\s*'([^']*)'/m)?.[1];
  if (tipUrl === undefined) {
    process.stdout.write('  ??  TIP_URL                  not found in site.ts — did the export change shape?\n');
    failed = true;
  } else if (tipUrl === '') {
    process.stdout.write('  ok   TIP_URL                  unset, no tip link rendered\n');
  } else if (tipUrl.includes('@')) {
    process.stdout.write(`  FAIL TIP_URL                  contains "@" — this looks like a UPI ID or email\n`);
    process.stdout.write(`       ${tipUrl}\n`);
    process.stdout.write('       A VPA carries a real name and would be published on all 32 pages,\n');
    process.stdout.write('       in a public repo, permanently. Use a payment PAGE url instead.\n');
    failed = true;
  } else if (!/^https:\/\//.test(tipUrl)) {
    process.stdout.write(`  FAIL TIP_URL                  must be an https:// URL, got: ${tipUrl}\n`);
    failed = true;
  } else {
    process.stdout.write(`  ok   TIP_URL                  ${tipUrl}\n`);
  }
}

if (failed) {
  process.stdout.write('\nsomething private would be published. This repository is PUBLIC.\n');
  process.exit(1);
}

process.stdout.write(`\nClean: ${NEVER_TRACKED.length} private path(s) untracked, TIP_URL safe.\n`);
