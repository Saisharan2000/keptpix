# Test fixtures — supply these locally

These files are **git-ignored on purpose.** Real camera photos carry GPS
coordinates, camera model and capture timestamps; committing them publishes a
location. That is the exact thing this product exists to strip.

Every suite that uses them **skips cleanly when they are absent**, so a fresh
clone still runs green. To get the full coverage locally, drop in:

| File | What it needs to be | What it proves |
|---|---|---|
| `IMG_4650.HEIC` | A portrait iPhone HEIC, ideally GPS-tagged | libheif decode, EXIF orientation, GPS flagging, metadata stripping |
| `IMG_4474.png` | Any JPEG **named `.png`** | Magic-byte detection beating a wrong extension |

Any real photos work — the names above are what the suites look for.

**Getting originals off an iPhone:** Settings → Photos → *Transfer to Mac or PC*
→ **Keep Originals**, then copy from `Internal Storage\DCIM` over the cable. The
default "Automatic" setting converts HEIC to JPEG on the way across and strips
GPS and camera tags, which makes the files useless for these tests.

---

## `portrait-scrubbed.HEIC` — the one fixture that IS committed

Everything else in this folder is git-ignored. This file is the exception, and
it exists so a fresh clone and CI can exercise the flagship HEIC path instead
of skipping it (docs/12 D-36, D-62).

It is a real iPhone 13 photo, put through `scripts/scrub-fixture.mjs`:

**Removed** — real GPS (the original pointed at a specific street), the entire
Apple MakerNote including `PhotoIdentifier`, a UUID that uniquely identifies
the photo inside its owner's library, serial numbers, and the real capture
timestamp.

**Kept, deliberately** — EXIF `Orientation` (`Rotate 90 CW`) and the HEIF
container's own `irot` transform. Those two are the whole reason a real photo
is worth committing: they caught D-30 (exifr returns the STRING `'Rotate 90
CW'`, not `6`, so every real photo read as upright) and D-34 (a portrait HEIC
came out landscape because the container transform and the EXIF tag were both
applied). A blanket `exiftool -all=` produces a file that tests nothing.

**Replaced with obvious fakes** — GPS is Greenwich Observatory
(51°28'40"N, 0°0'5"W) and the date is `2020:01:01`. Detection of both is a
real product feature (docs/02 §5's privacy demonstration), so the fixture has
to carry them; it just must not carry anyone's actual location or movements.

### Regenerating it

```bash
node scripts/scrub-fixture.mjs <your.HEIC> tests/fixtures/images/portrait-scrubbed.HEIC --with-synthetic-metadata
```

The script fails rather than writes if anything identifying survives, and also
fails if the synthetic GPS/date are not exactly the expected values — so
"we meant to add GPS" can never become cover for leaving the real one in.

### Before committing any new fixture

The scrub removes **metadata, not image content**. Check the photo itself does
not show a face, a house number, a street sign or anything else you would not
publish. Anything matching `*-scrubbed.HEIC` is public.
