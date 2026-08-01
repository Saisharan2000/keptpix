import { useEffect, useState } from 'react';
import { Button } from './primitives';

/**
 * Not a standard lib.dom.d.ts type — Safari and Firefox do not implement
 * this event at all, which is exactly why this whole component degrades to
 * rendering nothing rather than assuming the API exists.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

function getStashedEvent(): BeforeInstallPromptEvent | null {
  const w = window as unknown as { __noupload_installEvent?: BeforeInstallPromptEvent | null };
  return w.__noupload_installEvent ?? null;
}

interface Props {
  /** True only once at least one conversion has actually completed (docs/10 M8). */
  eligible: boolean;
}

/**
 * BaseLayout.astro's inline script captures `beforeinstallprompt` on
 * `window` — a page-level event with no relationship to any one island — and
 * calls `preventDefault()` immediately so the browser's own mini-infobar
 * never appears on arrival. This component is the ONLY place that event is
 * ever replayed via `.prompt()`, gated on `eligible`, so "never before a
 * successful conversion" holds regardless of when the browser itself decided
 * the site was installable.
 */
export function InstallPrompt({ eligible }: Props) {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setEvent(getStashedEvent());
    const onAvailable = (): void => setEvent(getStashedEvent());
    window.addEventListener('noupload:install-available', onAvailable);
    return () => window.removeEventListener('noupload:install-available', onAvailable);
  }, []);

  if (!eligible || event === null) return null;

  return (
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
      <p class="m-0 text-xs text-text-muted">Install NoUpload for faster access next time.</p>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          // A BeforeInstallPromptEvent is single-use regardless of the user's
          // choice — the browser will not honour a second .prompt() call on
          // it, so this hides the affordance rather than leaving a dead button.
          void event.prompt();
          setEvent(null);
        }}
      >
        Install
      </Button>
    </div>
  );
}
