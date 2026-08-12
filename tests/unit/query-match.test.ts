/**
 * tests/unit/query-match.test.ts
 *
 * The matcher has one failure mode that matters: confidently sending someone
 * to the wrong tool. Returning nothing is recoverable — the person reads the
 * page. Returning "Compress PDF" to someone who asked to convert a photo is
 * not, because they will click it.
 *
 * So most of these assert what must NOT be suggested, and the query strings are
 * written the way people actually type rather than as keyword soup.
 */
import { describe, it, expect } from 'vitest';
import {
  formatSize,
  matchQuery,
  normalise,
  parseSize,
  type QueryEntry,
} from '../../src/core/query-match';
import { QUERY_INDEX, QUERY_EXAMPLES } from '../../src/content/query-index';

const top = (query: string): string | undefined => matchQuery(query, QUERY_INDEX)[0]?.path;
const paths = (query: string): string[] => matchQuery(query, QUERY_INDEX).map((r) => r.path);

describe('normalise', () => {
  it('maps the words people use to the words routes use', () => {
    expect(normalise('my iPhone Photos')).toEqual(['heic', 'photo']);
    expect(normalise('JPEG')).toEqual(['jpg']);
    expect(normalise('shrink')).toEqual(['compress']);
    expect(normalise('combine')).toEqual(['merge']);
  });

  it('drops noise words that carry no signal', () => {
    expect(normalise('how do I convert this for free online')).toEqual(['convert']);
  });

  it('keeps direction words, so "a to b" stays distinguishable from "b to a"', () => {
    // Dropping 'to' would be fine; dropping the formats would not. This is the
    // guard against over-aggressive stopwording collapsing opposite intents.
    expect(normalise('png to jpg')).toContain('png');
    expect(normalise('png to jpg')).toContain('jpg');
  });

  it('survives punctuation, emoji and empty input', () => {
    expect(normalise('')).toEqual([]);
    expect(normalise('!!! ??? ...')).toEqual([]);
    expect(normalise('heic -> jpg, please!')).toEqual(['heic', 'jpg']);
  });
});

describe('parseSize', () => {
  it('reads the phrasings people use', () => {
    expect(parseSize('under 150kb')).toBe(150 * 1024);
    expect(parseSize('compress to 2 MB')).toBe(2 * 1024 * 1024);
    expect(parseSize('1.5mb')).toBe(Math.round(1.5 * 1024 * 1024));
    expect(parseSize('100 k')).toBe(100 * 1024);
  });

  it('requires a unit, because a bare number is usually not a size', () => {
    // "resize to 1920" is a width. "10 pages" is a count. Guessing a target
    // the user never asked for is worse than not prefilling one.
    expect(parseSize('resize to 1920')).toBeNull();
    expect(parseSize('merge 10 files')).toBeNull();
    expect(parseSize('2026')).toBeNull();
  });

  it('is not fooled by a dimension pair', () => {
    expect(parseSize('1920x1080')).toBeNull();
    // ...but still finds a real size alongside one.
    expect(parseSize('resize to 1920x1080 under 500kb')).toBe(500 * 1024);
  });

  it('rejects sizes outside what any tool can target', () => {
    expect(parseSize('5 gb')).toBeNull();
    expect(parseSize('0.5 kb')).toBeNull();
    expect(parseSize('0 mb')).toBeNull();
  });

  it('round-trips through formatSize readably', () => {
    expect(formatSize(150 * 1024)).toBe('150 KB');
    expect(formatSize(2 * 1024 * 1024)).toBe('2 MB');
    expect(formatSize(Math.round(1.5 * 1024 * 1024))).toBe('1.5 MB');
  });
});

describe('matchQuery — the queries this exists for', () => {
  it('handles a full natural-language sentence', () => {
    expect(top('I want to convert my iphone images to JPEG')).toBe('/convert/heic-to-jpg');
  });

  it('handles the same intent in keyword form', () => {
    expect(top('heic to jpg')).toBe('/convert/heic-to-jpg');
  });

  it('routes an arbitrary size to the generic compressor, prefilled', () => {
    // No 137 KB route exists and none should — this is the infinite tail that
    // layer 2 covers instead of a page per value.
    const [best] = matchQuery('compress a photo under 137kb', QUERY_INDEX);
    expect(best?.path).toBe('/compress');
    expect(best?.search).toBe('?target=' + 137 * 1024);
    expect(best?.label).toBe('Compress an image to 137 KB');
  });

  it('prefers the exact preset route when the size has one', () => {
    expect(paths('compress jpg to 100kb')).toContain('/compress/jpg-to-100kb');
  });

  it('finds the PDF builder from what people call it', () => {
    expect(top('turn my screenshots into one pdf')).toBe('/pdf/from-images');
    expect(top('combine photos into a pdf')).toBe('/pdf/from-images');
  });

  it('finds metadata stripping from the privacy phrasing', () => {
    expect(top('remove gps location from my photos')).toBe('/metadata');
  });

  it('never leaves a label with an unfilled placeholder', () => {
    // '{size}' reaching the DOM is the D-27 class of bug: visible, wrong, and
    // nobody re-reads a suggestion list.
    for (const query of [...QUERY_EXAMPLES, 'compress', 'convert', 'pdf', 'resize to 800px']) {
      for (const result of matchQuery(query, QUERY_INDEX)) {
        expect(result.label, query).not.toContain('{');
        expect(result.label, query).not.toContain('}');
        expect(result.label.trim(), query).toBe(result.label);
        expect(result.label, query).not.toContain('  ');
      }
    }
  });

  it('answers every example it advertises', () => {
    // The examples are shown as placeholder text. One that returns nothing
    // teaches the user the box does not work.
    for (const example of QUERY_EXAMPLES) {
      expect(matchQuery(example, QUERY_INDEX).length, example).toBeGreaterThan(0);
    }
  });
});

describe('matchQuery — what must NOT be suggested', () => {
  it('does not offer the PDF builder for an image conversion', () => {
    expect(paths('convert my photos to jpg')).not.toContain('/pdf/from-images');
  });

  it('does not offer image compression for a PDF request', () => {
    // Once /pdf/compress ships this should find it; today the honest answer is
    // to not pretend the image compressor will do it.
    expect(paths('compress my pdf to 200kb')).not.toContain('/compress');
    expect(paths('compress my pdf to 200kb')).not.toContain('/compress/jpg-to-200kb');
  });

  it('returns nothing for input with no signal at all', () => {
    for (const query of ['', '   ', 'hello there', 'asdfgh', '?????']) {
      expect(matchQuery(query, QUERY_INDEX), JSON.stringify(query)).toEqual([]);
    }
  });

  it('only ever suggests routes that exist', () => {
    // The index is derived from published route data precisely so this holds.
    const published = new Set(QUERY_INDEX.map((entry) => entry.path));
    for (const example of QUERY_EXAMPLES) {
      for (const result of matchQuery(example, QUERY_INDEX)) {
        expect(published.has(result.path), result.path).toBe(true);
      }
    }
  });

  it('respects the limit and orders deterministically', () => {
    const results = matchQuery('convert photo image jpg png', QUERY_INDEX, 3);
    expect(results.length).toBeLessThanOrEqual(3);
    const again = matchQuery('convert photo image jpg png', QUERY_INDEX, 3);
    expect(results.map((r) => r.path)).toEqual(again.map((r) => r.path));
  });

  it('scores by matched terms, with required tokens weighted', () => {
    const entries: QueryEntry[] = [
      { path: '/a', label: 'A', terms: ['convert', 'jpg'] },
      { path: '/b', label: 'B', terms: ['convert', 'jpg'], must: ['jpg'] },
    ];
    const [first] = matchQuery('convert jpg', entries);
    expect(first?.path).toBe('/b');
  });

  it('skips an entry whose required token is absent, however well it scores', () => {
    const entries: QueryEntry[] = [
      { path: '/pdf', label: 'PDF', terms: ['convert', 'photo', 'image'], must: ['pdf'] },
    ];
    expect(matchQuery('convert photo image', entries)).toEqual([]);
  });
});

/*
 * DIRECTION AND VOCABULARY — docs/12 D-112.
 *
 * These two bugs lived under 414 passing tests. Both were found by running real
 * search queries through the production matcher (scripts/keywords.mjs), not by
 * any assertion in this file, so the assertions are here now.
 *
 * Every case below was OBSERVED FAILING against the pre-fix matcher. A regression
 * test that has only ever been green is a test that might assert nothing — two of
 * this project's own regression tests passed against the bugs they were written
 * for (D-91, D-93).
 */
describe('matchQuery — direction', () => {
  it('answers a reciprocal pair with the direction that was asked for', () => {
    // Both entries list both format tokens and each requires its own source, so
    // these tied at score 3 and `localeCompare` on the path picked the winner:
    // "webp to png" was answered with the PNG→WebP converter.
    expect(top('webp to png')).toBe('/convert/webp-to-png');
    expect(top('png to webp')).toBe('/convert/png-to-webp');
  });

  it('ranks the reverse converter BELOW the one that was asked for', () => {
    const results = matchQuery('webp to png', QUERY_INDEX, 5);
    const forward = results.findIndex((r) => r.path === '/convert/webp-to-png');
    const reverse = results.findIndex((r) => r.path === '/convert/png-to-webp');
    expect(forward).toBe(0);
    // Present but demoted, not removed: it is the closest thing that exists.
    if (reverse !== -1) expect(reverse).toBeGreaterThan(forward);
  });

  it('does not invent a direction the query never stated', () => {
    // Naming one format only. Nothing here says which way round, so the order
    // rule must not fire — guessing would be worse than the tie it replaced.
    expect(paths('convert my heic')).toContain('/convert/heic-to-jpg');
  });
});

describe('matchQuery — format vocabulary', () => {
  it('can reach every published convert route from a plain query', () => {
    // /convert/jpg-to-webp was UNREACHABLE: route data spells the format `jpeg`,
    // normalise() folds every spelling to `jpg`, so `must: ['jpeg']` required a
    // token no query could produce. "jpg to webp" returned /convert/webp-to-jpg,
    // the exact reverse.
    for (const entry of QUERY_INDEX) {
      for (const required of entry.must ?? []) {
        expect(normalise(required), `${entry.path} requires "${required}"`).toEqual([required]);
      }
    }
  });

  it('routes jpg-to-webp, the route that was unreachable', () => {
    expect(top('jpg to webp')).toBe('/convert/jpg-to-webp');
    expect(top('jpeg to webp')).toBe('/convert/jpg-to-webp');
    expect(top('convert jpg to webp')).toBe('/convert/jpg-to-webp');
  });

  it('suggests nothing rather than a converter for a format it cannot read', () => {
    // "avif to jpg" satisfied must:['jpg'] on the JPG→WebP entry, because the
    // query names jpg as its DESTINATION. There is no AVIF pair route, so the
    // honest answer is nothing.
    expect(matchQuery('avif to jpg', QUERY_INDEX)).toEqual([]);
  });

  it('does not offer an output format the query ruled out', () => {
    expect(paths('convert png to jpg')).not.toContain('/convert/png-to-webp');
  });
});

describe('the index itself', () => {
  it('has no duplicate paths', () => {
    const paths_ = QUERY_INDEX.map((e) => e.path);
    expect(new Set(paths_).size).toBe(paths_.length);
  });

  it('gives every entry at least one term', () => {
    for (const entry of QUERY_INDEX) {
      expect(entry.terms.length, entry.path).toBeGreaterThan(0);
    }
  });

  it('only marks an entry takesSize when its label can show one', () => {
    for (const entry of QUERY_INDEX) {
      if (entry.takesSize === true) {
        expect(entry.label, entry.path).toContain('{size}');
      } else {
        expect(entry.label, entry.path).not.toContain('{size}');
      }
    }
  });

  it('stays small enough to ship with the page', () => {
    // Layer 2's whole premise is that the index costs a few KB, not a request.
    const bytes = new TextEncoder().encode(JSON.stringify(QUERY_INDEX)).length;
    expect(bytes).toBeLessThan(16 * 1024);
  });
});
