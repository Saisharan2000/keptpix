/**
 * src/content/tool-copy.ts
 *
 * Per-tool page copy for the manifest routes, keyed by ToolId.
 *
 * Spec: docs/09-seo-content-plan.md §3 — every tool route carries real content,
 * not a headline over a widget. A page with a tool and forty words on it is a
 * page Google has no reason to rank and a visitor has no reason to trust.
 *
 * Copy lives here rather than in the route file so `[category]/[tool].astro`
 * stays one generic template: adding a tool's content is a new entry here, not
 * a new `.astro` file, exactly as the manifest itself works.
 *
 * A tool with no entry renders the generic frame. That is deliberate — an
 * engine can ship before its copy is written, and a thin page is better than a
 * blocked release.
 */
import type { ToolId } from '../core/tools';
// The document tools' copy lives in its own module: three tools' worth of prose
// on one subject, kept out of this file so it stays readable.
import {
  compressPdfCopy,
  mergePdfCopy,
  pdfToImagesCopy,
  rotatePdfCopy,
  splitPdfCopy,
} from './tool-copy-pdf';

export interface ToolCopySection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

/**
 * A general table, unlike `ComparisonTable` in core/types which is fixed to a
 * from/to format pair.
 *
 * Worth having for two reasons that point the same way. Users' first question
 * about a converter is always "what happens to MY file", and a table answers it
 * in one glance where three paragraphs do not. And measurements through early
 * 2026 find LLMs extract tabular data far more reliably than prose, so the
 * facts most worth being quoted on are the ones to put in a table.
 */
export interface ToolCopyTable {
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface ToolCopy {
  /** <title>. Under 60 characters so it is not truncated in results. */
  readonly title: string;
  readonly metaDescription: string;
  readonly lede: string;
  /** Optional; rendered after the first prose section. */
  readonly table?: ToolCopyTable;
  readonly sections: readonly ToolCopySection[];
  readonly useCases: readonly string[];
  readonly faq: ReadonlyArray<{ readonly q: string; readonly a: string }>;
}

const imagesToPdf: ToolCopy = {
  title: 'Images to PDF — nothing uploaded | KeptPix',
  metaDescription:
    'Combine JPG, PNG and HEIC photos into one PDF in your browser. JPEGs are embedded without re-encoding, so nothing loses quality. Nothing is uploaded.',
  lede:
    'Drop your images in, put them in the order you want, get one PDF back. It all happens on your device — the files are never uploaded.',

  /**
   * The question everyone actually has, answered without reading prose.
   *
   * It is also the most quotable thing on the page: these are checkable facts
   * about behaviour, not claims about quality, and the JPEG row is the one that
   * separates this from every tool that re-compresses everything on the way in.
   */
  table: {
    caption: 'What happens to each format',
    headers: ['You add', 'What we do with it', 'Quality'],
    rows: [
      ['JPG / JPEG', 'Embedded in the PDF exactly as it is', 'Identical — byte for byte'],
      ['HEIC / HEIF (iPhone)', 'Decoded once, written as JPEG at high quality', 'One conversion; PDF cannot carry HEIC'],
      ['PNG', 'Decoded once, written as JPEG; transparency flattened to white', 'One conversion; transparency is lost, because a PDF page is opaque'],
      ['WebP / AVIF', 'Decoded once, written as JPEG at high quality', 'One conversion; PDF cannot carry either'],
      ['TIFF', 'Decoded once, written as JPEG at high quality', 'One conversion'],
      ['Progressive or CMYK JPEG', 'Decoded once, written as a baseline JPEG', 'One conversion, on purpose — embedding these directly can render as a blank page in some readers'],
    ],
  },

  sections: [
    {
      heading: 'Your JPEGs are not re-encoded',
      paragraphs: [
        'Most image-to-PDF tools decode every photo and compress it again on the way in. That is a second round of JPEG compression on top of the one your camera already applied, and it is why documents made this way often look softer than the originals — visibly so on text, screenshots and anything with hard edges.',
        'A JPEG is already a valid PDF image stream, so there is no reason to touch it. We read the file header, confirm the format is one every PDF reader handles, and write the original bytes straight into the document. The photo inside the PDF is the same file you started with, byte for byte. Nothing is decoded, nothing is re-compressed, and nothing is lost.',
        'Formats that PDF cannot carry directly — HEIC from an iPhone, PNG, WebP, AVIF, TIFF — are converted once, at high quality. That single conversion is unavoidable; a second one is not, and we do not do it.',
      ],
    },
    {
      heading: 'Photos taken sideways come out the right way up',
      paragraphs: [
        'Phones do not rotate photos when you turn the handset. They save the image as the sensor read it and add a tag saying which way up it should be shown. PDF has no equivalent tag, which is why so many tools produce documents full of pages lying on their side.',
        'We read that tag and apply the rotation as part of placing the image on the page, so it is corrected in the document without the pixels ever being touched. Your sideways photo comes out upright, and it is still byte-for-byte the original.',
      ],
    },
    {
      heading: 'Page size, orientation and margins',
      paragraphs: [
        'Fit to image gives each page the exact shape of the photo on it, so there are no white bands anywhere — good for a photo book or a set of screenshots. A4 and US Letter give you standard paper, with each image scaled to fit and centred, which is what you want if the result is going to be printed or attached to a form.',
        'Images are never cropped and never stretched. If a photo does not match the shape of the page, it is fitted inside and centred, and the space around it is left blank. A tool that silently distorts your photo to fill a page has made a decision that is not its to make.',
      ],
    },
  ],

  useCases: [
    'Turning a stack of phone photos of a document into one file you can email or upload to a form',
    'Sending receipts or invoices as a single attachment instead of eleven separate images',
    'Submitting scanned ID, forms or certificates where the site insists on a PDF',
    'Collecting screenshots into one document for a report or a bug write-up',
    'Making a printable contact sheet or photo set at A4 or US Letter',
  ],

  faq: [
    {
      q: 'Are my images uploaded anywhere?',
      a: 'No. The conversion runs inside your browser tab using your own device, and no part of any file is sent over the network. You can confirm it: open your browser’s developer tools, switch to the Network tab, and make a PDF. You will not see a request carrying your images, because there is not one. You can also disconnect from the internet entirely and the tool still works.',
    },
    {
      q: 'Will my photos lose quality?',
      a: 'Ordinary JPEGs lose nothing at all — the original file is embedded in the PDF unchanged, so what comes out is exactly what went in. HEIC, PNG, WebP, AVIF and TIFF images have to be converted once, because PDF cannot carry those formats directly, and that conversion is done at high quality. A small number of unusual JPEGs (progressive, CMYK, or 12-bit) are also converted, because embedding those directly can produce a blank page in some PDF readers, and we would rather convert the file than hand you a document with a page missing.',
    },
    {
      q: 'How many images can I combine?',
      a: 'There is no limit built into the tool — no page cap, no daily quota, no account. The real limit is your device’s memory, because building one document means holding all of it at once. A phone will comfortably handle a few dozen full-resolution photos; a laptop will handle far more. Nothing is throttled to push you towards paying.',
    },
    {
      q: 'Can I change the page order?',
      a: 'Yes. Files are listed in the order you added them, and each row has controls to move it earlier or later, or to remove it. The list is the page order, so what you see is what the document will be. The controls are ordinary buttons, so they work by keyboard and with a screen reader as well as by mouse.',
    },
    {
      q: 'Which formats can I use?',
      a: 'JPG and JPEG, PNG, HEIC and HEIF from an iPhone, WebP, AVIF, and TIFF. You can mix them freely in one document. The format is detected from the contents of the file rather than its name, so a photo saved with the wrong extension still works.',
    },
    {
      q: 'Why is my PDF larger than the images added together?',
      a: 'It usually is not by much — since JPEGs go in untouched, the document is roughly the sum of the originals plus a small amount of structure. If the result is bigger than you need, that is a compression job rather than a conversion one, and doing it separately means it can be done properly on the finished document instead of guessing at each image on the way in.',
    },
    {
      q: 'Does it work offline?',
      a: 'Yes. After your first visit the tool is cached on your device, so it will open and run with no connection at all. That is a direct consequence of nothing being uploaded — there is no server for it to need.',
    },
  ],
};

export const TOOL_COPY: Partial<Record<ToolId, ToolCopy>> = {
  'images-to-pdf': imagesToPdf,
  'pdf-merge': mergePdfCopy,
  'pdf-split': splitPdfCopy,
  'pdf-rotate': rotatePdfCopy,
  'pdf-to-images': pdfToImagesCopy,
  'pdf-compress': compressPdfCopy,
};

export function copyForTool(id: ToolId): ToolCopy | undefined {
  return TOOL_COPY[id];
}
