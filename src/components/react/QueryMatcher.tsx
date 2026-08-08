import { useCallback, useMemo, useRef, useState } from 'react';
import { matchQuery, type QueryResult } from '../../core/query-match';
import { QUERY_EXAMPLES, QUERY_INDEX } from '../../content/query-index';

/** Below this, every query matches half the site and the list is noise. */
const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 5;

interface Props {
  /** Rendered above the field. Kept a prop so the homepage owns the wording. */
  label?: string;
}

/**
 * The on-site query matcher (docs/kepttools/04 §1 layer 2).
 *
 * Type what you want in your own words; get real routes back, phrased close to
 * what you typed, with settings prefilled. "compress a photo under 137kb"
 * resolves to the compressor with 137 KB already set, even though no 137 KB
 * route exists — that is the point, and it is why this is not a page per value.
 *
 * NOTHING LEAVES THE DEVICE. The index is a compile-time constant and matching
 * is a pure function, so there is no request to make. That is a product claim
 * as much as an implementation note: a privacy tool whose search box transmits
 * what you type is worse than one that is not private, because it is dishonest
 * about it. The form cannot submit either — `onSubmit` is prevented, so a
 * stray Enter never turns the query into a navigation with it in the URL.
 *
 * ORDINARY LINKS, not an ARIA combobox. The combobox pattern needs
 * `aria-activedescendant` bookkeeping that is easy to get subtly wrong, and
 * axe is a release gate here (docs/08 §6). A list of links is reachable by Tab
 * on every device, works with a screen reader without any of that, and needs no
 * JavaScript to be operable once rendered. ArrowDown is added on top as a
 * convenience, not as the only way in.
 */
export function QueryMatcher({ label = 'What do you want to do?' }: Props) {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  const results: QueryResult[] = useMemo(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) return [];
    return matchQuery(query, QUERY_INDEX, MAX_RESULTS);
  }, [query]);

  const searched = query.trim().length >= MIN_QUERY_LENGTH;

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown') return;
    const first = listRef.current?.querySelector<HTMLAnchorElement>('a');
    if (first === null || first === undefined) return;
    event.preventDefault();
    first.focus();
  }, []);

  return (
    <div class="w-full max-w-[46rem]">
      <form
        role="search"
        // No action, no method, and submission is stopped: the query must never
        // become a network request or land in a URL.
        onSubmit={(event) => event.preventDefault()}
      >
        <label for="query-matcher" class="block text-sm font-medium text-text">
          {label}
        </label>
        <input
          id="query-matcher"
          type="search"
          value={query}
          autoComplete="off"
          spellcheck={false}
          enterKeyHint="search"
          placeholder={QUERY_EXAMPLES[0]}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
          onKeyDown={onKeyDown}
          class="mt-2 min-h-12 w-full rounded-lg border border-border-strong bg-surface px-4 text-base text-text placeholder:text-text-muted"
        />
      </form>

      {/*
        Announced politely rather than assertively: a count that interrupts on
        every keystroke is worse than no announcement at all.
      */}
      <p role="status" aria-live="polite" class="sr-only">
        {searched
          ? results.length === 0
            ? 'No matching tools'
            : results.length + ' matching tool' + (results.length === 1 ? '' : 's')
          : ''}
      </p>

      {searched && results.length > 0 && (
        <ul ref={listRef} class="mt-3 flex list-none flex-col gap-1 p-0">
          {results.map((result) => (
            <li key={result.path}>
              <a
                href={result.path + (result.search ?? '')}
                class="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-base text-text no-underline hover:border-border-strong hover:bg-bg-subtle"
              >
                <span>{result.label}</span>
                <span aria-hidden="true" class="text-text-muted">
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {searched && results.length === 0 && (
        <p class="mt-3 mb-0 text-sm text-text-muted">
          Nothing matches that yet. The tools are{' '}
          <a href="/convert" class="font-medium text-accent">
            convert
          </a>
          ,{' '}
          <a href="/compress" class="font-medium text-accent">
            compress
          </a>
          ,{' '}
          <a href="/resize" class="font-medium text-accent">
            resize
          </a>
          ,{' '}
          <a href="/metadata" class="font-medium text-accent">
            metadata
          </a>{' '}
          and{' '}
          <a href="/pdf/from-images" class="font-medium text-accent">
            images to PDF
          </a>
          .
        </p>
      )}

      <p class="mt-3 mb-0 text-xs text-text-muted">
        Runs on your device. What you type here is never sent anywhere — there is
        no server to send it to.
      </p>
    </div>
  );
}
