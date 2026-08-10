#!/usr/bin/env node
/**
 * scripts/new-project.mjs — turn an idea into a workspace an agent can work in.
 *
 *   node scripts/new-project.mjs memototext --dir ../memototext
 *   node scripts/new-project.mjs memototext --dir ../memototext --from-plan ./plan.md
 *   node scripts/new-project.mjs memototext --dir ../memototext --dry-run
 *
 * WHY. Starting a second app meant hand-copying four files, reinventing the doc
 * numbering, remembering that `.claude/settings.json` has to reference the hook
 * by the right path, and hoping `doctor` came out clean. Every one of those is a
 * step a person had to not get wrong, and the reason a new site took an evening
 * rather than a command.
 *
 * WHAT IT COPIES, and why these four:
 *   backlog.mjs           the shared queue — one tool, many sites
 *   hooks/stop-autopilot  the loop that keeps a 10-hour session going
 *   load-env.mjs          .env parsing, shared so two scripts cannot disagree
 *   .claude/settings.json registers the hook; without it the loop is inert
 *   autopilot skill       the operating instructions for an unattended run
 *
 * WHAT IT DOES NOT DO. It does not choose a framework, install dependencies, or
 * write application code. Scaffolding a stack you have not decided on is how a
 * project inherits choices nobody made. `verify.mjs` is copied as a TEMPLATE with
 * its gates commented down to the two that always apply, because a verify command
 * that lies about what it checked is worse than none.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const flag = (k) => {
  const i = args.indexOf('--' + k);
  return i === -1 ? undefined : args[i + 1];
};
const DRY = args.includes('--dry-run');

if (name === undefined) {
  process.stdout.write(
    '\nusage: node scripts/new-project.mjs <site-name> --dir <path> [--from-plan <file>] [--dry-run]\n\n' +
      '  <site-name>   backlog id, lowercase, no spaces (e.g. memototext)\n' +
      '  --dir         where the project lives; created if absent\n' +
      '  --from-plan   a Cowork-style plan.md to seed the backlog from\n\n',
  );
  process.exit(1);
}

if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  process.stderr.write(`\nsite name "${name}" must be lowercase letters, digits and hyphens.\n`);
  process.exit(1);
}

const target = path.resolve(flag('dir') ?? path.join(path.dirname(HERE), name));
const say = (s) => process.stdout.write(s + '\n');
const done = [];
const skipped = [];

function put(rel, contents) {
  const dest = path.join(target, rel);
  if (existsSync(dest)) {
    skipped.push(rel + ' (exists)');
    return;
  }
  if (!DRY) {
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, contents);
  }
  done.push(rel);
}

function copy(rel, destRel = rel) {
  const src = path.join(HERE, rel);
  if (!existsSync(src)) {
    skipped.push(destRel + ' (source missing)');
    return;
  }
  const dest = path.join(target, destRel);
  if (existsSync(dest)) {
    skipped.push(destRel + ' (exists)');
    return;
  }
  if (!DRY) {
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
  done.push(destRel);
}

say(`\nscaffolding "${name}" into ${target}${DRY ? '  (dry run)' : ''}\n`);
if (!DRY) mkdirSync(target, { recursive: true });

/* ── the machinery ─────────────────────────────────────────────────────── */

copy('scripts/backlog.mjs');
copy('scripts/load-env.mjs');
copy('scripts/hooks/stop-autopilot.mjs');
copy('.claude/settings.json');
copy('.claude/skills/autopilot/SKILL.md');

/* ── verify: a template, honest about being one ─────────────────────────── */

put(
  'scripts/verify.mjs',
  `/**
 * scripts/verify.mjs — one command that decides whether the work is shippable.
 *
 *   node scripts/verify.mjs           # everything
 *   node scripts/verify.mjs --fast    # skip the slow gates
 *   node scripts/verify.mjs --json    # machine-readable, for hooks and CI
 *
 * SCAFFOLDED TEMPLATE for ${name}. Two gates are live because they apply to any
 * project. ADD THE REST AS THEY BECOME REAL — a verify command that reports
 * success while checking almost nothing is worse than no verify command, because
 * an unattended agent will believe it.
 *
 * Reference implementation with eight gates, including a browser suite and a
 * post-deploy digest check: ${path.basename(HERE)}/scripts/verify.mjs
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

/**
 * FLIP THIS TO true ONCE THE GATES BELOW ARE REAL.
 *
 * Until then this command refuses to pass, on purpose. A freshly scaffolded
 * verify with two \`--if-present\` gates in an empty project reports "all gates
 * pass" while checking essentially nothing — and an unattended agent will read
 * that as permission to mark work done. A comment asking someone to fill the
 * gates in is not a gate; refusing to succeed is.
 */
const GATES_REVIEWED = false;

const FAST = process.argv.includes('--fast');
const JSON_OUT = process.argv.includes('--json');

if (!GATES_REVIEWED) {
  const msg =
    'verify is still the scaffolded template and has not been reviewed.\\n' +
    'Add the gates this project actually needs — build, lint, tests, e2e —\\n' +
    'then set GATES_REVIEWED = true at the top of scripts/verify.mjs.\\n' +
    'Until then nothing may be called shippable, because nothing is checked.\\n';
  if (JSON_OUT) process.stdout.write(JSON.stringify({ ok: false, reason: 'gates unreviewed' }) + '\\n');
  else process.stderr.write('\\n' + msg);
  process.exit(1);
}

function run(cmd, timeout = 900_000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const cap = (d) => { out += d.toString(); if (out.length > 200_000) out = out.slice(-200_000); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const t = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('close', (code) => { clearTimeout(t); resolve({ code: code ?? 1, out }); });
  });
}

/**
 * Cheapest and most-likely-to-fail first, so a broken build is not discovered
 * after three minutes of browser tests.
 *
 * \`slow: true\` gates are skipped by --fast.
 */
const GATES = [
  { name: 'typecheck', cmd: 'npm run typecheck --if-present' },
  { name: 'unit tests', cmd: 'npm test --if-present' },
  // { name: 'lint',       cmd: 'npm run lint' },
  // { name: 'build',      cmd: 'npm run build' },
  // { name: 'e2e',        cmd: 'npx playwright test --reporter=line', slow: true },
];

const results = [];
let failed = 0;

for (const gate of GATES) {
  if (FAST && gate.slow === true) {
    results.push({ ...gate, status: 'skipped' });
    if (!JSON_OUT) process.stdout.write(\`  --   \${gate.name} (--fast)\\n\`);
    continue;
  }
  const started = Date.now();
  const { code, out } = await run(gate.cmd);
  const ms = Date.now() - started;
  const ok = code === 0;
  if (!ok) failed += 1;
  results.push({ ...gate, status: ok ? 'pass' : 'fail', ms, tail: ok ? undefined : out.split('\\n').slice(-20).join('\\n') });
  if (!JSON_OUT) {
    process.stdout.write(\`  \${ok ? 'ok  ' : 'FAIL'} \${gate.name.padEnd(24)} \${(ms / 1000).toFixed(1)}s\\n\`);
  }
  if (!ok) break;
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ ok: failed === 0, results }, null, 2) + '\\n');
} else {
  process.stdout.write(failed === 0 ? '\\nall gates pass\\n\\n' : '\\nFAILED\\n');
  for (const r of results.filter((x) => x.status === 'fail')) process.stdout.write(\`\\n\${r.tail ?? ''}\\n\`);
}

process.exit(failed === 0 ? 0 : 1);
`,
);

/* ── CLAUDE.md: the standing instructions, minus this project's specifics ── */

put(
  'CLAUDE.md',
  `# ${name} — standing instructions

## Rule 0 — meritocracy wins, otherwise the standard rule wins
If there is a clearly better engineering answer, take it, even when it
contradicts something below. "Clearly better" means you can show the evidence —
a measurement, a failing case, a real user consequence — not that you prefer it.
Absent that evidence, follow the documented rule exactly; a tie goes to the
standard, never to improvisation.

Overriding anything below is a DEVIATION: log it in \`docs/12-deviations.md\` with
the reasoning and the evidence, and update the doc it contradicts in the same
commit. The rule you broke stays in force for every other case.

## Non-negotiables
FILL THESE IN. They are the constraints that must survive a 3am unattended
session, so they have to be specific enough to check. The reference project's
list is four lines about never uploading user data, one about keeping a layer
pure, and one about where files go — each of them testable.

1. ...
2. ...

## Quality bar
- \`node scripts/verify.mjs\` must pass before any commit is called done.
- Never weaken an assertion to make a gate green. If an assertion is genuinely
  wrong, say why in the commit and in docs/12.
- A regression test that has not been observed to fail is a comment. Fix the bug,
  revert the fix, watch the test fail, restore it.
- Never claim a check passed without running it. Paste the number.

## Working unattended
See \`.claude/skills/autopilot/SKILL.md\`. The short version: one backlog item at
a time, verify before done, queue what the work reveals, and \`backlog block\` —
never stall — for credentials, money, first-time public acts, physical devices
and legal calls.
`,
);

put(
  'docs/12-deviations.md',
  `# 12 — Deviations

Every departure from a documented rule, with the evidence that justified it. This
is the accountability record for autonomous work, not a formality: an agent that
can decide things alone has to leave a trail a person can audit in the evening.

Format, one per entry:

    ## D-01 — one line saying what was wrong
    What was expected, what actually happened, how it was measured, what changed,
    and what is still unverified.

The reference project's log runs to 97 entries and is mostly its own mistakes.
That is the point — it is the most useful file in the repository for anyone about
to repeat one.

---
## Outstanding work, most consequential first

| | Item | Blocks |
|---|---|---|
| | — | — |
`,
);

put(
  'plan.md',
  `# ${name} — plan

The backlog reads this file. \`- [ ]\` becomes a pending item, \`- [!]\` becomes
blocked with the reason after the dash, \`- [x]\` is skipped, and prose like this
paragraph is ignored. Re-importing after an edit adds only what is new:

    node "$HOME/.claude/backlog/backlog.mjs" import ${name} --from plan.md

Put EVIDENCE after the dash, not restatement. "Users want this" is not evidence;
"the first page of results for this query is competitor tool pages with no
discussion threads" is.

- [ ] Decide the stack and write it into CLAUDE.md non-negotiables — an agent at 3am needs constraints it can check
- [ ] Fill in scripts/verify.mjs gates, then set GATES_REVIEWED = true — it refuses to pass until then, deliberately: nothing may be called shippable while nothing is checked
- [ ] Write docs/01 with the wedge and the evidence for it
`,
);

/* ── the backlog ───────────────────────────────────────────────────────── */

const backlogTool = path.join(os.homedir(), '.claude', 'backlog', 'backlog.mjs');
say('  files:');
for (const d of done) say(`    +  ${d}`);
for (const s of skipped) say(`    .  ${s}`);

if (DRY) {
  say('\n(dry run — nothing written, backlog untouched)\n');
  process.exit(0);
}

if (!existsSync(backlogTool)) {
  say('\n  backlog tool not installed yet. From this project:');
  say(`    node scripts/backlog.mjs install`);
} else {
  const init = spawnSync(
    process.execPath,
    [backlogTool, 'init', name, '--root', target, '--hours', '10'],
    { encoding: 'utf8' },
  );
  say('\n  backlog: ' + (init.stdout || init.stderr || '').trim());

  const planPath = flag('from-plan');
  const seed = planPath === undefined ? path.join(target, 'plan.md') : path.resolve(planPath);
  if (existsSync(seed)) {
    const imp = spawnSync(process.execPath, [backlogTool, 'import', name, '--from', seed], {
      encoding: 'utf8',
    });
    say('  import : ' + (imp.stdout || imp.stderr || '').trim());
  }

  const doc = spawnSync(process.execPath, [backlogTool, 'doctor', name], { encoding: 'utf8' });
  say('\n' + (doc.stdout || '').trimEnd());
}

say('\nnext, in the new workspace:');
say(`  1. decide the stack, fill CLAUDE.md non-negotiables and verify.mjs gates`);
say(`  2. set CLAUDE_BACKLOG_SITE=${name} in the environment`);
say(`  3. node "$HOME/.claude/backlog/backlog.mjs" session-start ${name} --hours 10`);
say(`  4. invoke the autopilot skill\n`);
