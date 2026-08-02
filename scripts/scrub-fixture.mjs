#!/usr/bin/env node
/**
 * scripts/scrub-fixture.mjs — WO-7.
 *
 * Strip identifying metadata from a HEIC so it can be committed as a test
 * fixture, WITHOUT destroying the two things that make it worth committing.
 *
 *   node scripts/scrub-fixture.mjs in.HEIC out.HEIC
 *
 * WHY THIS IS NOT `exiftool -all=`:
 *
 * The fixtures caught docs/12 D-30 (EXIF orientation arriving as the string
 * 'Rotate 90 CW', not 6 — so every real photo was read as upright) and D-34
 * (a portrait HEIC coming out landscape because the container transform and
 * the EXIF tag were BOTH applied). Neither bug is reachable with a synthetic
 * file, and neither is reachable with a fixture whose orientation data has
 * been stripped. A blanket scrub produces a file that tests nothing.
 *
 * So this REMOVES: GPS (the actual privacy problem — coordinates accurate to
 * a few metres), camera serial numbers, owner/artist names, and capture
 * timestamps. It PRESERVES: EXIF `Orientation`, and the HEIF container's own
 * `irot`/`imir` transform properties, which live in the ISOBMFF boxes rather
 * than in EXIF and which libheif honours during decode.
 *
 * Requires `exiftool` on PATH (https://exiftool.org). It is the only tool that
 * edits HEIF metadata in place without re-encoding the image — and re-encoding
 * would defeat the purpose, since a re-encode is exactly what stripped the
 * metadata off the original fixtures in the first place (docs/12 D-32).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [input, output] = args;

/**
 * `--with-synthetic-metadata` re-adds GPS after scrubbing — with coordinates that
 * are deliberately, verifiably NOT the photographer's.
 *
 * The point of a committed fixture is CI coverage, and one of the things worth
 * covering is GPS DETECTION — the privacy demonstration in docs/02 §5, where
 * the app shows someone the coordinates sitting inside their own photo. A
 * fixture with no GPS cannot test that, and a fixture with REAL GPS cannot be
 * published. Synthetic coordinates satisfy both.
 *
 * Greenwich Observatory, not (0, 0): Null Island is normalised away or treated
 * as "absent" by enough tooling that it would test the wrong thing, and
 * `hasGps` keys off presence rather than truthiness. This is a famous public
 * landmark that is obviously nobody's home.
 */
const SYNTHETIC_GPS = { lat: 51.4778, latRef: 'N', lon: 0.0015, lonRef: 'W' };
/**
 * A capture timestamp is identifying too — it says when someone was somewhere.
 * Stripped with everything else, then replaced with an obviously synthetic
 * date so `dateTaken` extraction stays testable in CI.
 */
const SYNTHETIC_DATE = '2020:01:01 00:00:00';
const withSynthetic = process.argv.includes('--with-synthetic-metadata');

if (input === undefined || output === undefined) {
  console.error('usage: node scripts/scrub-fixture.mjs <in.HEIC> <out.HEIC>');
  process.exit(2);
}
if (!existsSync(input)) {
  console.error('input not found: ' + input);
  process.exit(2);
}

function exiftool(args) {
  return execFileSync('exiftool', args, { encoding: 'utf8' });
}

try {
  exiftool(['-ver']);
} catch {
  console.error(
    'exiftool is required and was not found on PATH.\n' +
      '  Windows: winget install -e --id OliverBetz.ExifTool\n' +
      '  macOS:   brew install exiftool\n' +
      '  Linux:   apt-get install libimage-exiftool-perl',
  );
  process.exit(2);
}

console.log('scrubbing ' + basename(input) + ' -> ' + basename(output));

// Work on a copy so the original is never modified.
copyFileSync(input, output);

/**
 * Targeted removals only. Each entry is a real identifier, not "metadata" in
 * the abstract — and Orientation is conspicuously absent by design.
 */
const REMOVE = [
  '-gps:all=',
  '-xmp:geotag=',
  '-SerialNumber=',
  '-InternalSerialNumber=',
  '-LensSerialNumber=',
  '-BodySerialNumber=',
  '-OwnerName=',
  '-Artist=',
  '-Copyright=',
  '-CreatorTool=',
  '-DateTimeOriginal=',
  '-CreateDate=',
  '-ModifyDate=',
  '-SubSecDateTimeOriginal=',
  /**
   * The whole Apple MakerNote block.
   *
   * Not paranoia — the first run of this script left
   * `[Apple] PhotoIdentifier: A35159F9-…` intact, a UUID that uniquely
   * identifies the photo inside its owner's library. It was caught by dumping
   * every surviving tag and grepping for identifiers, NOT by the script's own
   * success message, which happily reported a clean scrub.
   *
   * Removing the block wholesale rather than naming PhotoIdentifier: Apple
   * ships dozens of undocumented MakerNote fields and adds more each iOS
   * release, so an allowlist of known-bad tags is a race this script cannot
   * win. Orientation is unaffected — it lives in IFD0 and in the container's
   * own irot/imir boxes, not in MakerNote.
   */
  '-MakerNotes:all=',
];

exiftool([...REMOVE, '-overwrite_original', output]);

if (withSynthetic) {
  exiftool([
    '-GPSLatitude=' + SYNTHETIC_GPS.lat,
    '-GPSLatitudeRef=' + SYNTHETIC_GPS.latRef,
    '-GPSLongitude=' + SYNTHETIC_GPS.lon,
    '-GPSLongitudeRef=' + SYNTHETIC_GPS.lonRef,
    '-DateTimeOriginal=' + SYNTHETIC_DATE,
    '-CreateDate=' + SYNTHETIC_DATE,
    '-overwrite_original',
    output,
  ]);
  console.log(
    'injected SYNTHETIC GPS (Greenwich Observatory) and date (' +
      SYNTHETIC_DATE +
      ') so CI can test metadata extraction',
  );
}

// ── Verify, rather than trust ────────────────────────────────────────────
/**
 * Dump EVERY surviving tag and hunt for identifiers, rather than checking the
 * handful of fields this script happens to know about.
 *
 * The narrow version of this check passed a file that still carried
 * `[Apple] PhotoIdentifier`, a per-photo UUID. A scrubber that only inspects
 * what it already removed cannot, by construction, discover what it missed.
 */
const all = exiftool(['-a', '-G1', '-s', output]);
const IDENTIFYING = [
  [/GPS(Latitude|Longitude|Position|Altitude)/i, 'GPS location'],
  [/PhotoIdentifier|ImageUniqueID|ContentIdentifier|DocumentID|OriginalDocumentID/i, 'unique photo identifier'],
  [/SerialNumber/i, 'device serial number'],
  // Scoped to the EXIF/XMP groups on purpose. An unscoped /Copyright/ matches
  // `[ICC_Profile] ProfileCopyright: Copyright Apple Inc., 2022` — a colour
  // profile string present in every iPhone photo ever taken, which identifies
  // Apple rather than the photographer. Flagging it made the script refuse a
  // file that was genuinely clean.
  [/\[(IFD0|ExifIFD|XMP[-\w]*)\][^\n]*\b(OwnerName|Artist|Copyright|Creator)\b/i, 'owner or author name'],
  [/DateTimeOriginal|SubSecDateTimeOriginal/i, 'capture timestamp'],
];

let checks = IDENTIFYING;
if (withSynthetic) {
  // GPS is expected — but prove it is the synthetic one. A real coordinate
  // slipping through here is the exact failure this script exists to prevent,
  // and "we meant to add GPS" must never become cover for leaving the real one.
  // exiftool renders this as `GPSLatitude : 51 deg 28' 40.08"` — no space in
  // the tag name, DMS in the value. Matching `GPS Latitude` instead failed a
  // correctly-injected fixture, which is the right way round for a guard to
  // be wrong.
  const lat = /GPSLatitude\s*:\s*51 deg 28/.test(all);
  if (!lat) {
    console.error(
      '\nFAILED — --with-synthetic-metadata was requested, but the GPS in the output' +
        ' is not the synthetic coordinate:',
    );
    console.error(
      all
        .split('\n')
        .filter((l) => /GPS/i.test(l))
        .join('\n'),
    );
    process.exit(1);
  }
  // Same for the date: expected, but it must be the synthetic one.
  if (!all.includes('2020:01:01')) {
    console.error('\nFAILED — the capture timestamp is not the synthetic date.');
    console.error(all.split('\n').filter((l) => /Date/i.test(l)).join('\n'));
    process.exit(1);
  }
  checks = IDENTIFYING.filter(
    ([, label]) => label !== 'GPS location' && label !== 'capture timestamp',
  );
}

const survivors = checks.filter(([pattern]) => pattern.test(all));
const keptOrientation = /Orientation/.test(all);

console.log('\n' + exiftool(['-s', '-FileType', '-Orientation', output]).trim());

if (survivors.length > 0) {
  console.error('\nFAILED — identifying data survived the scrub. NOT safe to commit:');
  for (const [pattern, label] of survivors) {
    const line = all.split('\n').find((l) => pattern.test(l));
    console.error('  ' + label + ': ' + (line ?? '').trim());
  }
  process.exit(1);
}
if (!keptOrientation) {
  console.warn(
    '\nWARNING: no Orientation tag in the output.\n' +
      '  If the source had one, the scrub destroyed the thing that makes this\n' +
      '  fixture valuable (docs/12 D-30/D-34). If the source genuinely had none,\n' +
      '  this file will not exercise the orientation path — prefer a portrait\n' +
      '  photo taken with the phone rotated.',
  );
}

console.log(
  '\nOK. Next: drop it in tests/fixtures/images/, then run\n' +
    '  npx vitest run --project integration tests/integration/heic.test.ts\n' +
    'and confirm the decode + orientation suites run instead of skipping.',
);
