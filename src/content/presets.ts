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
      q: 'My file is already under 1MB. Will this make it smaller?',
      a: 'No, and deliberately so. A file that already meets the target is returned essentially untouched rather than re-compressed for no reason — re-encoding an already-compliant file would only degrade it.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['jpg-to-500kb', 'jpg-to-200kb', 'jpg-to-100kb'],
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
