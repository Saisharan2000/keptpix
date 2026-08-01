/**
 * src/content/formats.ts
 *
 * Spec: docs/05-data-models.md §5 + docs/09-seo-content-plan.md §3
 *
 * Hand-curated, NOT generated permutations. Two hard rules from docs/09:
 *
 *  1. `supported` is a HARD GATE. Never prerender a route the engine cannot
 *     actually perform — that is precisely the doorway abuse Google's spam
 *     policy describes.
 *  2. Minimum 400 words of substantive, pair-SPECIFIC prose, held to the
 *     anti-pattern table in docs/09 §3. If 400 non-generic words about a pair
 *     cannot be written, the pair does not get a route.
 *
 * Prose fields may contain blank-line-separated paragraphs; the Astro
 * components split on /\n\s*\n/ and render one <p> each.
 */

import type { FormatPairRoute, FormatReferenceRoute } from '../core/types';

const heicToJpg: FormatPairRoute = {
  slug: 'heic-to-jpg',
  from: 'heic',
  to: 'jpeg',
  tier: 'star',
  supported: true,

  title: 'Convert HEIC to JPG — free, unlimited, nothing uploaded',
  h1: 'Convert HEIC to JPG',
  metaDescription:
    'Convert iPhone HEIC photos to JPG in your browser. No upload, no sign-up, no file limit — your photos never leave your device.',

  intro: `HEIC is Apple's name for a still image stored in an HEIF container and compressed with HEVC, the same intra-frame codec used for 4K video. It produces files roughly half the size of an equivalent JPEG at similar visual quality, which is why Apple made it the iPhone default in iOS 11 back in 2017. Unless you have changed Camera settings to "Most Compatible", every photo taken on an iPhone 7 or later is a HEIC file.

The format is genuinely better than JPEG on almost every measurable axis: 10-bit colour instead of 8-bit, a real alpha channel, depth maps, and several images in one file for bursts and Live Photos. The problem is that very little outside Apple's ecosystem will open one.`,

  whyConvert: [
    'Windows does not open HEIC out of the box. Windows 10 and 11 include the free HEIF Image Extensions, but decoding Apple’s HEVC-compressed images also requires HEVC Video Extensions, which Microsoft charges $0.99 for. JPG requires nothing.',
    'Upload forms reject it. Job portals, government sites, university applications and most older content management systems accept JPG and PNG only, and usually fail HEIC with an unhelpful validation error.',
    'Chrome and Firefox cannot display HEIC at all. Safari is the only browser that decodes it, so a HEIC you email or embed is invisible to most people who receive it.',
    'Photo software older than roughly 2018 does not recognise the format — including plenty of still-current print services, photo kiosks and desktop editors.',
    'JPG is the one raster format you can assume will still open in twenty years. It has been universally supported since 1992.',
  ],

  technicalNotes: `HEIC is already lossy, so converting to JPG is a second lossy pass and some detail is discarded permanently. In practice this is invisible at quality 85 and above at normal viewing sizes; we default to 82, which is a good size-to-quality balance for photographs.

Two things genuinely change. Transparency is lost, because JPG has no alpha channel — any transparent pixels are flattened onto a background colour, white by default. Very few camera photos have alpha, but HEIC screenshots and stickers can. And 10-bit colour is reduced to 8-bit, which very occasionally shows as banding across smooth gradients such as a clear sky.

EXIF orientation is applied to the pixels before encoding, so photos do not come out sideways — a common failure in other converters. Depth maps, Live Photo video and burst sequences are not carried across, because JPG cannot represent them; only the primary image is converted.`,

  comparison: {
    rows: [
      {
        label: 'Compression',
        from: 'HEVC intra-frame — roughly 50% smaller than JPEG at equal quality',
        to: 'DCT, standardised 1992 — larger, but implemented everywhere',
      },
      {
        label: 'Support',
        from: 'Apple platforms; Safari only among browsers; Windows needs a paid HEVC codec',
        to: 'Every browser, operating system and image tool since 1992',
      },
      {
        label: 'Transparency',
        from: 'Yes — full alpha channel',
        to: 'No — alpha is flattened onto a background colour',
      },
      {
        label: 'Metadata',
        from: 'Full EXIF and GPS, plus depth maps and Live Photo pairing',
        to: 'EXIF and GPS (stripped here by default)',
      },
      {
        label: 'Typical size',
        from: '≈1.8 MB for a 12 MP iPhone photo',
        to: '≈3.5 MB for the same photo at quality 82',
      },
    ],
  },

  faq: [
    {
      q: 'Will converting HEIC to JPG lose quality?',
      a: 'Yes, a little. HEIC is already lossy, so re-encoding to JPEG is a second lossy pass. At quality 85 and above the difference is not visible at normal viewing sizes. If you intend to edit the photo afterwards, convert to PNG instead and accept a much larger file — every additional lossy save compounds the loss.',
    },
    {
      q: 'Will my location data be removed?',
      a: 'Yes, by default. iPhone photos carry GPS coordinates accurate to within a few metres, along with the camera model and the exact capture time. All of it is stripped unless you turn stripping off. Orientation is the one exception: it is applied to the pixels first so the image stays the right way up, then discarded.',
    },
    {
      q: 'Why will Windows not open my HEIC files?',
      a: 'Windows 10 and 11 can display HEIC only with two Microsoft Store extensions installed. HEIF Image Extensions is free, but it depends on HEVC Video Extensions, which costs $0.99 because HEVC is patent-encumbered. That same licensing situation is why Chrome and Firefox never added HEIC support. Converting to JPG sidesteps the problem entirely.',
    },
    {
      q: 'Can I convert many photos at once?',
      a: 'Yes. Drop a whole folder — there is no file count limit and no upload cap or daily quota, because the work happens on your device rather than on a server somebody has to pay for. Your device’s own memory is the only real limit, and very large images are handled by scaling them down rather than failing. Files are processed in parallel across your available CPU cores, and results download individually or together as a ZIP.',
    },
    {
      q: 'Are my photos uploaded anywhere?',
      a: 'No. The conversion runs entirely inside your browser, so your photos never leave your device. You can verify that yourself: open your browser’s developer tools, switch to the Network tab, and convert a file — you will see no upload. The page also keeps working with your network disconnected.',
    },
  ],

  defaultConfig: {
    outputFormat: 'jpeg',
    sizeMode: { kind: 'quality', quality: 82 },
    resize: { kind: 'none' },
    metadata: {
      stripAll: true,
      preserveOrientation: true,
      preserveColorProfile: false,
    },
    encoderPreference: 'auto',
    backgroundColor: '#ffffff',
  },

  relatedSlugs: ['heic-to-png', 'heic-to-webp', 'png-to-jpg', 'jpg-to-webp'],
};


const webpToJpg: FormatPairRoute = {
  slug: 'webp-to-jpg',
  from: 'webp',
  to: 'jpeg',
  tier: 'star',
  supported: true,

  title: 'Convert WebP to JPG — free, unlimited, nothing uploaded',
  h1: 'Convert WebP to JPG',
  metaDescription:
    'Convert WebP images to JPG in your browser. No upload, no sign-up, no file limit — your files never leave your device.',

  intro: `WebP is Google's image format, announced in 2010 and built on the intra-frame compression from the VP8 video codec. It produces files roughly 25-35% smaller than JPEG at comparable quality, which is why most of the modern web now serves it. Every current browser has supported it since Safari 14 landed in September 2020.

The friction is everything that is not a browser. Desktop software, print shops, photo kiosks and plenty of upload forms still reject WebP outright — which is usually how people arrive here. You saved an image from a website, and now something will not accept it.`,

  whyConvert: [
    'You saved an image from a website and something will not open it. Browsers universally support WebP; the software on your desk frequently does not.',
    'Upload forms reject it. Job portals, government sites and older content management systems often validate on the extension and accept only JPG and PNG.',
    'Print services and photo labs generally require JPEG. WebP is a web delivery format and was never adopted into the print workflow.',
    'Software older than roughly 2020 has no WebP support at all — Photoshop only added it natively in version 23.2, and before that it needed a plugin.',
    'JPG is the safest thing to hand to someone else when you do not know what they will open it with.',
  ],

  technicalNotes: `Both formats are lossy, so this is a second lossy pass and some detail is discarded permanently. At quality 85 and above the difference is invisible at normal viewing sizes; we default to 82, which balances size against quality for photographs.

Expect the JPG to be LARGER than the WebP you started with, often by 25-35%. That is not a fault — it is the whole reason WebP exists. You are trading file size for compatibility, and the target-size mode is there if you need to cap the result.

Transparency is lost. WebP supports a full alpha channel and JPEG does not, so transparent pixels are flattened onto a background colour, white by default. This bites most often with logos and stickers saved from websites. If the image has transparency you care about, convert to PNG instead.

Animated WebP converts only its first frame, because JPEG has no concept of animation.`,

  comparison: {
    rows: [
      {
        label: 'Compression',
        from: 'VP8 intra-frame — 25-35% smaller than JPEG at equal quality',
        to: 'DCT, standardised 1992 — larger, but implemented everywhere',
      },
      {
        label: 'Support',
        from: 'Every current browser since Safari 14 (2020); patchy in desktop and print software',
        to: 'Every browser, operating system and image tool since 1992',
      },
      {
        label: 'Transparency',
        from: 'Yes — full alpha channel, and animation',
        to: 'No — alpha is flattened onto a background colour',
      },
      {
        label: 'Metadata',
        from: 'EXIF, XMP and ICC profiles (stripped here by default)',
        to: 'EXIF and GPS (stripped here by default)',
      },
      {
        label: 'Typical size',
        from: '≈150 KB for a 1200×800 photograph',
        to: '≈200 KB for the same photo at quality 82',
      },
    ],
  },

  faq: [
    {
      q: 'Why is the JPG bigger than the WebP I started with?',
      a: 'Because WebP compresses better. A JPEG carrying the same picture at the same visible quality is typically 25-35% larger, and that gap is exactly why the web moved to WebP. You are buying compatibility with file size. If the result needs to fit a limit, switch to target-size mode and set one.',
    },
    {
      q: 'Will converting WebP to JPG lose quality?',
      a: 'A little. WebP is already lossy, so re-encoding to JPEG is a second lossy pass and some detail goes permanently. At quality 85 and above it is not visible at normal viewing sizes. If you intend to edit the image afterwards, convert to PNG instead — every additional lossy save compounds.',
    },
    {
      q: 'My WebP has a transparent background. What happens to it?',
      a: 'JPEG has no alpha channel, so transparency is flattened onto a solid colour — white unless you change it. For a logo or a sticker that usually looks wrong against a coloured page. Convert to PNG instead if the transparency matters.',
    },
    {
      q: 'Why will my photo editor not open WebP?',
      a: 'Support arrived late outside browsers. Photoshop added it natively only in version 23.2 (2022); earlier versions needed a third-party plugin. Windows Photos needs a Microsoft Store extension, and many print and kiosk systems still have no support at all.',
    },
    {
      q: 'My WebP is animated. Can I keep the animation?',
      a: 'Not as a JPG — JPEG cannot store animation, so only the first frame converts. If you need the animation, keep the WebP or convert to GIF, accepting the much larger file and 256-colour limit.',
    },
  ],

  defaultConfig: {
    outputFormat: 'jpeg',
    sizeMode: { kind: 'quality', quality: 82 },
    resize: { kind: 'none' },
    metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
    encoderPreference: 'auto',
    backgroundColor: '#ffffff',
  },

  relatedSlugs: ['webp-to-png', 'jpg-to-webp', 'png-to-jpg', 'heic-to-jpg'],
};

const webpToPng: FormatPairRoute = {
  slug: 'webp-to-png',
  from: 'webp',
  to: 'png',
  tier: 'star',
  supported: true,

  title: 'Convert WebP to PNG — keeps transparency, nothing uploaded',
  h1: 'Convert WebP to PNG',
  metaDescription:
    'Convert WebP to PNG in your browser, keeping transparency intact. No upload, no sign-up, no quotas.',

  intro: `WebP comes in two quite different varieties that share one file extension. Lossy WebP uses VP8 intra-frame compression and behaves like a smaller JPEG. Lossless WebP uses an entirely different algorithm and behaves like a smaller PNG, typically around 26% smaller for the same pixels.

PNG is the format to convert to when transparency matters. It has been the web's lossless workhorse since 1996, it carries a full alpha channel, and unlike WebP it opens in essentially every piece of software ever written. That combination is why logos, icons, screenshots and anything with a transparent background usually end up as PNG.`,

  whyConvert: [
    'PNG keeps the alpha channel intact, so a logo or icon stays transparent instead of being flattened onto white.',
    'PNG is lossless, so the conversion adds no further generation loss on top of whatever the WebP already has.',
    'Design tools, office software and older operating systems open PNG without extensions or plugins; WebP support outside browsers is still patchy.',
    'Screenshots, diagrams and any image with hard edges and flat colour compress well in PNG and stay crisp — it is the right format for that content.',
    'Many upload forms and content systems accept PNG but silently reject WebP.',
  ],

  technicalNotes: `PNG is lossless, so this conversion never adds new compression artifacts. But lossless does NOT mean it recovers anything. If the source was lossy WebP, the detail that WebP discarded is already gone — PNG simply preserves exactly what it was handed, artifacts included.

Expect the PNG to be considerably larger, often two to five times the WebP. Lossless compression on photographic content is simply much less efficient than lossy compression, and lossless WebP is itself about 26% more efficient than PNG. For a photograph with no transparency, JPG is usually the better target; PNG earns its size when you need transparency or pixel-exact fidelity.

Transparency survives the conversion completely, including partial transparency such as soft shadows and anti-aliased edges.

Animated WebP converts only its first frame, since PNG has no animation. APNG exists but is not what this produces.`,

  comparison: {
    rows: [
      {
        label: 'Compression',
        from: 'Lossy VP8 or lossless — the lossless mode is ~26% smaller than PNG',
        to: 'Lossless DEFLATE, 1996 — larger, never lossy',
      },
      {
        label: 'Support',
        from: 'Every current browser; patchy in desktop, office and print software',
        to: 'Universal — every browser, OS and image tool since 1996',
      },
      {
        label: 'Transparency',
        from: 'Yes — full alpha channel',
        to: 'Yes — full alpha channel, preserved exactly',
      },
      {
        label: 'Metadata',
        from: 'EXIF, XMP and ICC profiles (stripped here by default)',
        to: 'Text chunks and ICC (stripped here by default)',
      },
      {
        label: 'Typical size',
        from: '≈150 KB for a 1200×800 image',
        to: '≈600 KB for the same image, lossless',
      },
    ],
  },

  faq: [
    {
      q: 'Does converting WebP to PNG improve the quality?',
      a: 'No, and no format can. PNG is lossless, so it preserves exactly what it is given — but if the source was lossy WebP, the detail WebP threw away is already gone. What PNG guarantees is that nothing further is lost from this point on, which matters if you plan to edit.',
    },
    {
      q: 'Why is the PNG so much bigger?',
      a: 'Lossless compression is far less efficient on photographic content than lossy compression, and lossless WebP is already about 26% better than PNG at the same job. A two- to five-times increase is normal. If the image is a photo with no transparency, JPG will be dramatically smaller.',
    },
    {
      q: 'Will my transparent background survive?',
      a: 'Yes, completely — including partial transparency such as drop shadows and anti-aliased edges. That is the main reason to pick PNG over JPG as the target.',
    },
    {
      q: 'Should I use PNG or JPG for a photograph?',
      a: 'JPG, almost always. PNG will be several times larger for no visible benefit on photographic content. PNG earns its size on screenshots, logos, diagrams and anything needing transparency or pixel-exact fidelity.',
    },
  ],

  defaultConfig: {
    outputFormat: 'png',
    sizeMode: { kind: 'lossless' },
    resize: { kind: 'none' },
    metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
    encoderPreference: 'auto',
    backgroundColor: '#ffffff',
  },

  relatedSlugs: ['webp-to-jpg', 'png-to-webp', 'svg-to-png', 'png-to-jpg'],
};


const pngToJpg: FormatPairRoute = {
  slug: 'png-to-jpg',
  from: 'png',
  to: 'jpeg',
  tier: 'star',
  supported: true,

  title: 'Convert PNG to JPG — free, unlimited, nothing uploaded',
  h1: 'Convert PNG to JPG',
  metaDescription:
    'Convert PNG to JPG in your browser and cut the file size dramatically. No upload, no sign-up, no file limit.',

  intro: `PNG has been the web's lossless format since 1996. It stores every pixel exactly, carries a full alpha channel, and never degrades no matter how many times you re-save it. That fidelity is the point — and it is also why PNG files get so large.

For a photograph, PNG is the wrong tool. Lossless compression cannot exploit the fact that the human eye barely notices small colour shifts across a gradient, so a PNG photo routinely runs five to ten times the size of a visually identical JPEG. Most people converting PNG to JPG are doing it because a screenshot or an exported photo is too big to email, attach or upload.`,

  whyConvert: [
    'The size difference is enormous. A photographic PNG is commonly five to ten times larger than a visually identical JPG.',
    'Upload limits. Email attachments, job portals and exam registration systems routinely cap uploads at a few megabytes, and a PNG photo blows through that.',
    'Page weight. Serving photographic PNGs is one of the most common causes of a slow page, because the browser must download every lossless byte.',
    'Print services expect JPEG for photographs and often reject PNG outright.',
    'JPEG is the only format you can assume any device, of any age, will open.',
  ],

  technicalNotes: `This is the one conversion where the source is lossless, so there is no accumulated generation loss to worry about — the JPEG you get is a first-generation encode of the original pixels. That makes PNG a genuinely good starting point.

Transparency is the thing to watch. PNG supports a full alpha channel and JPEG supports none, so any transparent pixel is flattened onto a background colour, white unless you change it. A logo that looked fine on a white page will suddenly have a white box around it on a coloured one. If the transparency matters, convert to WebP instead — it keeps alpha and still compresses well.

Content matters more here than in most conversions. JPEG's DCT compression is built for photographs and handles smooth gradients beautifully, but it smears hard edges. Screenshots of text, line art, diagrams and pixel art will show visible ringing around the edges even at high quality. Keep those as PNG, or use WebP.`,

  comparison: {
    rows: [
      {
        label: 'Compression',
        from: 'Lossless DEFLATE, 1996 — every pixel exact, no degradation ever',
        to: 'Lossy DCT, 1992 — dramatically smaller on photographs',
      },
      {
        label: 'Support',
        from: 'Universal — every browser, OS and image tool since 1996',
        to: 'Universal, and the one format print and legacy systems always accept',
      },
      {
        label: 'Transparency',
        from: 'Yes — full alpha channel',
        to: 'No — alpha is flattened onto a background colour',
      },
      {
        label: 'Metadata',
        from: 'Text chunks and ICC profiles (stripped here by default)',
        to: 'EXIF and GPS (stripped here by default)',
      },
      {
        label: 'Typical size',
        from: '≈2.5 MB for a 12 MP photograph',
        to: '≈350 KB for the same photo at quality 82',
      },
    ],
  },

  faq: [
    {
      q: 'How much smaller will the JPG be?',
      a: 'For a photograph, usually five to ten times smaller. For a screenshot of mostly flat colour and text the gap narrows sharply, and JPEG may even look worse — PNG compresses flat colour extremely well, which is precisely the content JPEG handles badly.',
    },
    {
      q: 'My PNG has a transparent background. What happens?',
      a: 'JPEG has no alpha channel, so transparency is flattened onto a solid colour — white unless you change it. A logo with a transparent background will end up in a white box. If you need the transparency, convert to WebP instead: it keeps alpha and is still far smaller than PNG.',
    },
    {
      q: 'Will the JPG look worse than my PNG?',
      a: 'On a photograph, not noticeably at quality 85 and above. On a screenshot containing text, yes — visibly. JPEG smears hard edges, so text and line art pick up a halo. Keep screenshots and diagrams as PNG, or convert them to WebP, which handles both content types well.',
    },
    {
      q: 'Does converting lose quality permanently?',
      a: 'Yes. JPEG is lossy and the discarded detail cannot be recovered, so keep the original PNG if it is your master copy. The upside is that a PNG source is lossless, so this is a clean first-generation encode rather than a lossy file being re-compressed.',
    },
  ],

  defaultConfig: {
    outputFormat: 'jpeg',
    sizeMode: { kind: 'quality', quality: 82 },
    resize: { kind: 'none' },
    metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
    encoderPreference: 'auto',
    backgroundColor: '#ffffff',
  },

  relatedSlugs: ['png-to-webp', 'jpg-to-webp', 'webp-to-png', 'heic-to-jpg'],
};

const pngToWebp: FormatPairRoute = {
  slug: 'png-to-webp',
  from: 'png',
  to: 'webp',
  tier: 'star',
  supported: true,

  title: 'Convert PNG to WebP — smaller, keeps transparency',
  h1: 'Convert PNG to WebP',
  metaDescription:
    'Convert PNG to WebP in your browser. Much smaller files with transparency intact. Nothing is uploaded.',

  intro: `WebP was built to replace both of the web's incumbent formats at once. Its lossless mode compresses about 26% better than PNG while keeping every pixel exact, and its lossy mode goes far smaller still — with a full alpha channel either way, which is the thing JPEG could never offer.

That makes PNG to WebP the rare conversion with no real trade-off. You keep the transparency, you can keep the losslessness if you want it, and the file gets meaningfully smaller. The only cost is compatibility outside the browser, and every current browser has supported WebP since Safari 14 in September 2020.`,

  whyConvert: [
    'Lossless WebP is around 26% smaller than PNG for identical pixels — the same image, fewer bytes, nothing discarded.',
    'Lossy WebP goes dramatically smaller again while keeping the alpha channel, which JPEG cannot do at all.',
    'Transparency survives either way, including soft shadows and anti-aliased edges.',
    'Page weight is the most common real reason: large PNGs are one of the biggest causes of slow-loading pages.',
    'Every current browser supports it, so for anything destined for the web there is no compatibility argument left.',
  ],

  technicalNotes: `WebP has two distinct modes and the choice matters more than the quality slider. Lossless mode keeps every pixel exactly as PNG did and still saves roughly a quarter of the bytes — the right choice for logos, icons, screenshots and anything you will edit later. Lossy mode discards detail like JPEG does but retains the alpha channel, and for photographic content with transparency it is far smaller than anything else available.

Because PNG is lossless, whichever mode you pick this is a first-generation encode. Nothing has been degraded before now.

The remaining caveat is software outside the browser. Photoshop only added native WebP support in version 23.2 (2022), Windows Photos needs a Store extension, and many print and kiosk systems have none. If the file is going to someone else rather than onto a website, PNG or JPG is still the safer hand-off.`,

  comparison: {
    rows: [
      {
        label: 'Compression',
        from: 'Lossless DEFLATE, 1996 — exact, but inefficient',
        to: 'Lossless (~26% smaller than PNG) or lossy — your choice',
      },
      {
        label: 'Support',
        from: 'Universal — every browser, OS and image tool since 1996',
        to: 'Every current browser since Safari 14 (2020); patchy in desktop software',
      },
      {
        label: 'Transparency',
        from: 'Yes — full alpha channel',
        to: 'Yes — full alpha channel, in both lossy and lossless modes',
      },
      {
        label: 'Metadata',
        from: 'Text chunks and ICC profiles (stripped here by default)',
        to: 'EXIF, XMP and ICC (stripped here by default)',
      },
      {
        label: 'Typical size',
        from: '≈2.5 MB for a 12 MP image',
        to: '≈1.8 MB lossless, or ≈300 KB lossy',
      },
    ],
  },

  faq: [
    {
      q: 'Should I pick lossless or lossy WebP?',
      a: 'Lossless for logos, icons, screenshots, diagrams and anything you will edit again — you keep every pixel and still save about a quarter of the size. Lossy for photographs, where the saving is enormous and the loss is invisible at quality 85 and above. Lossy WebP keeps transparency either way, which is its real advantage over JPEG.',
    },
    {
      q: 'Will the transparency survive?',
      a: 'Yes, in both modes, including partial transparency such as drop shadows and anti-aliased edges. This is the main reason WebP replaced PNG for web graphics rather than sitting alongside it.',
    },
    {
      q: 'Is WebP safe to use on a website now?',
      a: 'Yes. Every current browser has supported it since Safari 14 arrived in September 2020. If you must support genuinely ancient browsers, serve WebP with a JPG or PNG fallback via the picture element.',
    },
    {
      q: 'Why will my desktop software not open the WebP?',
      a: 'Support outside browsers arrived late. Photoshop added it natively only in 23.2 (2022), Windows Photos needs a Microsoft Store extension, and many print systems still have none. For files you are sending to other people rather than publishing, PNG or JPG remains the safer choice.',
    },
  ],

  defaultConfig: {
    outputFormat: 'webp',
    sizeMode: { kind: 'quality', quality: 82 },
    resize: { kind: 'none' },
    metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
    encoderPreference: 'auto',
    backgroundColor: '#ffffff',
  },

  relatedSlugs: ['png-to-jpg', 'jpg-to-webp', 'webp-to-png', 'svg-to-png'],
};


const jpgToWebp: FormatPairRoute = {
  slug: 'jpg-to-webp',
  from: 'jpeg',
  to: 'webp',
  tier: 'star',
  supported: true,

  title: 'Convert JPG to WebP — smaller files, nothing uploaded',
  h1: 'Convert JPG to WebP',
  metaDescription:
    'Convert JPG to WebP in your browser and cut file size by around a third. No upload, no sign-up, no limit.',

  intro: `JPEG has been the default photograph format since 1992, and its longevity is its own argument — it opens everywhere, on everything, forever. What it cannot do is compete on size with a codec designed thirty years later.

WebP typically produces files 25-35% smaller than JPEG at the same visible quality, using the intra-frame compression from Google's VP8 video codec. For anything served over a network that is a straightforward win, and it is why most large sites now deliver WebP to any browser that will take it. Since Safari 14 in September 2020, that is all of them.`,

  whyConvert: [
    'Files come out roughly 25-35% smaller at the same visible quality, which is a direct saving on page weight and bandwidth.',
    'Faster pages. Images are usually the largest thing a page downloads, so this is one of the highest-leverage web performance changes available.',
    'WebP supports an alpha channel, so you are no longer locked out of transparency the way JPEG locks you out.',
    'Core Web Vitals: image weight feeds directly into Largest Contentful Paint, which Google uses as a ranking signal.',
    'Every current browser supports it, so for web delivery there is no longer a compatibility reason to stay on JPEG.',
  ],

  technicalNotes: `Both formats are lossy, so this is a second lossy pass — WebP cannot restore anything JPEG already discarded, and it will faithfully preserve any artifacts that are already there. Converting a heavily compressed JPEG produces a smaller file containing the same flaws.

Because of that, quality settings do not carry across. A JPEG saved at quality 80 does not need WebP quality 80 to look identical; WebP typically reaches the same perceived quality several points lower. We default to 82, which is comfortably above the point where the difference is visible at normal viewing sizes.

WebP is a delivery format, not an archival one. Keep your original JPEG as the master and treat the WebP as the copy you publish — re-encoding the WebP back to JPEG later would be a third lossy pass.

Where WebP genuinely loses to JPEG is reach outside the browser: print services, older desktop software and plenty of upload forms still refuse it.`,

  comparison: {
    rows: [
      {
        label: 'Compression',
        from: 'DCT, standardised 1992 — universal, but 30 years behind on efficiency',
        to: 'VP8 intra-frame — 25-35% smaller at equal visible quality',
      },
      {
        label: 'Support',
        from: 'Every browser, operating system and image tool since 1992',
        to: 'Every current browser since Safari 14 (2020); patchy in desktop and print software',
      },
      {
        label: 'Transparency',
        from: 'No — JPEG has no alpha channel at all',
        to: 'Yes — full alpha channel, in both lossy and lossless modes',
      },
      {
        label: 'Metadata',
        from: 'EXIF and GPS (stripped here by default)',
        to: 'EXIF, XMP and ICC (stripped here by default)',
      },
      {
        label: 'Typical size',
        from: '≈350 KB for a 12 MP photo at quality 82',
        to: '≈240 KB for the same photo at the same visible quality',
      },
    ],
  },

  faq: [
    {
      q: 'How much smaller will the WebP be?',
      a: 'Typically 25-35% at the same visible quality. The saving is largest on photographs with smooth gradients and smallest on images that are already heavily compressed, because there is less redundancy left to exploit.',
    },
    {
      q: 'Will converting lose quality?',
      a: 'A little. JPEG is already lossy, so this is a second lossy pass and WebP cannot recover what JPEG discarded — it will also faithfully preserve artifacts that are already in the file. At quality 85 and above the additional loss is not visible at normal viewing sizes.',
    },
    {
      q: 'Should I use the same quality number as my JPEG?',
      a: 'No — the scales are not comparable. WebP generally reaches the same perceived quality several points lower than JPEG, so matching the numbers wastes bytes. Start at our default of 82 and lower it if the file needs to be smaller.',
    },
    {
      q: 'Is it safe to serve WebP to everyone?',
      a: 'For browsers, yes — every current one has supported it since Safari 14 in September 2020. For files you email or send to a print service, stay with JPEG: support outside the browser is still inconsistent.',
    },
  ],

  defaultConfig: {
    outputFormat: 'webp',
    sizeMode: { kind: 'quality', quality: 82 },
    resize: { kind: 'none' },
    metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
    encoderPreference: 'auto',
    backgroundColor: '#ffffff',
  },

  relatedSlugs: ['webp-to-jpg', 'png-to-webp', 'png-to-jpg', 'heic-to-jpg'],
};

const svgToPng: FormatPairRoute = {
  slug: 'svg-to-png',
  from: 'svg',
  to: 'png',
  tier: 'star',
  supported: true,

  title: 'Convert SVG to PNG — pick any resolution, nothing uploaded',
  h1: 'Convert SVG to PNG',
  metaDescription:
    'Convert SVG to PNG at any resolution, in your browser. Transparency preserved. Nothing is uploaded.',

  intro: `An SVG is not a picture. It is a set of drawing instructions — move here, curve there, fill with this colour — which a renderer executes at whatever size you ask for. That is why a logo in SVG stays razor sharp on a phone and on a billboard from the same handful of kilobytes.

Converting to PNG turns those instructions into a fixed grid of pixels, and the moment you do that the resolution is decided forever. This is the one conversion where the size you choose matters more than any quality setting, because there is no quality setting — PNG is lossless. The only real decision is how many pixels you want.`,

  whyConvert: [
    'Most software cannot open SVG. Office suites, older design tools, photo editors and print workflows overwhelmingly expect raster images.',
    'Social platforms and marketplaces reject SVG on upload, almost always because SVG can contain scripts and is a security risk to accept from strangers.',
    'Email clients do not render SVG reliably, so a logo in a signature or newsletter needs to be raster.',
    'App icons, favicons and store listings all require fixed-resolution raster files at specific sizes.',
    'PNG keeps the transparent background that logos and icons almost always depend on.',
  ],

  technicalNotes: `Resolution is the whole decision here. An SVG has no inherent pixel size — the width and height in the file are a default suggestion, not a limit — so we rasterise to 1024 pixels on the longest edge and preserve the aspect ratio. Use the resize control if you need a specific size, and pick it before you convert: enlarging the PNG afterwards just blurs it, whereas re-rasterising the SVG at the larger size stays perfectly sharp. Keep the SVG as your master for exactly that reason.

Transparency is preserved, which is why PNG is the right raster target for a logo. JPEG would flatten the background onto white.

Fonts are the common failure. An SVG that references a font by name relies on that font being installed where it is rendered; if it is missing, the renderer substitutes something else and your text changes shape. If the type matters, convert the text to outlines in your design tool before exporting the SVG.

External references do not load. An SVG that pulls in a remote image or stylesheet will rasterise without them — which is also the safe behaviour, since it means opening an SVG here cannot trigger a network request.`,

  comparison: {
    rows: [
      {
        label: 'Compression',
        from: 'Vector — XML drawing instructions, resolution-independent',
        to: 'Lossless DEFLATE raster — a fixed grid of pixels',
      },
      {
        label: 'Support',
        from: 'Browsers and design tools; rejected by most upload forms and office software',
        to: 'Universal — every browser, OS and image tool since 1996',
      },
      {
        label: 'Transparency',
        from: 'Yes — and anything not drawn is simply transparent',
        to: 'Yes — full alpha channel, preserved exactly',
      },
      {
        label: 'Metadata',
        from: 'Arbitrary XML, title and description elements, editor cruft',
        to: 'Text chunks and ICC profiles (stripped here by default)',
      },
      {
        label: 'Typical size',
        from: '≈8 KB for a logo, at any display size',
        to: '≈40 KB at 1024px, and larger at every larger size',
      },
    ],
  },

  faq: [
    {
      q: 'What resolution should I choose?',
      a: 'Match the largest size it will ever be displayed at, then double it for high-density screens. A 500px-wide logo on a website wants a 1000px PNG. We default to 1024px on the longest edge, which suits most logo and icon work. Choose before converting — enlarging a PNG afterwards blurs it, while re-rasterising the SVG stays sharp.',
    },
    {
      q: 'Why did my text change appearance?',
      a: 'Because the SVG references a font by name and that font is not available where it is being rendered, so a substitute was used. Convert text to outlines or paths in your design tool before exporting the SVG — then the letterforms are shapes and render identically everywhere.',
    },
    {
      q: 'Will the transparent background survive?',
      a: 'Yes. Anything the SVG does not draw becomes transparent in the PNG, including anti-aliased edges. If you want a solid background instead, convert to JPG and set the background colour.',
    },
    {
      q: 'Can I convert back from PNG to SVG?',
      a: 'Not meaningfully. Rasterising throws away the drawing instructions and leaves only pixels; going back means tracing, which approximates the shapes and rarely matches the original. Keep the SVG as your master and treat every PNG as a disposable export.',
    },
  ],

  defaultConfig: {
    outputFormat: 'png',
    sizeMode: { kind: 'lossless' },
    resize: { kind: 'none' },
    metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
    encoderPreference: 'auto',
    backgroundColor: '#ffffff',
  },

  relatedSlugs: ['png-to-webp', 'png-to-jpg', 'webp-to-png', 'jpg-to-webp'],
};

/**
 * Every published format-pair route. Milestone 6 adds the remaining six ★ pairs;
 * Waves 2-4 are pure data additions here and must require no code changes.
 */
export const formatPairRoutes: FormatPairRoute[] = [
  heicToJpg,
  webpToJpg,
  webpToPng,
  pngToJpg,
  pngToWebp,
  jpgToWebp,
  svgToPng,
];

/** Only routes the engine genuinely performs are ever prerendered (docs/09 §3). */
export const publishedFormatPairRoutes = formatPairRoutes.filter((r) => r.supported);

export function getFormatPairRoute(slug: string): FormatPairRoute | undefined {
  return publishedFormatPairRoutes.find((r) => r.slug === slug);
}

/** Display label for a format, for table headers and prose. */
export const FORMAT_LABEL: Record<string, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  bmp: 'BMP',
  tiff: 'TIFF',
  heic: 'HEIC',
  heif: 'HEIF',
  avif: 'AVIF',
  // A display label only — there is NO jxl-destination route, deliberately.
  // Wave 4 is shelved (docs/12 D-58, WO-8): every JXL route needs JXL ENCODE,
  // which no canvas provides and no WASM build provides under the 1.2 MB
  // per-codec cap in docs/04 §7 (smallest is 1.36 MB). Revisit only when a
  // browser ships native JXL encode, or a sub-1.2 MB encoder build exists.
  jxl: 'JPEG XL',
  svg: 'SVG',
};

/**
 * Wave 3 (docs/09 §6): 11 reference pages, one per InputFormat. The template at
 * /formats/[format] is built and getStaticPaths reads this array, so adding
 * entries here is the entire change.
 */
export const formatReferenceRoutes: FormatReferenceRoute[] = [];

export const publishedFormatReferenceRoutes = formatReferenceRoutes.filter((r) => r.supported);
