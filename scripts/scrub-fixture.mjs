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

const [, , input, output] = process.argv;

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
];

exiftool([...REMOVE, '-overwrite_original', output]);

// ── Verify, rather than trust ────────────────────────────────────────────
const report = exiftool(['-s', '-GPSLatitude', '-GPSLongitude', '-Orientation', '-SerialNumber', output]);
const remainingGps = /GPS(Latitude|Longitude)/.test(report);
const keptOrientation = /Orientation/.test(report);

console.log('\n' + report.trim());

if (remainingGps) {
  console.error('\nFAILED: GPS data survived the scrub. Not safe to commit.');
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
