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
    'The signature box usually has the tightest limit on any form, and 20 KB is the usual figure. Good news: a signature compresses very well. It is black ink on white paper, not a photo, so 20 KB is plenty — it should stay sharp and easy to read. If yours will not fit, the problem is usually the picture, not the compression. A phone photo of a signature also captures the paper: shadows, texture, grey light from one side of the room. All of that costs file size, and none of it is your signature. Take the picture in even light and crop close around the ink.',
  useCases: [
    'Bank account opening and KYC forms, which commonly cap signatures at 20 KB',
    'Competitive exam and recruitment portals, where photo and signature have separate limits',
    'University and scholarship admission forms',
    'Government e-service applications built against older upload limits',
  ],
  faq: [
    {
      q: 'Why does my signature look dirty or grey after compressing?',
      a: 'The problem is almost always in the photo, not the compression. Take the picture in even light — near a window is good, under one ceiling bulb is bad. Then crop close around the ink before compressing. A signature on clean white paper stays crisp at a few kilobytes. The same signature on a shadowy, lined page wastes most of the file on the paper.',
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
    'Fifty kilobytes is the most common limit for passport, visa and ID photo uploads. A properly prepared headshot fits it easily without looking soft. The order matters: crop the photo to the required shape FIRST, then compress. If you compress first and crop after, the file size changes again and the work is wasted. Passport photos also compress well by nature — one face, even light, a plain background. If yours will not fit at a decent quality, the usual reason is that it is still a full phone photo with a whole room behind you. Crop closer.',
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
    'PAN cards are issued through two different websites, and they ask for different photo sizes. NSDL (Protean) wants a JPEG between 20 KB and 50 KB. UTIITSL wants one under 30 KB. Only 20 to 30 KB works for both — so that is what this page aims for. This is also why the "50 KB" number most guides give can still get rejected: it is too big for the UTIITSL form. One more surprise: NSDL also rejects photos SMALLER than 20 KB. So squeezing the file as small as possible is the wrong move here. Aim for the middle.',
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
 * The GD page exists to CORRECT its own query (docs/12 D-125). "ssc gd photo
 * size 20kb" was a GAP query, and every page ranking for it teaches photo
 * compression for an application that no longer accepts photo uploads — the
 * 2026 notice captures the photo live and rejects captures of existing
 * photographs summarily (§8.5). A page whose headline fixes the searcher's
 * premise is more useful than the destination, which is docs/05 §5's own test.
 *
 * Not a cannibal of signature-to-20kb (the D-102 concern, checked): this page
 * carries GD-specific verified facts — the no-photo-upload correction, the
 * notice's own "miniature is the top rejection reason" warning, the 2027
 * cycle note — none of which belong on the generic signature page.
 *
 * DELIBERATELY NO CHAIN: the chain suggests the same form's next upload, and
 * GD's only upload is this one. Chaining to a photo tool would contradict the
 * page's own headline.
 *
 * Notice-day flip (docs/18, backlog #34): re-verify against the 2027 notice,
 * update the ssc-gd ExamSpec cycle/verifiedOn and this copy's cycle mentions.
 */
const sscGdPhotoSignature: SizePresetRoute = {
  slug: 'ssc-gd-photo-signature',
  format: 'jpeg',
  targetBytes: 20_000,
  supported: true,
  cardName: 'SSC GD signature, 10–20 KB',
  title: 'SSC GD photo & signature size — what actually uploads',
  h1: 'SSC GD photo and signature size',
  metaDescription:
    'SSC GD 2026: the photo is captured live — there is no photo upload. The signature is the only file you compress: JPEG, 10–20 KB. Do it in your browser.',
  intro:
    'SSC GD is the constable recruitment exam run by the Staff Selection Commission (SSC). If you are applying, here is the one thing most websites get wrong: there is NO photo file to upload any more. The form takes your photo live, using your camera, while you fill it in. If you point the camera at an old printed photo, your form is rejected. The only image file you upload is your signature. It must be a JPEG between 10 KB and 20 KB, about 6 cm wide and 2 cm tall. One more trap: the most common reason signatures get rejected is that they are TOO SMALL to read. That happens when people squeeze the file too hard. This page is already set to the right size, so your signature fits the limit and stays easy to read.',
  useCases: [
    'The SSC GD constable application form on ssc.gov.in',
    'Other SSC exams on the same website — CGL, CHSL and MTS ask for the same signature size',
    'Uploading again after the form said your signature was blurred or too small',
    'The next GD application round, which SSC’s own calendar expects in September 2026',
  ],
  faq: [
    {
      q: 'Why can’t I find where to upload my photo for SSC GD?',
      a: 'Because there is no photo upload. The form takes your photo live, with your camera, while you fill it in. It has rules: good light, plain background, no cap, no glasses. Do not point the camera at an old photo — the official notice says forms that do this are rejected. Any website telling you to compress a photo to 20 KB for GD is describing the old process.',
    },
    {
      q: 'My signature was rejected as "miniature". What does that mean?',
      a: 'It means the signature image was too small to read. The official notice says this is the number one reason signatures get rejected. It usually happens when you shrink the image to force the file under 20 KB. The fix: crop close around your signature, keep it about 6 cm wide and 2 cm tall, and let this page lower the quality instead of the size. You get a file that fits 10 to 20 KB and stays readable.',
    },
    {
      q: 'Why is there a 10 KB minimum?',
      a: 'The form rejects files under 10 KB, not just files over 20 KB. A signature squeezed below 10 KB is almost always too small or too blurry to read. This page aims for the middle of the range, so you do not have to think about either limit.',
    },
    {
      q: 'Does this apply to the next (2027) GD application?',
      a: 'The numbers on this page come from the 2026 GD notice — the official PDF, linked above with the date we checked it. SSC expects to publish the 2027 notice in September 2026. SSC has used the same signature size for years, and we will check the new notice the day it comes out and update this page if anything changes.',
    },
    ...SHARED_FAQ_TAIL,
  ],
  relatedSlugs: ['signature-to-20kb', 'jpg-to-20kb', 'passport-photo-to-50kb'],
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
  sscGdPhotoSignature,
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
/**
 * D10 carve-out (docs/12 D-130): only dimensions that appear in a VERIFIED
 * exam spec ship as resize presets — the official notices are the demand
 * evidence. Every number below traces to the same primary PDFs as
 * exam-specs.ts (IBPS 2026-cycle guidelines; SBI CBO Nov 2025 guidelines).
 *
 * HONESTY RULE for this template: `exact` resize STRETCHES — it does not crop
 * or pad — so every intro says "crop to the right shape first" in plain words
 * (D-126). That also matches the portals' own advice.
 */
const photo200x230: ResizePresetRoute = {
  slug: 'photo-200x230',
  width: 200,
  height: 230,
  supported: true,
  title: 'Resize a photo to 200 x 230 pixels — bank exam size',
  h1: 'Resize a photo to 200 × 230 pixels',
  metaDescription:
    'Resize your photo to exactly 200 × 230 pixels for IBPS and SBI forms, in your browser. Nothing is uploaded.',
  intro:
    'Bank recruitment forms — IBPS and SBI both — ask for a photo of exactly 200 × 230 pixels, with the file between 20 KB and 50 KB. This page sets the pixel size for you. One thing to know: resizing stretches the picture to fit. If your photo is a very different shape, crop it to roughly passport shape first, then resize here. After resizing, if your file is still over 50 KB, use the compress page linked below — it targets the KB limit.',
  useCases: [
    'IBPS bank exam application forms (PO, Clerk, SO)',
    'SBI recruitment forms — same photo size, same 20–50 KB band',
    'Other bank and insurance recruitments that copy the IBPS format',
  ],
  faq: [
    {
      q: 'Will this change the shape of my photo?',
      a: 'It can. This tool resizes to exactly 200 × 230 pixels by stretching. If your photo is close to passport shape already, the stretch is invisible. If it is a wide photo or a square one, crop it to roughly passport shape first — then resize. That is also what the bank portals themselves advise.',
    },
    {
      q: 'The form also says 20 KB to 50 KB. Does this page do that?',
      a: 'This page fixes the pixels. The file size usually lands in the right range on its own at this small size — but if the form still rejects it, open the compress page linked below and it will target the KB limit exactly.',
    },
    {
      q: 'Is my photo uploaded?',
      a: 'No. The resizing happens inside your browser, on your device. You can turn off your internet connection and it still works.',
    },
  ],
  relatedSlugs: ['signature-140x60', 'jpg-to-50kb', 'passport-photo-to-50kb'],
};

const signature140x60: ResizePresetRoute = {
  slug: 'signature-140x60',
  width: 140,
  height: 60,
  supported: true,
  title: 'Resize a signature to 140 x 60 pixels — bank exam size',
  h1: 'Resize a signature to 140 × 60 pixels',
  metaDescription:
    'Resize your signature to exactly 140 × 60 pixels for IBPS and SBI forms, in your browser. Nothing is uploaded.',
  intro:
    'IBPS and SBI forms want the signature image at exactly 140 × 60 pixels, with the file between 10 KB and 20 KB, signed in black ink on white paper — and NOT in capital letters, which the forms reject. This page sets the pixel size. Crop close around the ink before you resize, so the signature stays big and readable inside the small box. If the file is then over 20 KB, the compress page linked below targets the KB limit.',
  useCases: [
    'IBPS application forms (PO, Clerk, SO)',
    'SBI recruitment forms — same signature size and band',
    'Re-uploads after a "signature not as per specification" rejection',
  ],
  faq: [
    {
      q: 'Why does my signature look squashed?',
      a: 'The tool stretches your image to exactly 140 × 60 pixels, which is a wide, short box. Crop your scan close around the signature — wide and short, like the box — before resizing. A tall crop squeezed into a short box is what causes the squashed look.',
    },
    {
      q: 'The form rejected my signature in capital letters. Why?',
      a: 'IBPS and SBI say it directly in their guidelines: a signature written in capital letters is not accepted. Sign normally, in your usual handwriting, with black ink on white paper — then scan, crop and resize.',
    },
    {
      q: 'Is my signature uploaded?',
      a: 'No. Everything happens inside your browser, on your device. Nothing is sent anywhere.',
    },
  ],
  relatedSlugs: ['photo-200x230', 'signature-to-20kb', 'jpg-to-20kb'],
};

const thumb240x240: ResizePresetRoute = {
  slug: 'thumb-240x240',
  width: 240,
  height: 240,
  supported: true,
  title: 'Resize a thumb impression to 240 x 240 pixels',
  h1: 'Resize a thumb impression to 240 × 240 pixels',
  metaDescription:
    'Resize a left thumb impression to exactly 240 × 240 pixels (3 × 3 cm) for IBPS and SBI forms, in your browser.',
  intro:
    'Bank forms ask for a left thumb impression at 240 × 240 pixels — a 3 × 3 cm square at 200 DPI — with the file between 20 KB and 50 KB. Put your left thumb impression on white paper with black or blue ink, photograph or scan it, crop to a square around the impression, and this page sets the exact pixels. The guidelines say: if you do not have a left thumb, use the right; if no thumbs, a finger.',
  useCases: [
    'IBPS application forms (PO, Clerk, SO)',
    'SBI recruitment forms — same size and band',
    'Any bank or insurance form that copies the IBPS upload format',
  ],
  faq: [
    {
      q: 'Which ink, and which thumb?',
      a: 'Left thumb, black or blue ink, on white paper — that is what the IBPS and SBI guidelines say. If you do not have a left thumb, the guidelines allow the right thumb, and if neither, a finger starting from the forefinger.',
    },
    {
      q: 'Should I crop before resizing?',
      a: 'Yes — crop to a square around the impression first. This page stretches to an exact square, so a square crop keeps the impression round and clear instead of stretched.',
    },
    {
      q: 'Is anything uploaded?',
      a: 'No. The whole job runs in your browser on your device.',
    },
  ],
  relatedSlugs: ['declaration-800x400', 'photo-200x230', 'jpg-to-50kb'],
};

const declaration800x400: ResizePresetRoute = {
  slug: 'declaration-800x400',
  width: 800,
  height: 400,
  supported: true,
  title: 'Resize a handwritten declaration to 800 x 400 pixels',
  h1: 'Resize a handwritten declaration to 800 × 400 pixels',
  metaDescription:
    'Resize the handwritten declaration to exactly 800 × 400 pixels (10 × 5 cm) for IBPS and SBI forms, in your browser.',
  intro:
    'IBPS and SBI forms ask for a short declaration written by hand, photographed, and uploaded at 800 × 400 pixels — 10 × 5 cm at 200 DPI — with the file between 50 KB and 100 KB. Write it in English, in YOUR handwriting, with black ink, not in capital letters. Photograph it straight-on in good light, crop to just the text, and this page sets the exact pixels.',
  useCases: [
    'IBPS application forms (PO, Clerk, SO)',
    'SBI recruitment forms — same size and band',
    'Re-uploads after a "declaration not as per specification" rejection',
  ],
  faq: [
    {
      q: 'What exactly do I write?',
      a: 'The exact sentence is shown on the application form itself — copy it word for word, by hand, in English, with black ink. If someone else writes it, or it is written in capital letters, the application is treated as invalid. That is stated in the bank guidelines themselves.',
    },
    {
      q: 'My handwriting slopes. Will it be rejected?',
      a: 'Sloping handwriting is fine — it just has to be YOUR handwriting, readable, in English, not capitals. Photograph the page straight-on so the lines do not distort, and crop close to the text before resizing.',
    },
    {
      q: 'Is the declaration uploaded anywhere from here?',
      a: 'No. The resize runs in your browser on your device. Nothing is sent to us.',
    },
  ],
  relatedSlugs: ['thumb-240x240', 'signature-140x60', 'jpg-to-100kb'],
};

export const resizePresetRoutes: ResizePresetRoute[] = [
  photo200x230,
  signature140x60,
  thumb240x240,
  declaration800x400,
];

export const publishedResizePresetRoutes = resizePresetRoutes.filter((r) => r.supported);

export function getResizePresetRoute(slug: string): ResizePresetRoute | undefined {
  return publishedResizePresetRoutes.find((r) => r.slug === slug);
}
