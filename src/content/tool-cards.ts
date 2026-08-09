/**
 * src/content/tool-cards.ts
 *
 * Card data for every tool: name, one-line description, icon.
 *
 * DERIVED from the published route data wherever the shape allows, so a card
 * cannot point at a route that does not build and cannot go missing when one
 * ships (docs/12 D-79 is what happens when a list like this is hand-kept).
 *
 * What is hand-written is the one-line description, because that is the line a
 * person reads to decide, and a generated one reads like a generated one. The
 * size presets are the exception — those genuinely are formulaic, and saying
 * "Fits an exact 100 KB limit" six times with different numbers is correct.
 */
import { publishedFormatPairRoutes, FORMAT_LABEL } from './formats';
import { publishedSizePresetRoutes, formatTarget } from './presets';
import { toolManifest, type ToolId } from '../core/tools';

/**
 * The icon set, named here rather than in the component.
 *
 * A `.ts` module cannot import a type from a `.astro` file, and docs/07 §2 does
 * not grant `content/` access to `components/` in any case — the arrow points
 * the other way. So the vocabulary lives here and ToolIcon.astro imports it.
 */
export type ToolIconName =
  | 'convert'
  | 'compress'
  | 'resize'
  | 'metadata'
  | 'merge-pdf'
  | 'split-pdf'
  | 'rotate-pdf'
  | 'images-to-pdf'
  | 'pdf-to-images';

export interface ToolCardData {
  readonly href: string;
  readonly name: string;
  readonly description: string;
  readonly icon: ToolIconName;
  readonly unbuilt?: boolean;
}

/** Why someone converts THIS pair. Written per pair; a template would not do. */
const PAIR_DESCRIPTIONS: Record<string, string> = {
  'heic-to-jpg': 'Opens anywhere',
  'png-to-jpg': 'Smaller, no alpha',
  'webp-to-jpg': 'For sites refusing WebP',
  'jpg-to-webp': 'A third of the size',
  'png-to-webp': 'Smaller, keeps alpha',
  'webp-to-png': 'Lossless, with alpha',
  'svg-to-png': 'Vector at a fixed size',
};

/** Icon and description per manifest tool. */
const TOOL_META: Partial<Record<ToolId, { icon: ToolIconName; description: string }>> = {
  'images-to-pdf': { icon: 'images-to-pdf', description: 'Photos into one PDF' },
  'pdf-merge': { icon: 'merge-pdf', description: 'Several PDFs into one' },
  'pdf-split': { icon: 'split-pdf', description: 'One file per range' },
  'pdf-rotate': { icon: 'rotate-pdf', description: 'Fix sideways scans' },
  'pdf-to-images': { icon: 'pdf-to-images', description: 'Pages as JPG or PNG' },
  // Declared but unbuilt — shown honestly on /all-tools, never as links.
  'pdf-compress': { icon: 'compress', description: 'Shrink a PDF to a target size' },
  'pdf-sign': { icon: 'metadata', description: 'Add a signature to a document' },
  'video-compress': { icon: 'compress', description: 'Shrink a video to a size limit' },
  'video-trim': { icon: 'split-pdf', description: 'Cut a clip out of a video' },
  'video-to-gif': { icon: 'convert', description: 'Turn a clip into an animated GIF' },
  'video-extract-audio': { icon: 'convert', description: 'Pull the audio out of a video' },
  'qr-generate': { icon: 'metadata', description: 'Make a QR code for a link or WiFi' },
};

export const convertCards: readonly ToolCardData[] = publishedFormatPairRoutes.map((route) => ({
  href: '/convert/' + route.slug,
  name: (FORMAT_LABEL[route.from] ?? route.from) + ' to ' + (FORMAT_LABEL[route.to] ?? route.to),
  description: PAIR_DESCRIPTIONS[route.slug] ?? 'Convert between image formats',
  icon: 'convert' as const,
}));

export const compressCards: readonly ToolCardData[] = publishedSizePresetRoutes.map((route) => ({
  href: '/compress/' + route.slug,
  name: 'Compress to ' + formatTarget(route.targetBytes),
  description: 'Fits an exact ' + formatTarget(route.targetBytes) + ' limit',
  icon: 'compress' as const,
}));

/** Manifest tools that are built. */
export const documentCards: readonly ToolCardData[] = toolManifest
  .filter((tool) => tool.supported)
  .map((tool) => ({
    href: tool.slug,
    name: tool.name,
    description: TOOL_META[tool.id]?.description ?? 'Work with documents on your device',
    icon: TOOL_META[tool.id]?.icon ?? 'images-to-pdf',
  }));

/** Declared, not built. Named honestly rather than hidden. */
export const unbuiltCards: readonly ToolCardData[] = toolManifest
  .filter((tool) => !tool.supported)
  .map((tool) => ({
    href: tool.slug,
    name: tool.name,
    description: TOOL_META[tool.id]?.description ?? 'Planned',
    icon: TOOL_META[tool.id]?.icon ?? 'convert',
    unbuilt: true,
  }));

export const otherCards: readonly ToolCardData[] = [
  {
    href: '/resize',
    name: 'Resize',
    description: 'Exact dimensions',
    icon: 'resize',
  },
  {
    href: '/metadata',
    name: 'Metadata',
    description: 'See and remove GPS data',
    icon: 'metadata',
  },
];

/**
 * The six shown on the homepage.
 *
 * Chosen for how common the PROBLEM is, not to show off range: an iPhone photo
 * that will not upload, a form demanding 100 KB, and a pile of receipts that
 * has to become one PDF are the three reasons most people arrive.
 */
export const commonFixes: readonly ToolCardData[] = [
  convertCards.find((c) => c.href === '/convert/heic-to-jpg'),
  compressCards.find((c) => c.href === '/compress/jpg-to-100kb'),
  convertCards.find((c) => c.href === '/convert/png-to-jpg'),
  convertCards.find((c) => c.href === '/convert/jpg-to-webp'),
  otherCards[0],
  otherCards[1],
].filter((card): card is ToolCardData => card !== undefined);

/** Category counts for the browse row, derived so they cannot go stale. */
export const categories: ReadonlyArray<{
  readonly href: string;
  readonly name: string;
  readonly count: number;
  readonly description: string;
}> = [
  {
    href: '/convert',
    name: 'Convert',
    count: convertCards.length,
    description: 'Between image formats',
  },
  {
    href: '/compress',
    name: 'Compress',
    count: compressCards.length,
    description: 'To an exact file size',
  },
  {
    href: '/all-tools',
    name: 'Everything',
    count: convertCards.length + compressCards.length + documentCards.length + otherCards.length,
    description: 'The full list',
  },
];
