/**
 * tests/unit/pdf-pages.test.ts
 *
 * Page selection is where a PDF tool loses someone's pages, and it does it
 * silently: a document that is missing page 7 looks like a document. So the
 * cases that matter most here are the malformed and off-by-one ones, not the
 * happy path.
 */
import { describe, it, expect } from 'vitest';
import {
  allPageIndices,
  describeSelection,
  normaliseAngle,
  parsePageSelection,
  resolvePageIndices,
  selectedIndicesOrAll,
} from '../../src/core/pdf/pages';

/** One-based pages, for readability in expectations. */
const pages = (input: string, count = 12): number[] =>
  resolvePageIndices(parsePageSelection(input, count)).map((i) => i + 1);

describe('parsePageSelection — what people type', () => {
  it('reads a single page', () => {
    expect(pages('5')).toEqual([5]);
  });

  it('reads a range', () => {
    expect(pages('2-4')).toEqual([2, 3, 4]);
  });

  it('reads a mixed list', () => {
    expect(pages('1-3, 7, 9-12')).toEqual([1, 2, 3, 7, 9, 10, 11, 12]);
  });

  it('tolerates whitespace and stray commas', () => {
    expect(pages('  1 - 3 ,, 7 ,')).toEqual([1, 2, 3, 7]);
  });

  it('accepts the en dash people paste from documents', () => {
    expect(pages('2–4')).toEqual([2, 3, 4]);
    expect(pages('2—4')).toEqual([2, 3, 4]);
  });

  it('accepts a backwards range, because the intent is unambiguous', () => {
    expect(pages('7-3')).toEqual([3, 4, 5, 6, 7]);
  });

  it('reads open-ended ranges the way they are meant', () => {
    expect(pages('9-')).toEqual([9, 10, 11, 12]);
    expect(pages('-3')).toEqual([1, 2, 3]);
  });

  it('collapses overlaps instead of repeating a page', () => {
    // A document with page 4 twice is not what "1-5, 3-7" asks for.
    expect(pages('1-5, 3-7')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns pages in document order however they were typed', () => {
    expect(pages('9, 2, 5')).toEqual([2, 5, 9]);
  });

  it('clamps a range that runs past the end', () => {
    // "1-100" on a 12-page PDF plainly means all of it.
    expect(pages('1-100')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('parsePageSelection — what must be reported, not swallowed', () => {
  it('reports unparseable fragments verbatim', () => {
    // "1-3, foo, 7" quietly becoming 1-3 and 7 is a wrong document the user
    // cannot see. The fragment comes back so the UI can say what it ignored.
    const result = parsePageSelection('1-3, foo, 7', 12);
    expect(result.invalid).toEqual(['foo']);
    expect(resolvePageIndices(result).map((i) => i + 1)).toEqual([1, 2, 3, 7]);
  });

  it('rejects page zero rather than nudging it to one', () => {
    // "0-5" is more likely a misunderstanding than a typo, and silently
    // widening a selection is worse than saying it was not understood.
    expect(parsePageSelection('0', 12).invalid).toEqual(['0']);
    expect(parsePageSelection('0-5', 12).invalid).toEqual(['0-5']);
  });

  it('rejects a range that starts past the end of the document', () => {
    expect(parsePageSelection('20-30', 12).invalid).toEqual(['20-30']);
  });

  it('rejects a bare dash and other empty nonsense', () => {
    for (const input of ['-', ' - ', 'abc', '1..3', '1/3']) {
      expect(parsePageSelection(input, 12).invalid.length, input).toBeGreaterThan(0);
    }
  });

  it('rejects numbers too large to be a page', () => {
    expect(parsePageSelection('99999999999999999999', 12).invalid.length).toBeGreaterThan(0);
  });

  it('returns nothing at all for a zero-page document', () => {
    const result = parsePageSelection('1-3', 0);
    expect(result.ranges).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('treats empty input as an empty selection, not an error', () => {
    for (const input of ['', '   ', ',', ',,']) {
      const result = parsePageSelection(input, 12);
      expect(result.ranges, JSON.stringify(input)).toEqual([]);
      expect(result.invalid, JSON.stringify(input)).toEqual([]);
    }
  });
});

describe('selectedIndicesOrAll — empty means everything, once', () => {
  it('expands empty input to every page', () => {
    // The manifest promises this for rotate: "Leave empty to rotate every page".
    expect(selectedIndicesOrAll('', 4).indices).toEqual([0, 1, 2, 3]);
  });

  it('does not confuse "everything" with "nothing"', () => {
    expect(selectedIndicesOrAll('', 3).indices.length).toBe(3);
    // A selection that parsed to nothing usable is still not everything.
    const onlyInvalid = selectedIndicesOrAll('abc', 3);
    expect(onlyInvalid.invalid).toEqual(['abc']);
    expect(onlyInvalid.indices).toEqual([0, 1, 2]);
  });

  it('passes invalid fragments through', () => {
    expect(selectedIndicesOrAll('1, nope', 5).invalid).toEqual(['nope']);
  });

  it('is zero-based on the way out, one-based on the way in', () => {
    // The single conversion point. Getting this wrong loses the first or last
    // page of every document.
    expect(selectedIndicesOrAll('1', 5).indices).toEqual([0]);
    expect(selectedIndicesOrAll('5', 5).indices).toEqual([4]);
  });
});

describe('allPageIndices', () => {
  it('counts from zero', () => {
    expect(allPageIndices(3)).toEqual([0, 1, 2]);
  });

  it('survives nonsense counts', () => {
    expect(allPageIndices(0)).toEqual([]);
    expect(allPageIndices(-5)).toEqual([]);
    expect(allPageIndices(2.7)).toEqual([0, 1]);
  });
});

describe('normaliseAngle', () => {
  it('passes through the three the UI offers', () => {
    expect(normaliseAngle('90')).toBe(90);
    expect(normaliseAngle('180')).toBe(180);
    expect(normaliseAngle('270')).toBe(270);
  });

  it('wraps negatives and over-rotations', () => {
    expect(normaliseAngle(-90)).toBe(270);
    expect(normaliseAngle(450)).toBe(90);
    expect(normaliseAngle(360)).toBe(0);
  });

  it('snaps to the nearest quarter turn', () => {
    expect(normaliseAngle(89)).toBe(90);
    expect(normaliseAngle(100)).toBe(90);
  });

  it('falls back to 90 rather than NaN', () => {
    expect(normaliseAngle('nonsense')).toBe(90);
    expect(normaliseAngle(undefined)).toBe(90);
  });
});

describe('describeSelection', () => {
  it('says what will happen in words a person reads', () => {
    expect(describeSelection([], 10)).toBe('no pages');
    expect(describeSelection([0], 10)).toBe('page 1');
    expect(describeSelection([0, 1, 2], 10)).toBe('3 pages');
    expect(describeSelection([0, 1, 2], 3)).toBe('all 3 pages');
  });
});
