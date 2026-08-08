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
import { publishedSizePresetRoutes, formatTarget } from './presets';
import type { QueryEntry } from '../core/query-match';
import { publishedTools } from '../core/tools';

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
  terms: [...CONVERT_TERMS, route.from, route.to, 'photo', 'image'],
  must: [route.from],
  excludes: [...NOT_AN_IMAGE],
}));

/**
 * Size presets: /compress/jpg-to-100kb and friends.
 *
 * `takesSize` is false here on purpose. These routes have a FIXED target baked
 * into the slug, so offering to prefill a different one would be a lie about
 * where the link goes — "Compress JPG to 150 KB" pointing at the 100 KB route.
 * A query naming an arbitrary size is served by the generic entry below.
 */
const presetEntries: QueryEntry[] = publishedSizePresetRoutes.map((route) => ({
  path: '/compress/' + route.slug,
  label: 'Compress ' + (FORMAT_LABEL[route.format] ?? route.format) + ' to ' + formatTarget(route.targetBytes),
  terms: [...COMPRESS_TERMS, route.format, 'photo', 'image'],
  must: ['compress'],
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
