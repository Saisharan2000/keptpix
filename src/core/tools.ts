/**
 * src/core/tools.ts — the ToolManifest, single source of truth for what exists.
 *
 * Spec: docs/kepttools/03-engines-contracts.md §1.
 *
 * This is the scaling mechanic for everything beyond images. KeptPix today is
 * ONE tool — the image pipeline — reached through many entry routes; the PDF,
 * video and QR families are MANY tools behind one shell. Adding one is data
 * plus (at most) one engine adapter — never shell surgery. Standing rule 1 in
 * docs/kepttools/05-build-plan.md states it as a bright line: "a new tool that
 * needs shell surgery is a design failure — fix the manifest abstraction, not
 * the tool."
 *
 * ON THE `kepttools/` DOC PATH: those docs were written for a second property
 * on its own domain. That split was dropped — the tools ship HERE, on
 * keptpix.com, as `/pdf/*`, `/video/*` and `/qr/*`, because one domain
 * accumulates search authority instead of halving it and costs nothing extra.
 * Everything in those docs about engines, contracts, routes and milestones
 * still applies as written; only the hostname changed. See docs/12 D-75.
 *
 * ADR-006 still applies: this file is pure TypeScript, no DOM, no browser
 * globals, and it must run under plain Node in Vitest. It holds declarations,
 * not behaviour — the engines interpret these specs, they are not implemented
 * here.
 *
 * `supported` is the same hard gate as FormatPairRoute and SizePresetRoute
 * (docs/09 §1.2): an entry that is false builds no route, appears in no
 * sitemap, and is offered nowhere. Every entry ships false until the engine
 * behind it genuinely works, which is what keeps a 60-route site from being
 * the doorway pattern that gets fresh domains deindexed.
 */

// ─── Identity ─────────────────────────────────────────────────────────────

export type ToolId =
  | 'pdf-merge'
  | 'pdf-compress'
  | 'images-to-pdf'
  | 'pdf-to-images'
  | 'pdf-split'
  | 'pdf-rotate'
  | 'pdf-sign'
  | 'video-compress'
  | 'video-trim'
  | 'video-to-gif'
  | 'video-extract-audio'
  | 'qr-generate';

/**
 * `image` is absent deliberately, and this is not an oversight.
 *
 * The image pipeline predates the manifest and has a hand-built shell whose
 * format-aware controls and preset management no declarative spec should try to
 * express. It keeps its own routes (`/convert/*`, `/compress/*`, `/resize`,
 * `/metadata`) and its own ConfigPanel, all untouched. The manifest governs the
 * families added AFTER it.
 *
 * The image engine stays registered and importable either way — the PDF
 * compressor re-encodes embedded images through it (docs/kepttools/03 §2).
 */
export type EngineId = 'pdf' | 'video' | 'qr';

// ─── Config field specs ───────────────────────────────────────────────────

/**
 * A value a tool's config panel can hold. Deliberately primitive: the manifest
 * describes a panel declaratively, and each engine narrows this bag into its
 * own typed options object at the boundary. Widening this to arbitrary objects
 * would let tools smuggle behaviour into data and defeat the whole mechanic.
 */
export type ConfigValue = string | number | boolean;

/** Keyed by `ConfigFieldSpec.id`. */
export type ToolConfig = Readonly<Record<string, ConfigValue>>;

export interface ConfigFieldBase {
  id: string;
  label: string;
  /** Rendered as help text under the control. */
  help?: string;
}

/**
 * The shapes the parameterized ConfigPanel knows how to render. Adding a tool
 * that needs a control not in this union is the one case that legitimately
 * touches the shell — and it is a new `kind` here plus a new branch in the
 * panel, never a per-tool conditional.
 */
export type ConfigFieldSpec =
  | (ConfigFieldBase & {
      kind: 'targetSize';
      defaultBytes: number;
      minBytes: number;
      maxBytes: number;
    })
  | (ConfigFieldBase & {
      kind: 'select';
      options: readonly { readonly value: string; readonly label: string }[];
      default: string;
    })
  | (ConfigFieldBase & {
      kind: 'number';
      min: number;
      max: number;
      step: number;
      default: number;
      unit?: string;
    })
  | (ConfigFieldBase & { kind: 'toggle'; default: boolean })
  | (ConfigFieldBase & {
      kind: 'text';
      default: string;
      placeholder?: string;
      maxLength?: number;
    })
  /** Free-form page selection, e.g. "1-3, 7, 9-12". Parsed in core/. */
  | (ConfigFieldBase & { kind: 'pageRange'; default: string; placeholder?: string });

// ─── The manifest entry ───────────────────────────────────────────────────

export interface ToolManifestEntry {
  id: ToolId;
  /** Absolute route path, e.g. '/pdf/merge' (docs/kepttools/04 §2). */
  slug: string;
  engine: EngineId;
  /** Short imperative name used in headings and the shell's own copy. */
  name: string;
  /**
   * MIME types and extensions for the dropzone's `accept`. EMPTY means the
   * tool takes no file input at all — QR generation builds its payload from
   * typed fields — and the shell must render no dropzone for it.
   */
  accept: readonly string[];
  multiFile: boolean;
  output: 'single' | 'zip';
  configFields: readonly ConfigFieldSpec[];
  defaultConfig: ToolConfig;
  /** Wires in core/target-size.ts when true. */
  targetSizeCapable: boolean;
  /** 'pro' = gated behind the kept-pro claim (Phase 4). */
  licenseTier: 'free' | 'pro';
  /** The hard gate. False builds nothing. */
  supported: boolean;
}

// ─── Shared field specs ───────────────────────────────────────────────────

const PDF_ACCEPT = ['application/pdf', '.pdf'] as const;

const IMAGE_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/tiff',
] as const;

const VIDEO_ACCEPT = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  '.mp4',
  '.webm',
  '.mov',
  '.mkv',
] as const;

// ─── The manifest ─────────────────────────────────────────────────────────

/**
 * Every tool the property intends to ship, in the build order of
 * docs/kepttools/05-build-plan.md.
 *
 * All twelve ship `supported: false` at M0. M1 flips the five PDF structural
 * tools, M2 flips pdf-compress, M4 the video family, M5 qr-generate. Flipping
 * one is the last step of its milestone, after its acceptance criteria are
 * green — never before, because a published route the engine cannot perform is
 * exactly the thing the gate exists to prevent.
 */
export const toolManifest: readonly ToolManifestEntry[] = [
  {
    id: 'pdf-merge',
    slug: '/pdf/merge',
    engine: 'pdf',
    name: 'Merge PDF',
    accept: PDF_ACCEPT,
    multiFile: true,
    output: 'single',
    configFields: [
      {
        kind: 'toggle',
        id: 'keepBookmarks',
        label: 'Keep bookmarks and outlines',
        help: 'Preserves each source document’s outline entries under the merged document.',
        default: true,
      },
    ],
    defaultConfig: { keepBookmarks: true },
    targetSizeCapable: false,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'pdf-compress',
    slug: '/pdf/compress',
    engine: 'pdf',
    name: 'Compress PDF',
    accept: PDF_ACCEPT,
    multiFile: true,
    output: 'single',
    configFields: [
      {
        kind: 'targetSize',
        id: 'targetBytes',
        label: 'Target file size',
        help: 'We search image quality and downsampling together to land just under this.',
        defaultBytes: 200_000,
        minBytes: 20_000,
        maxBytes: 20_000_000,
      },
      {
        kind: 'toggle',
        id: 'downsampleImages',
        label: 'Allow image downsampling',
        help: 'Off keeps embedded images at their original pixel size, which raises the floor.',
        default: true,
      },
    ],
    defaultConfig: { targetBytes: 200_000, downsampleImages: true },
    targetSizeCapable: true,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'images-to-pdf',
    slug: '/pdf/from-images',
    engine: 'pdf',
    name: 'Images to PDF',
    accept: IMAGE_ACCEPT,
    multiFile: true,
    output: 'single',
    configFields: [
      {
        kind: 'select',
        id: 'pageSize',
        label: 'Page size',
        options: [
          { value: 'fit', label: 'Fit to image' },
          { value: 'a4', label: 'A4' },
          { value: 'letter', label: 'US Letter' },
        ],
        default: 'fit',
      },
      {
        kind: 'select',
        id: 'orientation',
        label: 'Orientation',
        options: [
          { value: 'auto', label: 'Match each image' },
          { value: 'portrait', label: 'Portrait' },
          { value: 'landscape', label: 'Landscape' },
        ],
        default: 'auto',
      },
      {
        kind: 'number',
        id: 'marginMm',
        label: 'Margin',
        min: 0,
        max: 50,
        step: 1,
        default: 0,
        unit: 'mm',
      },
    ],
    defaultConfig: { pageSize: 'fit', orientation: 'auto', marginMm: 0 },
    targetSizeCapable: false,
    licenseTier: 'free',
    // The first tool through the gate (docs/12 D-75). Its engine writes PDF
    // directly with no library, and a baseline JPEG goes in byte for byte.
    supported: true,
  },
  {
    id: 'pdf-to-images',
    slug: '/pdf/to-images',
    engine: 'pdf',
    name: 'PDF to images',
    accept: PDF_ACCEPT,
    multiFile: false,
    output: 'zip',
    configFields: [
      {
        kind: 'select',
        id: 'format',
        label: 'Image format',
        options: [
          { value: 'jpeg', label: 'JPG' },
          { value: 'png', label: 'PNG' },
        ],
        default: 'jpeg',
      },
      {
        kind: 'number',
        id: 'dpi',
        label: 'Resolution',
        min: 72,
        max: 600,
        step: 1,
        default: 150,
        unit: 'DPI',
      },
      {
        kind: 'pageRange',
        id: 'pages',
        label: 'Pages',
        help: 'Leave empty for every page.',
        default: '',
        placeholder: '1-3, 7, 9-12',
      },
    ],
    defaultConfig: { format: 'jpeg', dpi: 150, pages: '' },
    targetSizeCapable: false,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'pdf-split',
    slug: '/pdf/split',
    engine: 'pdf',
    name: 'Split PDF',
    accept: PDF_ACCEPT,
    multiFile: false,
    output: 'zip',
    configFields: [
      {
        kind: 'pageRange',
        id: 'ranges',
        label: 'Ranges to extract',
        help: 'Each range becomes its own PDF in the ZIP.',
        default: '',
        placeholder: '1-3, 4-8, 9-12',
      },
    ],
    defaultConfig: { ranges: '' },
    targetSizeCapable: false,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'pdf-rotate',
    slug: '/pdf/rotate',
    engine: 'pdf',
    name: 'Rotate PDF',
    accept: PDF_ACCEPT,
    multiFile: false,
    output: 'single',
    configFields: [
      {
        kind: 'select',
        id: 'angle',
        label: 'Rotation',
        options: [
          { value: '90', label: '90° clockwise' },
          { value: '180', label: '180°' },
          { value: '270', label: '90° anticlockwise' },
        ],
        default: '90',
      },
      {
        kind: 'pageRange',
        id: 'pages',
        label: 'Pages',
        help: 'Leave empty to rotate every page.',
        default: '',
        placeholder: '1-3, 7',
      },
    ],
    defaultConfig: { angle: '90', pages: '' },
    targetSizeCapable: false,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'pdf-sign',
    slug: '/pdf/sign',
    engine: 'pdf',
    name: 'Sign PDF',
    accept: PDF_ACCEPT,
    multiFile: false,
    output: 'single',
    /**
     * `free`, despite docs/kepttools/01 listing sign as the first licence-tier
     * candidate. docs/kepttools/02 §6 is the binding statement and it scopes
     * pro to saved signature TEMPLATES, batch QR, and preset packs — not to the
     * act of signing. Gating the core operation would break the "free,
     * unlimited, no watermarks, forever, for the core" promise the property's
     * credibility rests on.
     */
    configFields: [
      {
        kind: 'select',
        id: 'placement',
        label: 'Placement',
        options: [
          { value: 'last', label: 'Last page' },
          { value: 'first', label: 'First page' },
          { value: 'all', label: 'Every page' },
        ],
        default: 'last',
      },
    ],
    defaultConfig: { placement: 'last' },
    targetSizeCapable: false,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'video-compress',
    slug: '/video/compress',
    engine: 'video',
    name: 'Compress video',
    accept: VIDEO_ACCEPT,
    multiFile: false,
    output: 'single',
    configFields: [
      {
        kind: 'targetSize',
        id: 'targetBytes',
        label: 'Target file size',
        help: 'Two-pass bitrate targeting, then a corrective pass if needed.',
        defaultBytes: 8_000_000,
        minBytes: 1_000_000,
        maxBytes: 500_000_000,
      },
      {
        kind: 'toggle',
        id: 'allowDownscale',
        label: 'Allow resolution downscale',
        help: 'Lets the encoder step 1080p → 720p → 480p when even the bitrate floor overshoots.',
        default: true,
      },
      {
        kind: 'toggle',
        id: 'keepAudio',
        label: 'Keep audio',
        default: true,
      },
    ],
    defaultConfig: {
      targetBytes: 8_000_000,
      allowDownscale: true,
      keepAudio: true,
    },
    targetSizeCapable: true,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'video-trim',
    slug: '/video/trim',
    engine: 'video',
    name: 'Trim video',
    accept: VIDEO_ACCEPT,
    multiFile: false,
    output: 'single',
    configFields: [
      {
        kind: 'text',
        id: 'startTime',
        label: 'Start',
        default: '00:00',
        placeholder: 'mm:ss',
        maxLength: 11,
      },
      {
        kind: 'text',
        id: 'endTime',
        label: 'End',
        help: 'Leave empty to trim to the end of the clip.',
        default: '',
        placeholder: 'mm:ss',
        maxLength: 11,
      },
      {
        kind: 'toggle',
        id: 'reencode',
        label: 'Re-encode for frame-exact cuts',
        help: 'Off copies the stream untouched, which is instant and lossless but snaps to keyframes.',
        default: false,
      },
    ],
    defaultConfig: { startTime: '00:00', endTime: '', reencode: false },
    targetSizeCapable: false,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'video-to-gif',
    slug: '/video/to-gif',
    engine: 'video',
    name: 'Video to GIF',
    accept: VIDEO_ACCEPT,
    multiFile: false,
    output: 'single',
    configFields: [
      {
        kind: 'number',
        id: 'fps',
        label: 'Frame rate',
        min: 5,
        max: 30,
        step: 1,
        default: 15,
        unit: 'fps',
      },
      {
        kind: 'number',
        id: 'width',
        label: 'Width',
        help: 'Height follows the source aspect ratio.',
        min: 120,
        max: 1280,
        step: 10,
        default: 480,
        unit: 'px',
      },
      {
        kind: 'toggle',
        id: 'loop',
        label: 'Loop forever',
        default: true,
      },
    ],
    defaultConfig: { fps: 15, width: 480, loop: true },
    targetSizeCapable: false,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'video-extract-audio',
    slug: '/video/extract-audio',
    engine: 'video',
    name: 'Extract audio',
    accept: VIDEO_ACCEPT,
    multiFile: false,
    output: 'single',
    configFields: [
      {
        kind: 'select',
        id: 'format',
        label: 'Audio format',
        options: [
          { value: 'mp3', label: 'MP3' },
          { value: 'aac', label: 'AAC (M4A)' },
          { value: 'wav', label: 'WAV (uncompressed)' },
        ],
        default: 'mp3',
      },
    ],
    defaultConfig: { format: 'mp3' },
    targetSizeCapable: false,
    licenseTier: 'free',
    supported: false,
  },
  {
    id: 'qr-generate',
    slug: '/qr/generate',
    engine: 'qr',
    name: 'QR code generator',
    /** No file input at all — the payload is typed, not dropped. */
    accept: [],
    multiFile: false,
    output: 'single',
    configFields: [
      {
        kind: 'text',
        id: 'payload',
        label: 'Link or text',
        default: '',
        placeholder: 'https://example.com',
        maxLength: 2_000,
      },
      {
        kind: 'select',
        id: 'errorCorrection',
        label: 'Error correction',
        help: 'Higher survives more print damage at the cost of density.',
        options: [
          { value: 'L', label: 'Low (7%)' },
          { value: 'M', label: 'Medium (15%)' },
          { value: 'Q', label: 'Quartile (25%)' },
          { value: 'H', label: 'High (30%)' },
        ],
        default: 'M',
      },
      {
        kind: 'number',
        id: 'sizePx',
        label: 'Export size',
        min: 128,
        max: 4_096,
        step: 64,
        default: 1_024,
        unit: 'px',
      },
    ],
    defaultConfig: { payload: '', errorCorrection: 'M', sizePx: 1_024 },
    targetSizeCapable: false,
    licenseTier: 'free',
    supported: false,
  },
];

// ─── Lookups ──────────────────────────────────────────────────────────────

/**
 * The only list any route generator may read. Mirrors
 * `publishedFormatPairRoutes` in content/formats.ts: the gate is applied once,
 * here, so no caller can forget it.
 */
export const publishedTools: readonly ToolManifestEntry[] = toolManifest.filter(
  (t) => t.supported,
);

export function findTool(id: ToolId): ToolManifestEntry | undefined {
  return toolManifest.find((t) => t.id === id);
}

export function findPublishedToolBySlug(slug: string): ToolManifestEntry | undefined {
  return publishedTools.find((t) => t.slug === slug);
}

export function publishedToolsForEngine(engine: EngineId): readonly ToolManifestEntry[] {
  return publishedTools.filter((t) => t.engine === engine);
}

/** True when the tool takes no file input, so the shell renders no dropzone. */
export function isInputless(tool: ToolManifestEntry): boolean {
  return tool.accept.length === 0;
}

/**
 * The declared defaults, rebuilt from the field specs.
 *
 * `defaultConfig` is authored by hand for readability, so it can drift from the
 * specs beside it. Rather than trust that, the shell seeds state from this and
 * a unit test asserts the two agree for every entry — the drift is then a red
 * test rather than a control that silently renders the wrong initial value.
 */
export function defaultsFromFields(tool: ToolManifestEntry): ToolConfig {
  const out: Record<string, ConfigValue> = {};
  for (const field of tool.configFields) {
    out[field.id] = field.kind === 'targetSize' ? field.defaultBytes : field.default;
  }
  return out;
}
