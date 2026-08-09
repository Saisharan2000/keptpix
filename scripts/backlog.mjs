#!/usr/bin/env node
/**
 * scripts/backlog.mjs — a shared, per-site work queue for unattended agent runs.
 *
 * WHY IT LIVES OUTSIDE THE REPO. Several sites are built in several VSCode
 * workspaces, and an agent in one workspace has to be able to read and update
 * its own backlog without any of them knowing about each other. So the DATA
 * lives at:
 *
 *   ~/.claude/backlog/<site>/state.json     items + session budget
 *   ~/.claude/backlog/<site>/journal.md     append-only, for the evening read
 *   ~/.claude/backlog/<site>/.lock          guards read-modify-write
 *
 * The TOOL is version-controlled here, and `install` copies it to
 * ~/.claude/backlog/backlog.mjs so every workspace and every hook can call one
 * absolute path. Zero dependencies, plain Node, so the copy cannot rot.
 *
 * SEGREGATION IS BY SITE, not by agent. Two agents on one site would race on the
 * same files and the same git tree; the lock makes that safe but pointless. One
 * agent per site, many sites in parallel.
 *
 *   node scripts/backlog.mjs install
 *   node scripts/backlog.mjs init keptpix --root . --hours 10
 *   node scripts/backlog.mjs add keptpix "Ship /compress/visa-photo" --why "..."
 *   node scripts/backlog.mjs session-start keptpix
 *   node scripts/backlog.mjs next keptpix            # claim + print instructions
 *   node scripts/backlog.mjs done keptpix --note "..."
 *   node scripts/backlog.mjs block keptpix --reason "needs an Apple login"
 *   node scripts/backlog.mjs should-continue keptpix # exit 0 = keep working
 *   node scripts/backlog.mjs status                  # every site, one screen
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  rmSync,
  copyFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HOME = os.homedir();
const ROOT = path.join(HOME, '.claude', 'backlog');
const SELF = fileURLToPath(import.meta.url);

const [, , cmd, ...rest] = process.argv;

/** `--flag value` and bare positionals, without pulling in a parser. */
function parse(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { flags, positional };
}

const { flags, positional } = parse(rest);
const siteDir = (site) => path.join(ROOT, site);
const statePath = (site) => path.join(siteDir(site), 'state.json');
const journalPath = (site) => path.join(siteDir(site), 'journal.md');
const lockPath = (site) => path.join(siteDir(site), '.lock');

function die(msg) {
  process.stderr.write(msg + '\n');
  process.exit(1);
}

/**
 * Crude but adequate mutual exclusion. A lock older than 5 minutes is treated as
 * abandoned — an agent that crashed mid-write must not wedge the queue for the
 * rest of a ten-hour run.
 */
function withLock(site, fn) {
  const lock = lockPath(site);
  if (existsSync(lock)) {
    const age = Date.now() - statSync(lock).mtimeMs;
    if (age < 5 * 60_000) die(`backlog: ${site} is locked (${Math.round(age / 1000)}s old)`);
    rmSync(lock, { force: true });
  }
  writeFileSync(lock, String(process.pid));
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

function load(site) {
  const p = statePath(site);
  if (!existsSync(p)) die(`backlog: no site "${site}". Run: backlog init ${site} --root <path>`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function save(site, state) {
  writeFileSync(statePath(site), JSON.stringify(state, null, 2) + '\n');
}

function journal(site, text) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  appendFileSync(journalPath(site), `- ${stamp} — ${text}\n`);
}

function sites() {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(statePath(d.name)))
    .map((d) => d.name);
}

/** Hours consumed of this session's budget, or null if no session is open. */
function elapsedHours(state) {
  if (state.session.startedAt === null) return null;
  return (Date.now() - Date.parse(state.session.startedAt)) / 3_600_000;
}

function nextId(state) {
  const n = state.items.reduce((max, i) => Math.max(max, Number(i.id) || 0), 0);
  return String(n + 1);
}

switch (cmd) {
  case 'install': {
    mkdirSync(ROOT, { recursive: true });
    const dest = path.join(ROOT, 'backlog.mjs');
    copyFileSync(SELF, dest);
    process.stdout.write(`installed -> ${dest}\n`);
    process.stdout.write(`call it from any workspace:\n  node "${dest}" status\n`);
    break;
  }

  case 'init': {
    const site = positional[0];
    if (!site) die('usage: backlog init <site> --root <path> [--hours 10]');
    mkdirSync(siteDir(site), { recursive: true });
    if (existsSync(statePath(site))) die(`backlog: ${site} already exists`);
    const state = {
      site,
      root: path.resolve(String(flags.root ?? process.cwd())),
      // The verify gate an agent must pass before calling an item done. Per-site
      // because not every project will have this repo's script.
      verifyCommand: String(flags.verify ?? 'npm run verify'),
      items: [],
      session: { startedAt: null, budgetHours: Number(flags.hours ?? 10), runs: 0 },
    };
    save(site, state);
    writeFileSync(journalPath(site), `# ${site} — agent journal\n\n`);
    journal(site, `initialised, root ${state.root}, budget ${state.session.budgetHours}h`);
    process.stdout.write(`initialised ${site} at ${siteDir(site)}\n`);
    break;
  }

  case 'add': {
    const site = positional[0];
    const title = positional.slice(1).join(' ');
    if (!site || !title) die('usage: backlog add <site> "<title>" [--why "..."] [--first]');
    withLock(site, () => {
      const state = load(site);
      const item = {
        id: nextId(state),
        title,
        why: flags.why === undefined ? null : String(flags.why),
        status: 'pending',
        addedAt: new Date().toISOString(),
        startedAt: null,
        doneAt: null,
        note: null,
      };
      /*
       * `--blocked --reason` exists because `add` then `next` then `block` does
       * NOT do what it looks like: `next` claims the first PENDING item, which
       * is rarely the one just added. Doing it that way attached three "needs an
       * iPhone" reasons to three unrelated items. Queue-and-block has to be one
       * operation on one known id.
       */
      if (flags.blocked === true || flags.reason !== undefined) {
        if (flags.reason === undefined) die('backlog: --blocked needs --reason');
        item.status = 'blocked';
        item.note = String(flags.reason);
      }
      if (flags.first === true) state.items.unshift(item);
      else state.items.push(item);
      save(site, state);
      journal(
        site,
        item.status === 'blocked'
          ? `queued BLOCKED #${item.id}: ${title} — ${item.note}`
          : `queued #${item.id}: ${title}`,
      );
      process.stdout.write(`#${item.id} ${item.status === 'blocked' ? 'queued blocked' : 'queued'}\n`);
    });
    break;
  }

  case 'next': {
    const site = positional[0];
    if (!site) die('usage: backlog next <site>');
    withLock(site, () => {
      const state = load(site);
      const already = state.items.find((i) => i.status === 'in_progress');
      const item = already ?? state.items.find((i) => i.status === 'pending');
      if (item === undefined) {
        process.stdout.write('QUEUE EMPTY\n');
        process.exit(3);
      }
      if (already === undefined) {
        item.status = 'in_progress';
        item.startedAt = new Date().toISOString();
        save(site, state);
        journal(site, `started #${item.id}: ${item.title}`);
      }
      const left = elapsedHours(state);
      process.stdout.write(
        [
          `ITEM #${item.id}${already ? ' (already in progress)' : ''}`,
          `TITLE: ${item.title}`,
          item.why ? `WHY:   ${item.why}` : null,
          `ROOT:  ${state.root}`,
          `VERIFY: ${state.verifyCommand}`,
          left === null
            ? 'SESSION: not started'
            : `SESSION: ${left.toFixed(2)}h of ${state.session.budgetHours}h used`,
          `PENDING AFTER THIS: ${state.items.filter((i) => i.status === 'pending').length}`,
        ]
          .filter((l) => l !== null)
          .join('\n') + '\n',
      );
    });
    break;
  }

  case 'done': {
    const site = positional[0];
    if (!site) die('usage: backlog done <site> [--note "..."]');
    withLock(site, () => {
      const state = load(site);
      const item = state.items.find((i) => i.status === 'in_progress');
      if (item === undefined) die('backlog: nothing in progress');
      item.status = 'done';
      item.doneAt = new Date().toISOString();
      item.note = flags.note === undefined ? null : String(flags.note);
      save(site, state);
      journal(site, `DONE #${item.id}: ${item.title}${item.note ? ` — ${item.note}` : ''}`);
      process.stdout.write(`#${item.id} done\n`);
    });
    break;
  }

  case 'unblock': {
    const site = positional[0];
    if (!site || flags.id === undefined) die('usage: backlog unblock <site> --id <n>');
    withLock(site, () => {
      const state = load(site);
      const item = state.items.find((i) => i.id === String(flags.id));
      if (item === undefined) die(`backlog: no item #${flags.id}`);
      item.status = 'pending';
      item.note = null;
      item.startedAt = null;
      save(site, state);
      journal(site, `unblocked #${item.id}: ${item.title}`);
      process.stdout.write(`#${item.id} back to pending\n`);
    });
    break;
  }

  case 'block': {
    const site = positional[0];
    if (!site) die('usage: backlog block <site> --reason "..." [--id <n>]');
    if (flags.reason === undefined) die('backlog: --reason is required, a human has to read it');
    withLock(site, () => {
      const state = load(site);
      // `--id` targets an exact item. Without it, the in-progress one — which is
      // the right default mid-cycle and the wrong one straight after `add`.
      const item =
        flags.id === undefined
          ? state.items.find((i) => i.status === 'in_progress')
          : state.items.find((i) => i.id === String(flags.id));
      if (item === undefined) {
        die(flags.id === undefined ? 'backlog: nothing in progress' : `backlog: no item #${flags.id}`);
      }
      item.status = 'blocked';
      item.note = String(flags.reason);
      save(site, state);
      journal(site, `BLOCKED #${item.id}: ${item.title} — ${item.note}`);
      process.stdout.write(`#${item.id} blocked, moving on\n`);
    });
    break;
  }

  case 'note': {
    const site = positional[0];
    const text = positional.slice(1).join(' ');
    if (!site || !text) die('usage: backlog note <site> "<text>"');
    journal(site, text);
    break;
  }

  case 'session-start': {
    const site = positional[0];
    if (!site) die('usage: backlog session-start <site> [--hours 10]');
    withLock(site, () => {
      const state = load(site);
      state.session.startedAt = new Date().toISOString();
      state.session.runs += 1;
      if (flags.hours !== undefined) state.session.budgetHours = Number(flags.hours);
      // A previous run may have died mid-item; reclaim it rather than stranding it.
      for (const i of state.items) {
        if (i.status === 'in_progress') i.status = 'pending';
      }
      save(site, state);
      journal(site, `— session ${state.session.runs} start, budget ${state.session.budgetHours}h —`);
      process.stdout.write(`session started for ${site}, ${state.session.budgetHours}h budget\n`);
    });
    break;
  }

  case 'session-end': {
    const site = positional[0];
    if (!site) die('usage: backlog session-end <site>');
    withLock(site, () => {
      const state = load(site);
      const used = elapsedHours(state);
      state.session.startedAt = null;
      save(site, state);
      journal(site, `— session end, ${used === null ? '?' : used.toFixed(2)}h used —`);
      process.stdout.write('session ended\n');
    });
    break;
  }

  /**
   * The decision the Stop hook asks about. Exit codes are the interface:
   *   0  keep working, and stdout carries the reason
   *   3  queue empty — nothing left to do
   *   4  time budget spent
   * Anything else is an error, and the hook must treat an error as "let it
   * stop". Failing open matters: a broken queue tool should never trap an agent
   * in a loop it cannot leave.
   */
  case 'should-continue': {
    const site = positional[0];
    if (!site) die('usage: backlog should-continue <site>');
    const state = load(site);
    const used = elapsedHours(state);
    if (used === null) {
      process.stdout.write('no session open\n');
      process.exit(3);
    }
    if (used >= state.session.budgetHours) {
      process.stdout.write(`budget spent: ${used.toFixed(2)}h of ${state.session.budgetHours}h\n`);
      process.exit(4);
    }
    const open = state.items.filter((i) => i.status === 'pending' || i.status === 'in_progress');
    if (open.length === 0) {
      process.stdout.write('queue empty\n');
      process.exit(3);
    }
    process.stdout.write(
      `${open.length} item(s) open, ${(state.session.budgetHours - used).toFixed(2)}h left\n`,
    );
    process.exit(0);
    // Unreachable, but eslint cannot see that process.exit terminates and would
    // otherwise read this as falling through into `status`.
    break;
  }

  case 'status': {
    const list = positional[0] ? [positional[0]] : sites();
    if (list.length === 0) {
      process.stdout.write('no sites yet. backlog init <site> --root <path>\n');
      break;
    }
    for (const site of list) {
      const state = load(site);
      const by = (s) => state.items.filter((i) => i.status === s);
      const used = elapsedHours(state);
      process.stdout.write(
        `\n${site}  ${by('done').length} done · ${by('pending').length} pending · ` +
          `${by('in_progress').length} running · ${by('blocked').length} blocked` +
          (used === null ? '  [idle]' : `  [${used.toFixed(2)}h/${state.session.budgetHours}h]`) +
          '\n',
      );
      for (const i of state.items.filter((x) => x.status !== 'done').slice(0, 12)) {
        const mark = { pending: ' ', in_progress: '>', blocked: '!' }[i.status] ?? '?';
        process.stdout.write(`  ${mark} #${i.id} ${i.title}\n`);
        if (i.status === 'blocked') process.stdout.write(`      needs you: ${i.note}\n`);
      }
      const done = by('done').slice(-5);
      if (done.length > 0) {
        process.stdout.write(`  recently done:\n`);
        for (const i of done) process.stdout.write(`    #${i.id} ${i.title}\n`);
      }
    }
    process.stdout.write('\n');
    break;
  }

  default:
    process.stdout.write(
      readFileSync(SELF, 'utf8')
        .split('\n')
        .slice(1, 34)
        .map((l) => l.replace(/^ \* ?/, '').replace(/^\/\*\*?/, ''))
        .join('\n') + '\n',
    );
}
