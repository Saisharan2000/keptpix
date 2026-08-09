#!/usr/bin/env node
/**
 * Stop hook — keeps an autopilot run going until the queue empties or the time
 * budget is spent.
 *
 * OPT-IN, AND THAT IS THE POINT. It does nothing unless CLAUDE_BACKLOG_SITE is
 * set in the environment. An ordinary interactive session must never be trapped
 * in a loop it cannot leave, so absence of that variable means "allow stop"
 * immediately.
 *
 * IT FAILS OPEN, ALWAYS. Any error — missing queue, unparseable state, tool
 * moved — results in allowing the stop. A queue tool that can wedge an agent is
 * worse than no queue tool, and the failure would happen while nobody is
 * watching, which is exactly when it must not happen.
 *
 * Wired from .claude/settings.json. Reads the hook payload on stdin and ignores
 * it; the decision depends only on the queue, not on what the agent just said.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

/** Allow the stop, quietly. */
function allow(note) {
  if (note !== undefined && process.env.CLAUDE_BACKLOG_DEBUG === '1') {
    process.stderr.write(`[autopilot] stopping: ${note}\n`);
  }
  process.exit(0);
}

// Drain stdin so the caller never blocks on a full pipe, then decide.
try {
  const chunks = [];
  process.stdin.on('data', (d) => chunks.push(d));
  process.stdin.on('end', decide);
  process.stdin.on('error', () => decide());
  // No stdin at all (run by hand): decide anyway rather than hang.
  setTimeout(decide, 1500).unref?.();
} catch {
  allow('stdin unavailable');
}

let decided = false;
function decide() {
  if (decided) return;
  decided = true;

  const site = process.env.CLAUDE_BACKLOG_SITE;
  if (site === undefined || site.trim() === '') allow('CLAUDE_BACKLOG_SITE not set');

  const tool = path.join(os.homedir(), '.claude', 'backlog', 'backlog.mjs');

  let res;
  try {
    res = spawnSync(process.execPath, [tool, 'should-continue', site], {
      encoding: 'utf8',
      timeout: 20_000,
    });
  } catch {
    allow('could not run backlog tool');
  }

  if (res === undefined || res.error !== undefined || res.status === null) {
    allow('backlog tool did not run');
  }

  // 0 = work remains and budget left. Everything else means let it finish:
  // 3 queue empty, 4 budget spent, anything else an error we fail open on.
  if (res.status !== 0) allow(`should-continue exit ${res.status}: ${(res.stdout || '').trim()}`);

  const remaining = (res.stdout || '').trim();

  /*
   * Block the stop and hand back the loop. The reason text IS the next prompt
   * the agent sees, so it restates the cycle rather than just saying "keep
   * going" — an agent resuming from a bare nudge tends to re-plan instead of
   * picking up the queue.
   */
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: [
        `Autopilot is still running for "${site}" — ${remaining}.`,
        '',
        'Do not stop. Continue the cycle:',
        `  1. node "${tool}" next ${site}          — claim the next item`,
        '  2. Research it only as far as needed to act, then implement it.',
        '  3. Run the verify command that `next` printed. It must pass.',
        `  4. node "${tool}" done ${site} --note "<what changed, one line>"`,
        `     or: block ${site} --reason "..." if it genuinely needs a human`,
        '     (credentials, payment, a physical device, a legal call)',
        '  5. If the work revealed follow-on work, queue it:',
        `     node "${tool}" add ${site} "<title>" --why "<evidence>"`,
        '  6. Commit with a message explaining WHY, and log any deviation in',
        '     docs/12-deviations.md as usual.',
        '',
        'If the queue is empty, do not idle: research what would most improve',
        'the site next, queue those items with evidence, and keep going.',
        'Never fabricate a verification result. If a gate fails, fix it or block.',
      ].join('\n'),
    }) + '\n',
  );
  process.exit(0);
}
