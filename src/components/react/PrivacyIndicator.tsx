interface Props {
  processed: number;
  total: number;
}

/**
 * docs/08 §5: persistent, low-emphasis, and deliberately understated. A large
 * trust badge reads as marketing; a quiet factual line reads as true.
 */
export function PrivacyIndicator({ processed, total }: Props) {
  return (
    <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-4 py-3 text-xs text-text-muted">
      <span aria-hidden="true">🔒</span>
      Processing locally · 0 bytes sent
      {total > 0 && (
        <span class="num">
          · {processed} of {total} processed on this device
        </span>
      )}
      <a href="/how-it-works" class="ml-auto font-medium text-accent">
        How to verify this →
      </a>
    </p>
  );
}
