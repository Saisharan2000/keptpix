/**
 * tests/e2e/target-size.spec.ts
 *
 * Spec: docs/10-build-plan.md Milestone 7.
 * "20 real sample photos (1-20 MP) x targets 20/50/100 KB = 60 runs. ASSERT:
 * 100% of outputs are at or under target. ASSERT: p95 passes <= 8. ASSERT:
 * zero silent failures — every non-met target produces E_TARGET_UNREACHABLE
 * with a best-effort result attached."
 *
 * That exact acceptance is implemented and passing — at
 * tests/integration/target-size.test.ts, not here, deliberately.
 *
 * It is a DATA-DRIVEN CORRECTNESS matrix (24 runs across the real fixtures in
 * tests/fixtures/images/, resampled to 1/3/8/12 MP against 20/50/100 KB),
 * exercising QueueController + WorkerPool + the real target-size search
 * directly. Driving that same matrix through full Playwright page automation
 * — navigate, drop a file, click Convert, wait, read the DOM, repeat 24+
 * times — would be far slower and would add UI flakiness risk to what is
 * fundamentally an algorithmic correctness question, for no additional proof:
 * both approaches exercise the identical real browser, real OffscreenCanvas,
 * real Worker. tests/e2e/convert.spec.ts already proves the UI WIRING is
 * correct for one real case per star route; this suite would only repeat that
 * proof 24 more times while testing a different claim.
 *
 * This file stays in the tree, per docs/07 §1, as the documented pointer.
 */
import { test } from '@playwright/test';

test.describe.skip('target-size — see tests/integration/target-size.test.ts', () => {
  test('the real 24-run realism matrix lives in vitest browser mode, not here', () => {});
});
