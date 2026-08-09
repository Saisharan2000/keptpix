import { useEffect, useState } from 'react';

interface Props {
  file: File;
  /** Rendered size in CSS pixels. The decode is sized from this. */
  size?: number;
}

/**
 * A small preview of a file the user has added.
 *
 * WHY THIS EXISTS: the PDF builder listed pages as filenames, and phone
 * filenames are `IMG_4650.jpg`, `IMG_4651.jpg`, `IMG_4652.jpg`. Reordering
 * pages you cannot see is the core interaction of the tool, and doing it by
 * four-digit suffix is guesswork.
 *
 * NOT `<img src={URL.createObjectURL(file)}>`, which is the one-line version.
 * That makes the browser decode every image at FULL resolution to paint a 64px
 * box — forty 12 MP photos is roughly two gigabytes of decoded bitmaps, on the
 * device most likely to be holding forty photos. Instead the decode is asked
 * for at thumbnail size up front, and what is kept is a few KB per file.
 *
 * The object URL is owned by this component and revoked in the effect's
 * cleanup, so removing a row or unmounting the island releases it — CLAUDE.md:
 * revoke every object URL on unmount.
 *
 * Formats the browser cannot decode fall back to a labelled placeholder rather
 * than a broken image. HEIC is the one that matters: no browser decodes it
 * natively, and it is the format this product exists for, so it must degrade to
 * something deliberate.
 */
export function FileThumbnail({ file, size = 56 }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Guards against a slow decode resolving after the row has been removed,
    // which would create a URL nothing will ever revoke.
    let cancelled = false;
    let created: string | null = null;

    const build = async (): Promise<void> => {
      /*
       * NO OffscreenCanvas. This used to require it and bail to the placeholder
       * without it — which meant WebKit showed a grey box labelled "JPG" for
       * every page, on the exact interaction this component exists to provide
       * (docs/12 D-94). Measured: WebKit has `createImageBitmap` WITH the resize
       * options and does NOT have `OffscreenCanvas` at all.
       *
       * The requirement was pointless anyway. This is a component on the main
       * thread — there is no worker here, so an offscreen surface buys nothing a
       * detached <canvas> does not, and a detached <canvas> works everywhere.
       */
      if (typeof createImageBitmap === 'undefined') {
        setFailed(true);
        return;
      }
      let bitmap: ImageBitmap | null = null;
      try {
        // `resizeWidth` asks the decoder for a small bitmap directly, so a
        // 12 MP photo never exists at full size in memory. Devicepixel-aware so
        // it is not blurry on a phone, capped so it stays cheap.
        bitmap = await createImageBitmap(file, {
          resizeWidth: Math.round(size * Math.min(3, globalThis.devicePixelRatio || 1)),
          resizeQuality: 'low',
        });

        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (ctx === null) throw new Error('no 2d context');
        ctx.drawImage(bitmap, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', 0.7);
        });
        if (blob === null) throw new Error('toBlob produced nothing');

        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      } catch {
        // HEIC, AVIF on older engines, a corrupt file — all land here, and none
        // of them should stop the file being converted.
        if (!cancelled) setFailed(true);
      } finally {
        bitmap?.close();
      }
    };

    void build();

    return () => {
      cancelled = true;
      if (created !== null) URL.revokeObjectURL(created);
    };
  }, [file, size]);

  const box = { width: size + 'px', height: size + 'px' };

  if (url !== null) {
    return (
      <img
        src={url}
        // Decorative: the filename sits next to it and is the accessible name
        // for the row. Announcing "thumbnail of IMG_4650.jpg" as well would
        // just make a screen reader say everything twice.
        alt=""
        width={size}
        height={size}
        class="shrink-0 rounded border border-border bg-bg-subtle object-cover"
        style={box}
      />
    );
  }

  /** Extension as a label, which is more use than a broken-image icon. */
  const ext = (file.name.split('.').pop() ?? '').slice(0, 4).toUpperCase();

  return (
    <span
      aria-hidden="true"
      class="grid shrink-0 place-items-center rounded border border-border bg-bg-subtle text-[10px] font-medium text-text-muted"
      style={box}
    >
      {failed && ext.length > 0 ? ext : ''}
    </span>
  );
}
