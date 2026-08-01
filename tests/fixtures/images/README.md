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
