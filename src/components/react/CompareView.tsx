import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, Slider, useObjectUrl } from './primitives';

interface Props {
  originalBlob: Blob;
  outputBlob: Blob;
  filename: string;
  onClose: () => void;
}

const ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const;

/**
 * Original vs output, per docs/10 M8: draggable divider + zoom.
 *
 * WCAG 2.5.7 (Dragging Movements) is why the divider is NOT drag-only. The
 * range input below the image is the same control, not a lesser fallback: it
 * is keyboard-operable, carries the accessible name, and moving either one
 * moves the same `split` state. Pointer drag is the enhancement.
 *
 * The overlay is a true clip-based wipe rather than two side-by-side images,
 * because the point is judging COMPRESSION artefacts — differences of a few
 * pixels that are invisible unless the two images occupy the exact same
 * screen position at the exact same scale.
 */
export function CompareView({ originalBlob, outputBlob, filename, onClose }: Props) {
  const originalUrl = useObjectUrl(originalBlob);
  const outputUrl = useObjectUrl(outputBlob);

  const [split, setSplit] = useState(50);
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;

  const dialogRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const sliderId = useId();

  // Escape closes, and focus starts inside the dialog rather than wherever the
  // trigger left it — without this a screen reader stays on the Compare button
  // behind the modal and never discovers the dialog opened at all. The dialog
  // container takes focus rather than the Close button: Button declares its
  // props explicitly and forwards no ref by design, and widening that shared
  // primitive for one call site is the worse trade.
  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const setSplitFromClientX = useCallback((clientX: number): void => {
    const frame = frameRef.current;
    if (frame === null) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(100, Math.max(0, ratio)));
  }, []);

  // Pointer events (not mouse+touch pairs) so pen and touch work identically,
  // and setPointerCapture so a fast drag that leaves the element still tracks.
  const onPointerDown = useCallback(
    (event: PointerEvent): void => {
      const target = event.currentTarget as HTMLElement | null;
      target?.setPointerCapture(event.pointerId);
      setSplitFromClientX(event.clientX);
    },
    [setSplitFromClientX],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent): void => {
      // buttons is a bitmask: 0 means "moving with nothing pressed", which is
      // a hover, not a drag.
      if (event.buttons === 0) return;
      setSplitFromClientX(event.clientX);
    },
    [setSplitFromClientX],
  );

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* A real <button>, not a div with onClick: click-to-dismiss then comes
          with keyboard and screen-reader support for free, instead of needing
          a hand-rolled key handler that only ever half-matches the native one.
          Escape closes too, via the document listener above. */}
      <button
        type="button"
        aria-label="Close compare"
        onClick={onClose}
        class="absolute inset-0 h-full w-full cursor-default bg-[rgb(16_22_28/0.55)]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={'Compare ' + filename}
        tabIndex={-1}
        // `relative` is load-bearing: the backdrop is absolutely positioned,
        // so without it this panel (static) paints UNDER the backdrop and
        // every control inside becomes unclickable.
        class="relative flex max-h-full w-[min(1040px,100%)] flex-col overflow-hidden rounded-lg bg-surface shadow-lg outline-none"
      >
        <header class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 class="m-0 truncate text-sm font-semibold text-text">{filename}</h2>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
              aria-label="Zoom out"
            >
              −
            </Button>
            <span class="num min-w-[3ch] text-center text-xs text-text-muted" aria-live="polite">
              {zoom}×
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              aria-label="Zoom in"
            >
              +
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-auto bg-bg-muted p-4">
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            class="relative mx-auto max-w-full touch-none overflow-hidden select-none"
            style={{ width: zoom === 1 ? '100%' : zoom * 100 + '%' }}
          >
            {/* Output underneath, full width. */}
            {outputUrl !== null && (
              <img src={outputUrl} alt="Converted output" class="block w-full bg-bg" />
            )}
            {/* Original clipped on top — same box, same scale, so the two
                align pixel-for-pixel as the divider moves. */}
            {originalUrl !== null && (
              <img
                src={originalUrl}
                alt="Original"
                aria-hidden="true"
                class="absolute inset-0 block h-full w-full bg-bg"
                style={{ clipPath: 'inset(0 ' + (100 - split) + '% 0 0)' }}
              />
            )}
            <div
              class="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
              style={{ left: split + '%' }}
              aria-hidden="true"
            />
          </div>
        </div>

        <div class="flex items-center gap-3 border-t border-border px-4 py-3">
          <span class="shrink-0 text-xs text-text-muted">Original</span>
          {/* The accessible, keyboard-operable equal of the drag (WCAG 2.5.7). */}
          <Slider
            id={sliderId}
            value={Math.round(split)}
            min={0}
            max={100}
            ariaLabel={'Compare position, ' + Math.round(split) + '% original'}
            onChange={setSplit}
          />
          <span class="shrink-0 text-xs text-text-muted">Converted</span>
        </div>
      </div>
    </div>
  );
}
