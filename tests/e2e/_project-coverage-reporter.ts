/**
 * tests/e2e/_project-coverage-reporter.ts — WO-3.
 *
 * Fails the run if any CONFIGURED Playwright project executed zero tests.
 *
 * This exists because of the exact failure in docs/12 D-55: four browser
 * projects had been configured since Milestone 7, but only Chromium's binary
 * was ever installed. `npm run test:e2e` printed a passing summary while three
 * engines never started — the cross-browser signal the config implied simply
 * did not exist, and nothing said so.
 *
 * A missing browser normally surfaces as loud per-test failures, but that is
 * incidental rather than guaranteed: a project filtered out, skipped wholesale,
 * or matching no files reports green just as quietly. Comparing executed
 * projects against configured ones catches every one of those cases, and is
 * the difference between "the suite passed" and "the suite ran".
 *
 * NOTE: passing `--reporter=<x>` on the command line REPLACES the config's
 * reporter list, including this one. Use `npm run test:e2e` (or plain
 * `npx playwright test`) for a run that is actually guarded.
 */
import type { FullConfig, FullResult, Reporter, TestCase } from '@playwright/test/reporter';

export default class ProjectCoverageReporter implements Reporter {
  #configured: string[] = [];
  readonly #executed = new Set<string>();

  onBegin(config: FullConfig): void {
    this.#configured = config.projects.map((p) => p.name).filter((n) => n.length > 0);
  }

  onTestEnd(test: TestCase): void {
    // A skipped test still proves the browser launched and the project ran,
    // which is precisely what this reporter is checking for.
    const project = test.parent.project();
    if (project !== undefined) this.#executed.add(project.name);
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | void> {
    // Respect an explicit filter (`--project=chromium`): FullConfig.projects
    // already reflects it, so a single-project run is not a coverage failure.
    if (this.#configured.length <= 1) return;

    const missing = this.#configured.filter((name) => !this.#executed.has(name));
    if (missing.length === 0) return;

    process.stderr.write(
      '\n' +
        'PROJECT COVERAGE FAILURE (WO-3, docs/12 D-55)\n' +
        '  configured: ' +
        this.#configured.join(', ') +
        '\n' +
        '  executed:   ' +
        ([...this.#executed].sort().join(', ') || '(none)') +
        '\n' +
        '  MISSING:    ' +
        missing.join(', ') +
        '\n' +
        '  A run that reports green while an engine never started is the exact\n' +
        '  gap this check exists to close. Most likely cause: the browser is not\n' +
        '  installed — run `npx playwright install --with-deps`.\n\n',
    );
    return { status: result.status === 'passed' ? 'failed' : result.status };
  }
}
