/**
 * tests/integration/tool-runner.test.ts
 *
 * The invariant that replaces a runtime check.
 *
 * `ManifestToolShell` used to gate its UI on BOTH `tool.supported` and the
 * presence of a runner. That was two sources of truth for one question, and it
 * broke manifest-shell.test.ts's ability to render an entry whose engine does
 * not exist yet — the thing that catches a config the shell cannot express,
 * before anyone builds the engine.
 *
 * The gate is `supported` alone now. "Published implies runnable" is still a
 * real requirement, so it is asserted here instead: a build where someone
 * flipped the flag without registering an engine fails, loudly, rather than
 * shipping a route that renders a button which throws.
 *
 * Browser project because the registry reaches WorkerPool, which needs Worker.
 */
import { describe, it, expect } from 'vitest';
import { publishedTools, toolManifest } from '../../src/core/tools';
import { hasToolRunner } from '../../src/state/tool-runner';

describe('every published tool can actually run', () => {
  it('has a registered runner for each entry with supported: true', () => {
    const missing = publishedTools.filter((tool) => !hasToolRunner(tool.id)).map((t) => t.id);
    expect(
      missing,
      'these tools are published but have no engine registered in state/tool-runner.ts',
    ).toEqual([]);
  });

  it('publishes at least one tool, so the gate is not vacuously satisfied', () => {
    // Without this, deleting every runner and un-publishing every tool would
    // leave the assertion above passing on an empty list.
    expect(publishedTools.length).toBeGreaterThan(0);
  });

  it('does not register a runner for a tool that is still gated', () => {
    // Not a correctness failure, but it means dead code shipped in a bundle,
    // and it usually means someone forgot the last step of a milestone.
    const orphans = toolManifest
      .filter((tool) => !tool.supported && hasToolRunner(tool.id))
      .map((t) => t.id);
    expect(orphans, 'these have an engine but are still gated off').toEqual([]);
  });
});
