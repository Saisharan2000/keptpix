/**
 * src/content/query-index.ts
 *
 * The searchable index behind the on-site query matcher (docs/kepttools/04 §1
 * layer 2). Built at module scope, so it is a compile-time constant that ships
 * with the page — a few KB, no request, nothing transmitted.
 *
 * EVERY ENTRY IS DERIVED FROM PUBLISHED ROUTE DATA. Hand-writing paths here
 * would let the matcher confidently send someone to a 404, and would rot the
 * first time a route changed slug. `publishedFormatPairRoutes`,
 * `publishedSizePresetRoutes` and `publishedTools` have already had their
 * `supported` gates applied, so an unbuilt route cannot appear in a suggestion
 * (the same discipline as docs/12 D-79, for the same reason).
 *
 * What IS hand-written is the vocabulary: which words point at which kind of
 * task. That is editorial judgement about how people phrase things, and it is
 * the part worth a human's attention.
 */
import { publishedFormatPairRoutes, FORMAT_LABEL } from './formats';
import { publishedResizePresetRoutes, publishedSizePresetRoutes, formatTarget } from './presets';
import { normalise, type QueryEntry } from '../core/query-match';
import { publishedTools } from '../core/tools';

/**
 * A format id as the MATCHER will see it, not as the route data spells it.
 *
 * These two vocabularies had drifted. Route data calls the format `jpeg`;
 * `normalise()` folds every spelling a user types — jpeg, jpe — down to `jpg`.
 * So `must: ['jpeg']` required a token no query could ever produce, and
 * `/convert/jpg-to-webp` was **unreachable from the search box entirely**: asking
 * for "jpg to webp" returned `/convert/webp-to-jpg`, the exact reverse.
 *
 * Putting every format id through the same function a query goes through is what
 * makes the two vocabularies unable to drift again. A hand-written alias map here
 * would be a second copy of SYNONYMS, which is how this happened.
 */
function tok(format: string): string {
  return normalise(format)[0] ?? format;
}

/**
 * Every format the product can NAME, as matcher tokens. Wider than the set it can
 * convert — `FORMAT_LABEL` carries avif, gif, bmp, tiff and jxl for the reference
 * pages, and a user will type those whether or not a pair route exists.
 */
const ALL_FORMAT_TOKENS: readonly string[] = [
  ...new Set(Object.keys(FORMAT_LABEL).map(tok)),
];

/** Words that mean "change this file's format". */
const CONVERT_TERMS = ['convert', 'change', 'format'] as const;
/** Words that mean "make this file smaller". */
const COMPRESS_TERMS = ['compress', 'size', 'kb', 'mb', 'limit', 'under', 'below', 'max'] as const;

/**
 * Formats the IMAGE tools cannot touch.
 *
 * Naming one of these disqualifies an image entry rather than merely failing to
 * boost it. "compress my pdf to 200kb" contains every token the image
 * compressor wants and nothing it requires is missing, so without this it wins
 * and offers a tool that physically cannot do the job. `gif` is deliberately
 * absent — it is a real image input.
 */
const NOT_AN_IMAGE = ['pdf', 'video', 'mp4', 'mov', 'mkv', 'webm', 'audio', 'mp3', 'qr'] as const;

/**
 * Format-pair routes: /convert/heic-to-jpg and friends.
 *
 * `must` carries the SOURCE format, not the action. A query naming a format is
 * far more discriminating than one naming a verb — "heic" can only mean one
 * family of routes, while "convert" means all of them, and requiring the verb
 * would miss "iphone photos to jpg" which never says it.
 */
const pairEntries: QueryEntry[] = publishedFormatPairRoutes.map((route) => ({
  path: '/convert/' + route.slug,
  label: (FORMAT_LABEL[route.from] ?? route.from) + ' to ' + (FORMAT_LABEL[route.to] ?? route.to),
  terms: [...CONVERT_TERMS, tok(route.from), tok(route.to), 'photo', 'image'],
  must: [tok(route.from)],
  /*
   * NOT_AN_IMAGE's principle — naming a format an entry cannot handle removes it
   * from consideration — extended from PDF/video to the image formats themselves.
   *
   * Without this, "avif to jpg" satisfied `must: ['jpg']` on the JPG→WebP entry
   * (the query names jpg, as its DESTINATION) and was answered with a converter
   * that reads a format the user never mentioned. There is no AVIF pair route, so
   * the honest answer is nothing, and nothing is what this produces. It also
   * sharpens the ordinary cases: "convert png to jpg" no longer offers PNG→WebP,
   * because the query named the output it wanted and it was not WebP.
   */
  excludes: [
    ...NOT_AN_IMAGE,
    ...ALL_FORMAT_TOKENS.filter((f) => f !== tok(route.from) && f !== tok(route.to)),
  ],
  /*
   * Both halves of a reciprocal pair (webp→png and png→webp) list the same two
   * format tokens and each requires its own source, so either query satisfied
   * both and tied on score — and the winner was whichever path sorted first.
   * "webp to png" was answered with the PNG→WebP converter, producing the exact
   * opposite of the request. Position is the only thing that separates them.
   */
  order: [tok(route.from), tok(route.to)] as const,
}));

/**
 * Size presets: /compress/jpg-to-100kb and friends.
 *
 * `takesSize` is false here on purpose. These routes have a FIXED target baked
 * into the slug, so offering to prefill a different one would be a lie about
 * where the link goes — "Compress JPG to 150 KB" pointing at the 100 KB route.
 * A query naming an arbitrary size is served by the generic entry below.
 */
const presetEntries: QueryEntry[] = publishedSizePresetRoutes.map((route) => {
  // SUBJECT routes (signature, passport, pan, gd) match on their subject word,
  // not on the verb "compress" — real form queries never say "compress"
  // (docs/12 D-135). The generic byte-target routes keep the verb, so
  // "compress jpg" still finds them and a subject word cannot hijack them.
  if (route.keywords !== undefined && route.keywords.length > 0) {
    const [primary] = route.keywords;
    return {
      path: '/compress/' + route.slug,
      label: route.cardName ?? 'Compress to ' + formatTarget(route.targetBytes),
      terms: [...COMPRESS_TERMS, ...route.keywords, route.format, 'photo', 'image'],
      must: [primary as string],
      excludes: [...NOT_AN_IMAGE],
    };
  }
  return {
    path: '/compress/' + route.slug,
    label: 'Compress ' + (FORMAT_LABEL[route.format] ?? route.format) + ' to ' + formatTarget(route.targetBytes),
    terms: [...COMPRESS_TERMS, route.format, 'photo', 'image'],
    must: ['compress'],
    excludes: [...NOT_AN_IMAGE],
  };
});

/**
 * Resize presets: /resize/signature-140x60 and friends (docs/12 D-130).
 *
 * `must` is the dimension token itself — "resize signature 140x60" keeps
 * "140x60" as one token through normalise() (the x is alphanumeric), and a
 * query naming the exact dimensions is the least ambiguous signal a matcher
 * ever gets. No dimension token, no match; the generic /resize hub serves
 * "resize my photo".
 */
const resizeEntries: QueryEntry[] = publishedResizePresetRoutes.map((route) => ({
  path: '/resize/' + route.slug,
  label: route.h1,
  terms: ['resize', 'size', 'pixels', 'px', route.width + 'x' + route.height],
  must: [route.width + 'x' + route.height],
  excludes: [...NOT_AN_IMAGE],
}));

/**
 * Manifest tools: /pdf/from-images and whatever follows it.
 *
 * Terms come from the tool's own accept list, so a tool that accepts HEIC is
 * findable by "iphone" without anyone remembering to add it — the manifest is
 * already the single source of truth for what a tool eats.
 */
const TOOL_TERMS: Record<string, readonly string[]> = {
  'images-to-pdf': ['pdf', 'photo', 'image', 'scan', 'document', 'screenshot', 'convert'],
};

const toolEntries: QueryEntry[] = publishedTools.map((tool) => {
  const fromAccept = tool.accept
    .map((mime) => mime.replace(/^image\//, '').replace(/^\./, ''))
    .filter((token) => /^[a-z]+$/.test(token));
  const category = tool.slug.split('/')[1] ?? '';

  return {
    path: tool.slug,
    label: tool.name,
    terms: [...(TOOL_TERMS[tool.id] ?? []), ...fromAccept, category],
    // The category word — 'pdf', 'video', 'qr' — is what separates these from
    // the image tools. "convert photos" must not surface the PDF builder.
    must: [category],
  };
});

/**
 * The generic hubs, and the only entry that accepts an arbitrary size.
 *
 * This is what makes "compress to 137kb" work when no 137 KB route exists: it
 * matches here, and the detected size rides along as `?target=` for the tool to
 * prefill. That is the whole point of layer 2 — covering the infinite tail
 * without a page per value, which would be the doorway pattern.
 */
const hubEntries: QueryEntry[] = [
  {
    path: '/compress',
    label: 'Compress an image to {size}',
    terms: [...COMPRESS_TERMS, 'photo', 'image', 'jpg', 'png', 'webp'],
    must: ['compress'],
    excludes: [...NOT_AN_IMAGE],
    takesSize: true,
  },
  {
    path: '/convert',
    label: 'Convert an image',
    terms: [...CONVERT_TERMS, 'photo', 'image'],
    must: ['convert'],
    excludes: [...NOT_AN_IMAGE],
  },
  {
    path: '/resize',
    label: 'Resize an image',
    terms: ['resize', 'photo', 'image', 'width', 'height', 'pixels', 'px'],
    must: ['resize'],
    excludes: [...NOT_AN_IMAGE],
  },
  {
    path: '/metadata',
    label: 'View and strip photo metadata',
    terms: ['metadata', 'photo', 'image', 'privacy'],
    must: ['metadata'],
    excludes: [...NOT_AN_IMAGE],
  },
];

export const QUERY_INDEX: readonly QueryEntry[] = [
  ...toolEntries,
  ...pairEntries,
  ...presetEntries,
  ...resizeEntries,
  ...hubEntries,
];

/**
 * Example queries shown before anyone types.
 *
 * Phrased the way people actually search — full sentences, brand-free — because
 * the box's job is to teach that it understands that, and a list of keywords
 * would teach the opposite.
 */
export const QUERY_EXAMPLES: readonly string[] = [
  'convert my iphone photos to jpg',
  'compress a photo under 200kb',
  'turn screenshots into one pdf',
  'remove gps from my photos',
];
