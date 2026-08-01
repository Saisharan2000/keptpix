import { useEffect, useState } from 'react';

/**
 * Object URL bound to the component's lifetime.
 *
 * docs/07 §4: "Revoke every object URL on unmount." A leaked URL pins its blob
 * forever, and blobs here are decoded images — this is the top memory-leak
 * source in this class of app (docs/05 §4 invariant 1).
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob === null || blob === undefined) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [blob]);

  return url;
}
