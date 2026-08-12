/**
 * src/content/presets.ts
 *
 * Spec: docs/05-data-models.md §5 (SizePresetRoute) + docs/09 §2.2
 *
 * These routes exist because of a specific person: the Form Filer in docs/02.
 * Government portals, exam boards and visa systems impose hard upload caps —
 * "photo must be under 100 KB" — and reject anything larger without explaining
 * how to fix it. That is a real, recurring, urgent problem, and it is exactly
 * what the target-size search was built for.
 *
 * Every route prefills sizeMode from its slug, so the user's first action is
 * dropping a file. `supported` is the same hard gate as FormatPairRoute: never
 * prerender a size the engine cannot actually hit.
 */

import type { ResizePresetRoute, SizePresetRoute } from '../core/types';

/** Two answers that are genuinely the same on every size route. */
const SHARED_FAQ_TAIL = [
  {
    q: 'What if my photo cannot reach the target?',
    a: 'You get the closest result we can produce, clearly labelled, plus a one-tap option to allow resizing so it can go further. You never get a silent failure or a file that quietly exceeds the limit. Physics applies: a 12 MP photo cannot become 20 KB at full resolution, so very small targets mean reducing the dimensions too.',
  },
  {
    q: 'Are my photos uploaded?',
    a: 'No. The compression runs entirely inside your browser, so your files never leave your device. You can check that yourself in your browser’s Network tab, and the page keeps working with your network disconnected.',
  },
];

const jpg20kb: SizePresetRoute = {
  slug: 'jpg-to-20kb',
  format: 'jpeg',
  targetBytes: 20_000,
  supported: true,
  title: 'Compress JPG to 20KB — exact size, nothing uploaded',
  h1: 'Compress JPG to 20KB',
  metaDescription:
    'Compress a JPG to under 20KB in your browser. Exact target size, no upload, no sign-up.',
  intro:
    'A 20 KB cap is about as tight as image upload limits get, and it almost always comes from an older government or examination portal built when bandwidth was scarce. Reaching it from a modern phone photo is not a matter of nudging a quality slider: a 12 MP image physically cannot hold that much detail in 20 KB at full resolution, so the dimensions have to come down as well. We search quality and scale together, and tell you exactly what the final image ended up as.',
  useCases: [
    'Government exam registration portals, which frequently cap photo and signature uploads at 20 KB',
    'Older recruitment systems built against dial-up-era limits and never updated',
    'Signature upload fields, usually the tightest limit on any form',
    'Legacy public-sector portals that reject larger files without explaining why',
  ],
  faq: [
    {
      q: 'Can any photo actually reach 20KB?',
      a: 'Not at full resolution. A 12 MP photo holds far too much detail to fit in 20 KB while keeping its dimensions, so reaching this target means reducing pixel size as well as quality. We do both automatically and report the final dimensions, so you know exactly what you are submitting.',
    },
    {
      q: 'Will it still look acceptable?',
      a: 'For a passport-style headshot or a signature at the size these forms display them, usually yes. For a detailed landscape, no — 20 KB is simply not enough information to hold one. If the form accepts a larger limit, use it.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['jpg-to-50kb', 'jpg-to-100kb', 'jpg-to-200kb'],
};

const jpg50kb: SizePresetRoute = {
  slug: 'jpg-to-50kb',
  format: 'jpeg',
  targetBytes: 50_000,
  supported: true,
  title: 'Compress JPG to 50KB — exact size, nothing uploaded',
  h1: 'Compress JPG to 50KB',
  metaDescription:
    'Compress a JPG to under 50KB in your browser. Exact target size, no upload, no sign-up.',
  intro:
    'Fifty kilobytes is the classic passport and visa photo limit. It is tight enough that a phone photo will not pass unedited, but generous enough that a properly cropped headshot still looks sharp — which is why so many identity systems settled on it. The usual mistake is cropping after compressing: crop to the required aspect ratio first, so none of your 50 KB is spent on background you were about to discard.',
  useCases: [
    'Passport and visa photo uploads, where 50 KB is a very common ceiling',
    'National identity and enrolment portals',
    'University and scholarship application forms',
    'Bank and financial KYC document uploads',
  ],
  faq: [
    {
      q: 'Will a passport photo still be accepted at 50KB?',
      a: 'Yes — 50 KB is comfortable for a correctly cropped headshot, and it is the limit most identity systems were designed around. Crop to the required dimensions first and compress afterwards, so none of the budget is wasted on background you are about to remove.',
    },
    {
      q: 'Should I resize before compressing?',
      a: 'If the form specifies pixel dimensions, yes — match those first. Compressing a 12 MP photo to 50 KB and then cropping throws away most of the detail you just paid to keep. Set the resize option here and both happen in a single pass.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['jpg-to-20kb', 'jpg-to-100kb', 'jpg-to-200kb'],
};

const jpg100kb: SizePresetRoute = {
  slug: 'jpg-to-100kb',
  format: 'jpeg',
  targetBytes: 100_000,
  supported: true,
  title: 'Compress JPG to 100KB — exact size, nothing uploaded',
  h1: 'Compress JPG to 100KB',
  metaDescription:
    'Compress a JPG to under 100KB in your browser. Exact target size, no upload, no sign-up.',
  intro:
    'One hundred kilobytes is the single most common image upload limit on the web. It is the default ceiling on a large share of government forms, job portals and content management systems, and it is generous enough that a full-frame photo usually reaches it with no visible drop in quality at normal viewing sizes. If you only ever remember one target, this is the useful one.',
  useCases: [
    'Government forms and public-sector portals, where 100 KB is the most frequent cap',
    'Job applications and recruitment platforms',
    'Content management systems with a per-image ceiling',
    'Email attachments where several photos must fit one total limit',
  ],
  faq: [
    {
      q: 'Will a photo look noticeably worse at 100KB?',
      a: 'Rarely, at normal viewing sizes. For a typical phone photo the search usually lands somewhere in the 60s or 70s on the quality scale, which is not visibly degraded on a screen. Fine detail suffers if you zoom in afterwards or print it large.',
    },
    {
      q: 'Why does my file come out at 96KB rather than exactly 100KB?',
      a: 'The search accepts anything between 92% and 100% of the target and stops as soon as it lands in that band, rather than burning more passes chasing an exact number. Being slightly under is what upload forms want anyway — a file sitting exactly on the limit sometimes fails a strict comparison.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['jpg-to-50kb', 'jpg-to-200kb', 'jpg-to-500kb'],
};

const jpg200kb: SizePresetRoute = {
  slug: 'jpg-to-200kb',
  format: 'jpeg',
  targetBytes: 200_000,
  supported: true,
  title: 'Compress JPG to 200KB — exact size, nothing uploaded',
  h1: 'Compress JPG to 200KB',
  metaDescription:
    'Compress a JPG to under 200KB in your browser. Exact target size, no upload, no sign-up.',
  intro:
    'Two hundred kilobytes is roomy enough that most photos keep their detail and tight enough to satisfy the large majority of upload forms. It is the sweet spot for document scans and certificates, where the legibility of small text matters far more than colour fidelity — and where over-compressing is the failure that actually gets an application rejected.',
  useCases: [
    'Scanned certificates, marksheets and supporting documents',
    'Job portals and professional profile photos',
    'Property and marketplace listing images',
    'Insurance and claims portals accepting photographic evidence',
  ],
  faq: [
    {
      q: 'Is 200KB enough for a scanned document?',
      a: 'Usually yes, provided the scan is not enormous to begin with — text stays legible at 200 KB for a typical A4 page. If small print looks smeared, reduce the resolution rather than compressing harder. JPEG smears hard edges like text long before it loses anything you would notice in a photograph.',
    },
    {
      q: 'Can I compress several documents at once?',
      a: 'Yes. Drop a folder and every file is compressed to the same target independently, then downloads individually or as a single ZIP. There is no file count limit, because the work happens on your device rather than on a server somebody pays for.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['jpg-to-100kb', 'jpg-to-500kb', 'jpg-to-1mb'],
};

const jpg500kb: SizePresetRoute = {
  slug: 'jpg-to-500kb',
  format: 'jpeg',
  targetBytes: 500_000,
  supported: true,
  title: 'Compress JPG to 500KB — exact size, nothing uploaded',
  h1: 'Compress JPG to 500KB',
  metaDescription:
    'Compress a JPG to under 500KB in your browser. Exact target size, no upload, no sign-up.',
  intro:
    'At half a megabyte, compression stops being a compromise. A full-resolution phone photo reaches 500 KB at a quality level where the difference from the original is genuinely hard to see, which makes it the right target when you want a smaller file without thinking hard about what you are giving up. It is also a common ceiling for forum attachments and blog uploads.',
  useCases: [
    'Blog and article images, where page weight matters but quality still counts',
    'Forum and community platform attachments',
    'Email attachments, keeping a set of photos under a mailbox limit',
    'Archiving a phone camera roll at a fraction of its original size',
  ],
  faq: [
    {
      q: 'Will I be able to tell the difference at 500KB?',
      a: 'On a screen, almost certainly not. A 12 MP photo typically reaches 500 KB somewhere in the 80s on the quality scale, above the point where JPEG artifacts become visible at normal viewing distance. Printing large, or cropping in heavily, is where you would notice.',
    },
    {
      q: 'Is this a good target for archiving my photos?',
      a: 'It is a reasonable compromise if storage is the constraint, but understand the trade: compression is permanent, and re-compressing later compounds the loss. If these are your only copies, keep the originals and treat the 500 KB versions as convenience copies.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['jpg-to-200kb', 'jpg-to-1mb', 'jpg-to-100kb'],
};

const jpg1mb: SizePresetRoute = {
  slug: 'jpg-to-1mb',
  format: 'jpeg',
  targetBytes: 1_000_000,
  supported: true,
  title: 'Compress JPG to 1MB — exact size, nothing uploaded',
  h1: 'Compress JPG to 1MB',
  metaDescription:
    'Compress a JPG to under 1MB in your browser. Exact target size, no upload, no sign-up.',
  intro:
    'A one megabyte cap is less about saving space than about clearing a threshold. Plenty of systems reject anything over 1 MB while being perfectly happy with 999 KB, so the job is to get comfortably under the line while giving up as little as possible. Most photos reach it at a quality level indistinguishable from the original; larger images simply come down a little further.',
  useCases: [
    'Upload forms with a hard 1 MB ceiling and no guidance on how to meet it',
    'Content management systems that reject larger files outright',
    'Sharing high-resolution photos where quality matters more than size',
    'Reducing a batch of DSLR photos enough to email without visible loss',
  ],
  faq: [
    {
      q: 'Is 1MB enough to keep full quality?',
      a: 'For most photographs, effectively yes. A 12 MP image usually reaches 1 MB at a quality level where the difference from the original is not visible at normal viewing sizes. Very detailed scenes — dense foliage, textured fabric, fine architectural detail — give up the most.',
    },
    {
      /*
       * This answer used to say an already-compliant file came back "essentially
       * untouched". It did not: the file was re-encoded at high quality and
       * could come back LARGER — 57% larger in the reported case (docs/12 D-91).
       * The copy described an intention, not the behaviour. It now describes
       * what the code does, which is re-encode but never inflate.
       */
      q: 'My file is already under 1MB. What happens then?',
      a: 'It is still processed, but it will never come back larger than it went in — if your file already fits, the target tightens to your file’s own size. The reason it is not simply handed back untouched is that re-encoding is what removes the EXIF data, including GPS coordinates, and keeping that would be the worse trade.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['jpg-to-500kb', 'jpg-to-200kb', 'jpg-to-100kb'],
};

/* ── Use-case routes (docs/12 D-92) ───────────────────────────────────────
 *
 * Named for the JOB rather than the number. The six routes above answer
 * "compress jpg to 20kb"; nobody with a rejected form types that. They type
 * "compress signature to 20kb" or "passport photo compressor", and the SERP for
 * those queries is owned by competitors with a URL that matches the phrase —
 * some with a whole domain for it (photosignatureresize.com).
 *
 * THE BAR THESE HAVE TO CLEAR is set by docs/05 §5 itself: Google treats pages
 * built to rank that are "less useful than the destination" as doorway abuse. A
 * route that only re-words `jpg-to-20kb` would be exactly that, and would
 * cannibalise it. So each one below has to give advice the generic page cannot.
 *
 * They genuinely do, and in one case the advice is close to opposite:
 * `jpg-to-20kb` explains that a photo physically cannot hold 20 KB at full
 * resolution. A signature is line art — 20 KB is roomy, and the real problem is
 * never the compression, it is the photograph of the paper.
 */

const signature20kb: SizePresetRoute = {
  slug: 'signature-to-20kb',
  format: 'jpeg',
  targetBytes: 20_000,
  supported: true,
  cardName: 'Compress a signature to 20 KB',
  title: 'Compress a signature to 20KB — exact size, nothing uploaded',
  h1: 'Compress a signature to 20KB',
  metaDescription:
    'Compress a scanned or photographed signature to under 20KB in your browser. Exact target size, no upload, no sign-up.',
  intro:
    'Signature fields carry the tightest limit on almost every form, and 20 KB is the usual figure. The good news is that a signature is line art, not a photograph: black strokes on white paper compress extremely well, so 20 KB is roomy rather than punishing, and you should not have to sacrifice legibility to reach it. If your signature will not fit, the compression is rarely the problem — the photograph is. A phone picture of a signature captures the paper as much as the ink: shadows, page texture, the faint grey of a room lit from one side. All of that is detail the encoder has to spend bytes on, and none of it is your signature.',
  useCases: [
    'Bank account opening and KYC forms, which commonly cap signatures at 20 KB',
    'Competitive exam and recruitment portals, where photo and signature have separate limits',
    'University and scholarship admission forms',
    'Government e-service applications built against older upload limits',
  ],
  faq: [
    {
      q: 'Why does my signature look dirty or grey after compressing?',
      a: 'That is almost always in the original rather than the compression. Photograph the page in even, indirect light — near a window, not under a single ceiling bulb — and crop tightly to the strokes before you compress. A signature on plain white paper compresses to a few kilobytes while staying crisp; the same signature on a shadowed, lined page spends most of its budget on the paper.',
    },
    {
      q: 'Should I scan it or photograph it?',
      a: 'Scan it if you can, because a scanner gives you flat lighting and a genuinely white background, which is the single biggest factor here. A phone photograph is perfectly workable — just get the light even and fill the frame with the signature rather than the page.',
    },
    {
      q: 'My form wants a specific size in pixels as well. Does this do that?',
      a: 'Not by itself, and it is worth being straight about that. This page hits an exact file size in kilobytes. If your portal also demands specific pixel dimensions — 600×200 is a common one — crop to that shape first, then compress, because cropping afterwards changes the file size again and you would be back where you started.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['jpg-to-20kb', 'passport-photo-to-50kb', 'jpg-to-50kb'],
  /*
   * The three chains below (signature ↔ photo, PAN → signature) exist because
   * the underlying forms genuinely require both uploads — an exam portal takes
   * a photo AND a signature with separate limits, and a user who finished one
   * still has the other to do. The six generic byte-target routes stay
   * unchained on purpose: "compress to 100 KB" has no knowable next step
   * (docs/12 D-113).
   */
  chain: {
    slug: 'passport-photo-to-50kb',
    reason: 'The same form almost always asks for a photo as well, with its own limit.',
  },
};

const passportPhoto50kb: SizePresetRoute = {
  slug: 'passport-photo-to-50kb',
  format: 'jpeg',
  targetBytes: 50_000,
  supported: true,
  cardName: 'Compress a passport photo to 50 KB',
  // 52 chars. The longer "— exact size, nothing uploaded" tail every other route
  // carries pushed this to 64 and `npm run check:seo` flagged it as truncating.
  title: 'Compress a passport photo to 50KB — no uploads',
  h1: 'Compress a passport photo to 50KB',
  metaDescription:
    'Compress a passport or visa photo to under 50KB in your browser. Exact target size, no upload, no sign-up.',
  intro:
    'Fifty kilobytes is the most common ceiling for passport, visa and identity photo uploads, and a properly prepared headshot clears it without looking soft. The order of operations is what decides the outcome: crop to the shape your application requires first, then compress. Do it the other way round and every byte you saved gets spent again the moment you trim the frame. A passport photo is also unusually kind to a compressor — one face, even lighting, a plain background — so if yours will not fit at a reasonable quality, the usual reason is that it is still a full phone photo with a room behind it.',
  useCases: [
    'Passport applications and renewals with a 50 KB photo cap',
    'Visa portals, which frequently specify both a pixel size and a file size',
    'National identity and enrolment systems',
    'Bank, KYC and employment onboarding document uploads',
  ],
  faq: [
    {
      q: 'Does this crop my photo to passport dimensions?',
      a: 'No, and that is worth knowing before you start. This page controls file size, not framing. Most countries want 35×45 mm and the United States wants a 2×2 inch square, so crop to your requirement first and compress second — a crop after compression changes the file size and undoes the work.',
    },
    {
      q: 'My photo is 4 MB. Can it really reach 50 KB and still be accepted?',
      a: 'Usually yes, because most of those 4 MB are resolution you do not need. Passport portals display the photo small, and a correctly cropped headshot at around 600×750 pixels looks sharp well under 50 KB. What does not survive is submitting a full-resolution phone photo untouched and hoping quality alone can carry it down.',
    },
    {
      q: 'The photo still looks blurry at 50KB. What now?',
      a: 'Check the background first. A plain, evenly lit wall costs almost nothing to encode, while a room full of furniture and shadow competes with your face for the same 50 KB. Re-shooting against a blank wall in soft daylight will usually do more for sharpness than any setting on this page.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['jpg-to-50kb', 'signature-to-20kb', 'jpg-to-100kb'],
  chain: {
    slug: 'signature-to-20kb',
    reason: 'Portals that take a photo usually want a signature next, under a tighter limit.',
  },
};

/**
 * The only route on this site with a size FLOOR to warn about.
 *
 * Both PAN portals were checked because they disagree, and the disagreement is
 * the reason the page earns its place (docs/12 D-102):
 *
 *   NSDL      photo 3.5x2.5 cm @ 200 DPI, JPEG, 20-50 KB
 *   UTIITSL   photo 213x213 px @ 300 DPI, JPEG, under 30 KB
 *
 * 20-30 KB is the only band that satisfies both, which is why the target is
 * 30 KB and not the 50 KB most searches ask for. And NSDL's **20 KB minimum**
 * inverts the usual advice: every other form on this site rejects a file for
 * being too big, and this one also rejects it for being too small. No generic
 * size page mentions that, because for every other limit it is not true.
 */
const panCardPhoto: SizePresetRoute = {
  slug: 'pan-card-photo',
  format: 'jpeg',
  targetBytes: 30_000,
  supported: true,
  cardName: 'PAN card photo, 30 KB',
  title: 'Resize a PAN card photo — 30KB, nothing uploaded',
  h1: 'Compress a PAN card photo',
  metaDescription:
    'Compress a PAN card photo to the size NSDL and UTIITSL both accept, in your browser. No upload, no sign-up.',
  intro:
    'The two PAN portals do not agree, which is why a single number is hard to find. NSDL wants a JPEG between 20 KB and 50 KB; UTIITSL wants one under 30 KB. Only 20 to 30 KB satisfies both, so that is what this page aims at — and it is why compressing to the 50 KB most guides mention can still be rejected if you are on the UTIITSL form. The more surprising part is NSDL\'s lower bound: it refuses a photo under 20 KB. Every other upload limit you will meet punishes a file for being too large, and this one also punishes it for being too small, so squeezing it as hard as possible is the wrong instinct here.',
  useCases: [
    'NSDL (Protean) PAN applications, which want 20-50 KB',
    'UTIITSL PAN applications, which want under 30 KB',
    'PAN correction and reprint forms, which use the same uploader',
    'e-KYC flows that ask for the same photo alongside a signature',
  ],
  faq: [
    {
      q: 'Which portal am I on?',
      a: 'Look at the address bar. NSDL applications sit on tin.tin.nsdl.com or onlineservices.nsdl.com, and UTIITSL on pan.utiitsl.com. If you are unsure, aim for 20 to 30 KB — that band is accepted by both, which is what this page targets.',
    },
    {
      q: 'My photo was rejected for being too small. Is that possible?',
      a: 'Yes, and it is unusual. NSDL sets a floor of 20 KB as well as a ceiling of 50 KB, so a heavily compressed photo fails for the opposite reason to normal. If that happened, raise the target rather than lowering it — this page aims at 30 KB precisely to stay clear of the floor.',
    },
    {
      q: 'Does this crop to 3.5 x 2.5 cm for me?',
      a: 'No, and it is worth knowing before you start. This page controls file size, not framing. NSDL specifies 3.5 cm tall by 2.5 cm wide at 200 DPI — about 276 x 197 pixels — while UTIITSL wants a 213 x 213 pixel square. Crop to whichever your form asks for first, then compress, because cropping afterwards changes the file size and undoes the work.',
    },
    {
      q: 'Both portals say JPEG. Does that matter?',
      a: 'Yes. Neither accepts PNG, and a PNG renamed to .jpg is still a PNG inside — the uploader reads the file, not the extension. This page always writes a real JPEG, so a screenshot or a PNG export becomes one on the way through.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['signature-to-20kb', 'jpg-to-20kb', 'passport-photo-to-50kb'],
  chain: {
    slug: 'signature-to-20kb',
    // "also asks for" and no KB figure, deliberately: the photo bands above were
    // verified against both portals (D-102); the signature limits were not, and
    // an unverified number in this one line is how D-91/D-95 happened.
    reason: 'The PAN application also asks for a signature image, with its own size limit.',
  },
};

/**
 * Wave 1 ships the six JPG sizes (docs/09 §6). The PNG and WebP size routes are
 * Wave 2 and are pure data additions here — no code changes required.
 */
export const sizePresetRoutes: SizePresetRoute[] = [
  jpg20kb,
  jpg50kb,
  jpg100kb,
  jpg200kb,
  jpg500kb,
  jpg1mb,
  signature20kb,
  passportPhoto50kb,
  panCardPhoto,
];

/** Same hard gate as the format pairs: never prerender what we cannot perform. */
export const publishedSizePresetRoutes = sizePresetRoutes.filter((r) => r.supported);

export function getSizePresetRoute(slug: string): SizePresetRoute | undefined {
  return publishedSizePresetRoutes.find((r) => r.slug === slug);
}

/** "100 KB" / "1 MB", for headings and the prefilled control. */
export function formatTarget(bytes: number): string {
  return bytes >= 1_000_000 ? bytes / 1_000_000 + ' MB' : bytes / 1000 + ' KB';
}

/**
 * Wave 2 (docs/09 §6): 12 dimension presets — 1920x1080, 1280x720, 1080x1080,
 * 1200x630, 800x600, 640x480, 512x512, 256x256, 1024x1024, 1500x500, 851x315,
 * 400x400. The template at /resize/[preset] is built and getStaticPaths reads
 * this array, so adding entries here is the entire change.
 */
export const resizePresetRoutes: ResizePresetRoute[] = [];

export const publishedResizePresetRoutes = resizePresetRoutes.filter((r) => r.supported);

export function getResizePresetRoute(slug: string): ResizePresetRoute | undefined {
  return publishedResizePresetRoutes.find((r) => r.slug === slug);
}
