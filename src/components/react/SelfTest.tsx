import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ingestFiles, QueueController } from '../../state/queue';
import { useStore } from '../../state/store';
import { joinJobs, summarise } from '../../state/selectors';
import { Button } from './primitives';

/**
 * On-device self test — the automation answer for platforms that cannot be
 * driven remotely (docs/12 D-68).
 *
 * WHY THIS EXISTS RATHER THAN A DEVICE HARNESS. iOS Safari cannot be automated
 * from Windows: Appium's driver and the iOS Simulator both require macOS, and
 * Playwright does not support real iOS devices. The one workable bridge,
 * `ios-webkit-debug-proxy`, needs `usbmuxd` (an iTunes install, admin rights), a
 * hand-built binary, AND still provides no synthetic input — the WebKit
 * inspector protocol has no Input domain, so you cannot tap.
 *
 * But tapping was never the requirement. This project's own e2e suite drives
 * conversions by assigning `input.files` and dispatching events in JS, not by
 * clicking. What is actually needed on the device is a JS execution context —
 * and the cheapest one available is the page itself.
 *
 * So: open this route on any device, tap once, read the result. No cable, no
 * proxy, no admin, no macOS — and it runs in the REAL engine rather than a
 * lookalike, which is the entire point. Playwright's WebKit has no
 * OffscreenCanvas at all (D-55), so it could never have caught D-67.
 *
 * The checks below are exactly the ones a real device found and automation
 * missed: D-55 (engine capability), D-61 (size delta reported with the correct
 * SIGN), D-67 (an install path exists on this platform).
 */

type Status = 'pass' | 'fail' | 'warn' | 'info';

interface Check {
  name: string;
  status: Status;
  detail: string;
}

const ICON: Record<Status, string> = { pass: '✓', fail: '✕', warn: '!', info: 'i' };
const COLOUR: Record<Status, string> = {
  pass: 'text-success',
  fail: 'text-danger',
  warn: 'text-warning',
  info: 'text-text-muted',
};

function engineChecks(): Check[] {
  const has = (ok: boolean, name: string, detail: string): Check => ({
    name,
    status: ok ? 'pass' : 'fail',
    detail,
  });

  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  return [
    // The D-55 check. Everything else is downstream of this one.
    has(
      typeof OffscreenCanvas !== 'undefined',
      'OffscreenCanvas',
      typeof OffscreenCanvas !== 'undefined'
        ? 'present — conversion is possible'
        : 'ABSENT — this engine cannot convert at all (Safari < 16.4)',
    ),
    has(typeof Worker !== 'undefined', 'Web Worker', 'required; all work happens off the main thread'),
    has(typeof WebAssembly !== 'undefined', 'WebAssembly', 'required for HEIC/AVIF decode'),
    has(
      typeof createImageBitmap !== 'undefined',
      'createImageBitmap',
      'required by every decode path',
    ),
    {
      name: 'Platform',
      status: 'info',
      detail:
        (isIos ? 'iOS/iPadOS' : 'not iOS') +
        (standalone ? ' · running as an installed app' : ' · running in the browser') +
        ' · ' +
        (navigator.hardwareConcurrency ?? '?') +
        ' cores',
    },
  ];
}

async function serviceWorkerChecks(): Promise<Check[]> {
  if (!('serviceWorker' in navigator)) {
    return [{ name: 'Service worker', status: 'fail', detail: 'unsupported in this engine' }];
  }
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (reg?.active === undefined || reg.active === null) {
    return [
      {
        name: 'Service worker',
        status: 'warn',
        detail: 'not registered yet — it activates a moment after first load; reload and re-run',
      },
    ];
  }

  const names = await caches.keys();
  const shell = names.find((n) => n.startsWith('keptpix-shell-'));
  const entries = shell === undefined ? 0 : (await (await caches.open(shell)).keys()).length;

  return [
    { name: 'Service worker', status: 'pass', detail: 'active — ' + reg.active.state },
    {
      name: 'Offline shell precached',
      // The manifest is 27 URLs; anything materially short means install did
      // not finish (docs/12 D-52's original symptom).
      status: entries >= 20 ? 'pass' : entries > 0 ? 'warn' : 'fail',
      detail: entries + ' entries cached' + (entries > 0 && entries < 20 ? ' — still filling' : ''),
    },
  ];
}

/** Generate a PNG in-page and run it through the REAL pipeline. */
async function pipelineChecks(store: typeof useStore): Promise<Check[]> {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return [{ name: 'Conversion', status: 'fail', detail: 'no 2d context' }];
  // Photographic-ish detail: a flat fill compresses to almost nothing and makes
  // the size comparison below meaningless.
  const gradient = ctx.createLinearGradient(0, 0, 400, 300);
  gradient.addColorStop(0, '#4f46e5');
  gradient.addColorStop(1, '#f59e0b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 300);
  for (let i = 0; i < 200; i += 1) {
    ctx.fillStyle = 'rgba(' + ((i * 31) % 255) + ',' + ((i * 77) % 255) + ',120,0.5)';
    ctx.fillRect((i * 37) % 400, (i * 53) % 300, 24, 24);
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (blob === null) return [{ name: 'Conversion', status: 'fail', detail: 'toBlob failed' }];

  const file = new File([blob], 'selftest.png', { type: 'image/png' });
  const { accepted, rejected } = await ingestFiles([file]);
  if (accepted.length === 0) {
    return [
      { name: 'Conversion', status: 'fail', detail: 'file rejected: ' + JSON.stringify(rejected) },
    ];
  }

  const controller = new QueueController(store);
  try {
    store.getState().addSources(accepted);
    const source = accepted[0];
    if (source === undefined) return [{ name: 'Conversion', status: 'fail', detail: 'no source' }];
    store.getState().setConfig({ outputFormat: 'jpeg', sizeMode: { kind: 'quality', quality: 82 } });
    store.getState().createJob(source.id, store.getState().configFor(source.id));
    await controller.start([source.id]);

    const view = joinJobs(store.getState().jobs, store.getState().sources)[0];
    const result = view?.job.result ?? null;
    if (result === null) {
      return [
        {
          name: 'Conversion',
          status: 'fail',
          detail: 'no result — ' + (view?.job.error?.code ?? 'unknown') + ': ' + (view?.job.error?.message ?? ''),
        },
      ];
    }

    const bitmap = await createImageBitmap(result.blob);
    const dimsOk = bitmap.width === 400 && bitmap.height === 300;
    bitmap.close();

    // The D-61 check: the SIGN of the reported delta must match reality. This
    // is what shipped wrong — a file that grew was reported as "0% ↓".
    const summary = summarise(joinJobs(store.getState().jobs, store.getState().sources));
    const actuallyGrew = result.sizeBytes > source.sizeBytes;
    const reportsGrowth = summary.savedPercent < 0;

    return [
      {
        name: 'Conversion (PNG → JPEG)',
        status: result.blob.type === 'image/jpeg' && dimsOk ? 'pass' : 'fail',
        detail:
          result.blob.type +
          ' · ' +
          result.dimensions.width +
          '×' +
          result.dimensions.height +
          ' · ' +
          Math.round(source.sizeBytes / 1024) +
          ' KB → ' +
          Math.round(result.sizeBytes / 1024) +
          ' KB',
      },
      {
        name: 'Size delta reported honestly (D-61)',
        status: actuallyGrew === reportsGrowth ? 'pass' : 'fail',
        detail:
          'file ' +
          (actuallyGrew ? 'grew' : 'shrank') +
          ', UI reports ' +
          summary.savedPercent.toFixed(1) +
          '% saved' +
          (actuallyGrew === reportsGrowth ? '' : ' — SIGN MISMATCH'),
      },
    ];
  } finally {
    await controller.dispose();
    store.getState().clearAll();
  }
}

/** D-67: some install path must exist for this platform. */
function installChecks(): Check[] {
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const hasEvent =
    (window as unknown as { __keptpix_installEvent?: unknown }).__keptpix_installEvent != null;

  if (standalone) {
    return [{ name: 'Install path (D-67)', status: 'pass', detail: 'already installed' }];
  }
  if (isIos) {
    return [
      {
        name: 'Install path (D-67)',
        status: 'pass',
        detail:
          'iOS — beforeinstallprompt never fires here, so the app shows ' +
          'Add-to-Home-Screen instructions instead. Confirm you can see them on a tool page ' +
          'after converting.',
      },
    ];
  }
  return [
    {
      name: 'Install path (D-67)',
      status: hasEvent ? 'pass' : 'warn',
      detail: hasEvent
        ? 'beforeinstallprompt captured — the Install button will appear after a conversion'
        : 'no beforeinstallprompt yet; the browser may not consider the site installable in this context',
    },
  ];
}

export default function SelfTest() {
  const store = useStore;
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setChecks([]);
    try {
      const engine = engineChecks();
      setChecks(engine);

      const sw = await serviceWorkerChecks();
      setChecks([...engine, ...sw]);

      // Only attempt a conversion if the engine can actually do one — otherwise
      // the failure is already reported above and this would just repeat it.
      const canConvert = typeof OffscreenCanvas !== 'undefined';
      const pipeline = canConvert
        ? await pipelineChecks(store)
        : [
            {
              name: 'Conversion',
              status: 'info' as Status,
              detail: 'skipped — no OffscreenCanvas, see above',
            },
          ];

      setChecks([...engine, ...sw, ...pipeline, ...installChecks()]);
      setRanAt(new Date().toLocaleTimeString());
    } catch (cause) {
      setChecks((prev) => [
        ...prev,
        {
          name: 'Self test crashed',
          status: 'fail',
          detail: cause instanceof Error ? cause.message : String(cause),
        },
      ]);
    } finally {
      setRunning(false);
    }
  }, [store]);

  // Auto-run once on mount: the point is to open the page and read a result.
  useEffect(() => {
    void run();
  }, [run]);

  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;

  const reportRef = useRef<HTMLTextAreaElement | null>(null);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');

  /**
   * Plain text, not JSON, and that is a decision rather than laziness.
   *
   * This gets pasted into a GitHub issue, an email or a Reddit comment. JSON
   * arrives there as an unreadable wall that the reader skips and the writer
   * cannot skim before sending — and "read it before you send it" is the entire
   * privacy proposition of this block. Plain lines survive being quoted.
   */
  const report = useMemo(() => {
    const device = store.getState().device;
    const codecs = store.getState().codecs;
    const lines = [
      'KeptPix self-test report',
      ranAt === null ? 'run: (not yet)' : 'run: ' + ranAt,
      'result: ' +
        (failed > 0 ? failed + ' failed' : warned > 0 ? warned + ' warning(s)' : 'all passed') +
        ' of ' +
        checks.length,
      '',
      'checks',
      ...checks.map((c) => '  [' + c.status.toUpperCase() + '] ' + c.name + ' — ' + c.detail),
      '',
      'environment',
      '  ua: ' + (typeof navigator === 'undefined' ? '(none)' : navigator.userAgent),
      '  hardwareConcurrency: ' + String(navigator.hardwareConcurrency ?? 'unknown'),
      '  devicePixelRatio: ' + String(globalThis.devicePixelRatio ?? 'unknown'),
      '  language: ' + (navigator.language ?? 'unknown'),
      '',
      'device profile (as the app resolved it)',
      ...Object.entries(device).map(([k, v]) => '  ' + k + ': ' + String(v)),
      '',
      'codec support (as probed, not assumed)',
      ...Object.entries(codecs).map(([k, v]) => '  ' + k + ': ' + String(v)),
      '',
      // PRECISE, because the first draft was not. It claimed "no image
      // dimensions", and the report plainly contains 400 and 300 — the
      // self-test's OWN generated image. True in spirit, false as written, which
      // is the D-91 and D-95 defect in miniature: copy that says slightly more
      // than the code does. Nobody would have been harmed and it would still have
      // been a lie in a block whose whole purpose is being trustworthy enough to
      // read before sending.
      'Everything above describes this browser and a 400x300 test image the page',
      'generated itself. No file of yours is named or measured here, and nothing',
      'was transmitted — the site has no way to transmit it.',
    ];
    return lines.join('\n');
  }, [checks, ranAt, failed, warned, store]);

  const copyReport = useCallback(async () => {
    // Feature-detected, and the fallback matters: the Clipboard API needs a
    // secure context AND permission, and WebKit refuses it often enough that a
    // dead button would be the common case rather than the rare one.
    try {
      if (typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(report);
        setCopied('ok');
        return;
      }
      throw new Error('no clipboard API');
    } catch {
      // Select the text so the user can copy it themselves. An honest fallback
      // beats a button that silently does nothing.
      reportRef.current?.select();
      setCopied('fail');
    }
  }, [report]);

  return (
    <div class="flex flex-col gap-4">
      <div
        role="status"
        class={
          'rounded-lg border p-4 ' +
          (running
            ? 'border-border bg-bg-subtle'
            : failed > 0
              ? 'border-danger bg-surface'
              : warned > 0
                ? 'border-warning bg-surface'
                : 'border-success bg-surface')
        }
      >
        <p class="m-0 text-lg font-semibold text-text">
          {running
            ? 'Running…'
            : failed > 0
              ? failed + ' check' + (failed === 1 ? '' : 's') + ' FAILED'
              : warned > 0
                ? 'Passed with ' + warned + ' warning' + (warned === 1 ? '' : 's')
                : 'All checks passed'}
        </p>
        {ranAt !== null && (
          <p class="num m-0 mt-1 text-xs text-text-muted">
            {checks.length} checks · {ranAt}
          </p>
        )}
      </div>

      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        {checks.map((c) => (
          <li key={c.name} class="rounded-md border border-border p-3">
            <p class="m-0 text-sm font-medium text-text">
              <span class={'mr-2 font-bold ' + COLOUR[c.status]} aria-hidden="true">
                {ICON[c.status]}
              </span>
              <span class="sr-only">{c.status}: </span>
              {c.name}
            </p>
            <p class="m-0 mt-1 text-xs text-text-muted">{c.detail}</p>
          </li>
        ))}
      </ul>

      {/*
        THE ONLY ERROR REPORTING THIS PRODUCT CAN HAVE.

        docs/06 §5 forbids any request with a body and any origin outside `self`,
        both release-blocking, so a crash in someone's browser is invisible to us
        by construction — `monitor.mjs` watches production from outside and cannot
        see a JavaScript exception (docs/12 D-98). An error reporter would trade
        the thing being sold for information about it.

        A block the user copies and sends BY HAND is the whole remaining design
        space, and it inverts the usual arrangement: they read it first, and
        nothing leaves the device unless they choose to send it.

        WHAT IS DELIBERATELY ABSENT: no filename, no file contents, no dimensions
        of anything they converted, no identifier of any kind. Capabilities and
        check results only — enough to reproduce a failure, nothing that describes
        the person or their files.
      */}
      <div class="rounded-lg border border-border bg-bg-subtle p-4">
        <p class="m-0 text-sm font-medium text-text">Reporting a problem</p>
        <p class="m-0 mt-1 text-xs text-text-muted">
          Nothing on this page is sent anywhere — the site has no way to send it.
          If something failed above, copy this and include it wherever you report
          the problem. Read it first: it describes this browser and a small test
          image the page made itself, and never a file of yours.
        </p>
        <textarea
          ref={reportRef}
          readOnly
          rows={8}
          aria-label="Diagnostic report, copy this into a bug report"
          value={report}
          class="num mt-3 w-full resize-y rounded-md border border-border bg-surface p-2 text-xs text-text"
          onClick={(event) => (event.currentTarget as HTMLTextAreaElement).select()}
        />
        <div class="mt-2 flex items-center gap-2">
          <Button variant="secondary" onClick={() => void copyReport()} disabled={running}>
            {copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Select it and copy' : 'Copy report'}
          </Button>
          {copied === 'fail' && (
            <span class="text-xs text-text-muted">
              This browser blocked the clipboard — the text is selected for you.
            </span>
          )}
        </div>
      </div>

      <div>
        <Button variant="secondary" onClick={() => void run()} disabled={running}>
          {running ? 'Running…' : 'Run again'}
        </Button>
      </div>
    </div>
  );
}
