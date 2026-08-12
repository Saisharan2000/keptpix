/**
 * scripts/verify.mjs — one command that decides whether the work is shippable.
 *
 *   node scripts/verify.mjs           # everything
 *   node scripts/verify.mjs --fast    # skip e2e (~20s instead of ~3min)
 *   node scripts/verify.mjs --json    # machine-readable, for hooks and CI
 *
 * WHY THIS EXISTS. Seven gates existed as separate npm scripts with no single
 * entry point, so "is this good?" was a judgement a human had to assemble from
 * seven outputs. That judgement is the main reason an agent has to stop and ask.
 * With one exit code, an agent can decide for itself and keep going.
 *
 * IT OWNS THE SERVER LIFECYCLE, which is the part that kept going wrong by hand:
 *
 *   - Playwright's `reuseExistingServer` will happily attach to whatever is on
 *     the port. A stale Astro dev server on 4321 served a DIFFERENT project and
 *     the whole e2e suite 404'd (docs/12 D-88); the same class of mistake ran an
 *     entire suite against the wrong product once before (D-76).
 *   - `serve-with-headers.mjs` parses `public/_headers` ONCE at module load, so a
 *     long-lived server serves stale headers for its whole life and a header edit
 *     silently does nothing.
 *
 * So: bind port 0, let the OS pick a free one, start fresh, and always kill it.
 * Never a hardcoded port, never a reused server.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';

const FAST = process.argv.includes('--fast');
const JSON_OUT = process.argv.includes('--json');

/** Ask the OS for a port nothing holds, then release it immediately. */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function run(cmd, args, { env = {}, timeout = 900_000 } = {}) {
  return new Promise((resolve) => {
    /*
     * One command STRING with shell:true, not (cmd, args[]) with shell:true.
     * The latter concatenates without escaping and Node emits DEP0190 for it.
     * The shell is needed at all because `npm`/`npx` are .cmd shims on Windows
     * and are not directly executable. Every argument here is a literal from
     * this file — none is interpolated from input.
     */
    const child = spawn([cmd, ...args].join(' '), {
      shell: true,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const cap = (d) => {
      out += d.toString();
      if (out.length > 400_000) out = out.slice(-400_000);
    };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      out += '\n[verify] KILLED after ' + timeout + 'ms';
    }, timeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out });
    });
  });
}

/** Pull the interesting line out of a gate's output so the summary is readable. */
function digest(name, out) {
  const pick = (re) => {
    const m = re.exec(out);
    return m === null ? null : m[0].trim();
  };
  switch (name) {
    case 'unit':
    case 'integration': {
      /*
       * Name the failing test, not just the count. An intermittent integration
       * failure once slipped past because the summary line said
       * "Tests 1 ⎯⎯⎯" — a regex that had matched a separator — and the real
       * name was only in the captured tail, which nobody read.
       */
      const failing = [...out.matchAll(/^\s*(?:FAIL|×)\s+(.+)$/gm)]
        .map((m) => m[1].trim().replace(/\s+\d+ms$/, ''))
        .filter((l) => l.length > 0)
        .slice(0, 3);
      const counts = pick(/Tests\s+\d+ (?:failed|passed)[^\n]*/) ?? pick(/Tests\s+\d+[^\n]*/);
      return failing.length > 0 ? `${counts ?? ''} — ${failing.join(' | ')}` : counts;
    }
    case 'budgets':
      return pick(/Baseline JS[^\n]*/);
    case 'private':
      return pick(/Clean: \d+ private path[^\n]*/) ?? pick(/\d+ file\(s\) TRACKED[^\n]*/);
    case 'claims':
      return pick(/Clean: \d+ claim[^\n]*/) ?? pick(/FAIL\s+\[[a-z]+\][^\n]*/);
    case 'seo':
      return pick(/\d+ error\(s\), \d+ warning\(s\)/) ?? pick(/Clean:[^\n]*/);
    case 'lint':
      return pick(/✖ \d+ problems[^\n]*/) ?? 'no problems';
    case 'typecheck':
      return pick(/error TS[^\n]*/) ?? 'no type errors';
    case 'build':
      return pick(/\d+ page\(s\) built[^\n]*/);
    case 'e2e':
      return pick(/\d+ passed[^\n]*/) ?? pick(/\d+ failed[^\n]*/);
    default:
      return null;
  }
}

const results = [];
let hardFail = false;

/**
 * @param opts.blocking  default true: a failure stops the run, because there is no
 *   point running browser tests against a build that did not compile.
 *
 *   Pass `false` for a gate whose failure says nothing about whether the code
 *   works. `private` is the case that forced this option: it reports a tracked
 *   file in a public repo, and as a blocking gate it hid lint, typecheck, build
 *   and tests behind a git hygiene problem — leaving no evidence that the actual
 *   code changes in the same commit were sound. A non-blocking failure still sets
 *   the exit code; it just does not pretend to be a build error.
 */
async function gate(name, label, fn, opts = {}) {
  const { blocking = true } = opts;
  if (hardFail) {
    results.push({ name, label, status: 'skipped', note: 'a prior gate failed' });
    return;
  }
  const started = Date.now();
  const { code, out } = await fn();
  const ms = Date.now() - started;
  const ok = code === 0;
  if (!ok && blocking) hardFail = true;
  results.push({
    name,
    label,
    status: ok ? 'pass' : 'fail',
    ms,
    note: digest(name, out),
    ...(ok ? {} : { tail: out.split('\n').slice(-25).join('\n') }),
  });
  if (!JSON_OUT) {
    const mark = ok ? 'ok  ' : 'FAIL';
    process.stdout.write(
      `  ${mark} ${label.padEnd(26)} ${String((ms / 1000).toFixed(1) + 's').padStart(7)}` +
        (digest(name, out) ? `   ${digest(name, out)}` : '') +
        '\n',
    );
  }
}

if (!JSON_OUT) {
  process.stdout.write(`\nverify${FAST ? ' --fast' : ''}\n\n`);
}

// Cheap and most-likely-to-fail first, so a broken build is not discovered
// after three minutes of browser tests. `private` is first because it costs one
// `git ls-files` and guards a PUBLIC repository — a strategy doc reached the
// public remote through `git add -A` before anyone looked (docs/12 D-111).
await gate('private', 'private paths', () => run('npm', ['run', 'check:private']), {
  blocking: false,
});
await gate('lint', 'eslint', () => run('npm', ['run', 'lint']));
await gate('typecheck', 'typescript', () => run('npm', ['run', 'typecheck']));
await gate('unit', 'unit tests', () => run('npm', ['test']));
await gate('build', 'astro build', () => run('npm', ['run', 'build']));
await gate('budgets', 'size budgets', () => run('npm', ['run', 'check:budgets']));
await gate('seo', 'seo structure', () => run('npm', ['run', 'check:seo']));
// After the build, because it reads dist/ — what is SERVED, not what is written.
await gate('claims', 'privacy claims', () => run('npm', ['run', 'check:claims']));
await gate('integration', 'integration (browser)', () =>
  run('npx', ['vitest', 'run', '--project', 'integration']),
);

if (!FAST && !hardFail) {
  // A FRESH server on a port the OS just told us is free. Never 4321, never a
  // server someone else started — see the header comment.
  const port = await freePort();
  const server = spawn('node', ['scripts/serve-with-headers.mjs', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d.toString()));
  server.stderr.on('data', (d) => (log += d.toString()));

  const ready = await new Promise((resolve) => {
    const deadline = Date.now() + 30_000;
    const tick = setInterval(() => {
      if (/serving dist\//.test(log)) {
        clearInterval(tick);
        resolve(true);
      } else if (/EADDRINUSE|Error:/.test(log) || Date.now() > deadline) {
        clearInterval(tick);
        resolve(false);
      }
    }, 150);
  });

  if (!ready) {
    hardFail = true;
    results.push({
      name: 'e2e',
      label: 'e2e (playwright)',
      status: 'fail',
      note: 'header server never came up',
      tail: log.split('\n').slice(-15).join('\n'),
    });
    if (!JSON_OUT) process.stdout.write('  FAIL e2e (playwright)        header server never came up\n');
  } else {
    try {
      await gate('e2e', 'e2e (playwright)', () =>
        run('npx', ['playwright', 'test', '--project=chromium', '--reporter=line'], {
          env: { E2E_BASE_URL: `http://localhost:${port}` },
        }),
      );
    } finally {
      server.kill('SIGKILL');
    }
  }
} else if (FAST) {
  results.push({ name: 'e2e', label: 'e2e (playwright)', status: 'skipped', note: '--fast' });
  if (!JSON_OUT) process.stdout.write('  --   e2e (playwright)        skipped (--fast)\n');
}

const failed = results.filter((r) => r.status === 'fail');
const passed = results.filter((r) => r.status === 'pass').length;

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify({ ok: failed.length === 0, passed, failed: failed.length, results }, null, 2) +
      '\n',
  );
} else {
  process.stdout.write(
    `\n${failed.length === 0 ? `all ${passed} gates pass` : `${failed.length} FAILED`}\n`,
  );
  for (const f of failed) {
    process.stdout.write(`\n── ${f.label} ──\n${f.tail ?? f.note ?? ''}\n`);
  }
  process.stdout.write('\n');
}

process.exit(failed.length === 0 ? 0 : 1);
