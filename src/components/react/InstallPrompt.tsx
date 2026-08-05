import { useEffect, useState } from 'react';
import { Button } from './primitives';

/**
 * Not a standard lib.dom.d.ts type — Safari and Firefox do not implement
 * this event at all, which is why the Chromium path below is only one of two.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

function getStashedEvent(): BeforeInstallPromptEvent | null {
  const w = window as unknown as { __keptpix_installEvent?: BeforeInstallPromptEvent | null };
  return w.__keptpix_installEvent ?? null;
}

/**
 * Already running as an installed app, so there is nothing to offer.
 *
 * Two checks because they cover different browsers: `display-mode: standalone`
 * is the standard signal, `navigator.standalone` is Safari's older
 * iOS-specific one and is the only reliable answer on older iOS versions.
 */
function isInstalled(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * iOS/iPadOS, where installation exists but is entirely manual.
 *
 * iPadOS reports itself as "MacIntel" and deliberately masquerades as desktop
 * Safari, so the platform string alone is not enough — a Mac with a touch
 * screen does not exist, which makes `maxTouchPoints > 1` the distinguishing
 * signal. UA sniffing is a last resort generally, but there is no feature to
 * detect here: the whole problem is the ABSENCE of an API.
 */
function isIos(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

interface Props {
  /** True only once at least one conversion has actually completed (docs/10 M8). */
  eligible: boolean;
}

/**
 * Two install paths, because there are genuinely two.
 *
 * CHROMIUM: BaseLayout.astro's inline script captures `beforeinstallprompt` on
 * `window` and calls `preventDefault()` immediately, so the browser's own
 * mini-infobar never appears on arrival. This component is the ONLY place that
 * event is replayed via `.prompt()`, gated on `eligible`, so "never before a
 * successful conversion" holds regardless of when the browser decided the site
 * was installable.
 *
 * iOS SAFARI: `beforeinstallprompt` is Chromium-only and will never fire here.
 * This component previously rendered nothing at all in that case — which meant
 * iPhone users got no install affordance whatsoever, on a tool whose flagship
 * route is HEIC→JPG and whose most likely visitor is therefore holding an
 * iPhone. Found by testing on a real device, where the Install button simply
 * never appeared (docs/12 D-67). iOS can install a PWA, it just cannot be asked
 * programmatically, so the honest equivalent is telling the user where the
 * control is.
 */
export function InstallPrompt({ eligible }: Props) {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    setEvent(getStashedEvent());
    const onAvailable = (): void => setEvent(getStashedEvent());
    window.addEventListener('keptpix:install-available', onAvailable);

    // Decided once on mount: neither answer can change within a page view.
    setIosHint(isIos() && !isInstalled());

    return () => window.removeEventListener('keptpix:install-available', onAvailable);
  }, []);

  if (!eligible) return null;

  if (event !== null) {
    return (
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
        <p class="m-0 text-xs text-text-muted">Install KeptPix for faster access next time.</p>
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

  if (iosHint) {
    return (
      <div class="border-t border-border px-4 py-3">
        <p class="m-0 text-xs text-text-muted">
          {/*
            Named controls rather than "install this app": on iOS the Share
            control is an icon with no label, so telling someone to "install"
            leaves them hunting. The share glyph is described in words for the
            same reason.
          */}
          Add KeptPix to your home screen: tap <span aria-hidden="true">⎋</span>{' '}
          <strong class="font-medium text-text">Share</strong> at the bottom of Safari, then{' '}
          <strong class="font-medium text-text">Add to Home Screen</strong>. It then works offline,
          with no App Store and no account.
        </p>
      </div>
    );
  }

  return null;
}
