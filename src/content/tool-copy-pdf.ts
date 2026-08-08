/**
 * src/content/tool-copy-pdf.ts
 *
 * Page copy for the three PDF document tools: merge, split, rotate.
 *
 * Split out of `tool-copy.ts` because that file was becoming a single module
 * holding every tool's prose, and these three share a subject — documents
 * rather than photos — so their claims and caveats reference each other.
 *
 * The recurring theme is honesty about what is LOST. Merging drops bookmarks,
 * splitting cannot un-merge a range you typed as one, and none of them can open
 * a protected file. Every competitor is silent on all three, which is exactly
 * why saying it is worth something.
 */
import type { ToolCopy } from './tool-copy';

export const mergePdfCopy: ToolCopy = {
  title: 'Merge PDF files, nothing uploaded | KeptPix',
  metaDescription:
    'Combine PDFs into one file in your browser. Contracts, scans and statements never leave your device. No upload, no sign-up, no page limit.',
  lede:
    'Add your PDFs, put them in the order you want, get one file back. It happens on your device, so the documents never leave it.',

  table: {
    caption: 'What is kept and what is not',
    headers: ['Part of the document', 'What happens to it'],
    rows: [
      ['Page content and layout', 'Kept exactly. Pages are copied, not re-rendered'],
      ['Text, and its selectability', 'Kept. Nothing is flattened into an image'],
      ['Links and annotations', 'Kept'],
      ['Form fields', 'Kept, though two forms sharing field names can collide'],
      ['Bookmarks and outlines', 'Lost. See below, because we would rather say so'],
      ['Page order', 'Exactly the order you arrange the files in'],
    ],
  },

  sections: [
    {
      heading: 'Why this matters more for PDFs than for photos',
      paragraphs: [
        'The documents people merge are rarely holiday snaps. They are signed contracts, scanned passports, medical letters, bank statements, tenancy agreements, invoices with a client name on every page. Every other tool that offers to combine them asks you to upload them to a server first, and almost none will tell you what happens to them after that.',
        'There is no server here. The merge runs inside this tab using your own processor, and the finished document is assembled in memory and handed straight to your downloads. You can check that in under a minute: open your browser network tools and watch nothing happen, or disconnect from the internet entirely and merge anyway.',
      ],
    },
    {
      heading: 'Bookmarks are lost, and we would rather say so',
      paragraphs: [
        'If your source files have a bookmark sidebar, an outline of chapters or sections, that outline does not survive the merge. Page content, text, links and annotations all do. The outline lives at the document level rather than on the pages, and the library this tool uses has no way to rebuild it.',
        'We could have shipped a keep bookmarks switch that did nothing whichever way you set it. Plenty of tools do exactly that. An honest sentence seemed better than a switch implying a choice you do not actually have.',
      ],
    },
    {
      heading: 'Password-protected files are refused, not mangled',
      paragraphs: [
        'A PDF with a password on it cannot be read without that password, and there is no clever way around that. Rather than opening it anyway and producing a document with blank or garbled pages, which some tools will happily do, this tells you the file is protected and leaves it out.',
        'Remove the password in whatever you normally open it with, then try again. Everything else still merges. One locked file does not cost you the rest of the batch.',
      ],
    },
  ],

  useCases: [
    'Combining a scanned contract that arrived as one file per page',
    'Putting a covering letter, a CV and a portfolio into a single attachment',
    'Merging receipts for an expense claim that insists on one document',
    'Assembling application paperwork where the portal accepts exactly one upload',
    'Joining a page you signed on your phone back onto the original',
  ],

  faq: [
    {
      q: 'Are my PDFs uploaded anywhere?',
      a: 'No. The merge runs in your browser using your own device, and no part of any file is sent over the network. You can verify it: open developer tools, switch to the Network tab, and merge something. Nothing carrying your documents appears, because there is no request to make. Disconnecting from the internet and merging anyway is the simpler test.',
    },
    {
      q: 'Is there a limit on how many files or pages?',
      a: 'No built-in limit. No page cap, no daily quota, no account. The practical limit is your device memory, because merging means holding the documents and the result at the same time. A few hundred pages is comfortable on a laptop. Nothing is throttled to push you towards paying.',
    },
    {
      q: 'Will the text still be selectable and searchable?',
      a: 'Yes. Pages are copied as pages rather than rasterised into images, so text stays text and remains selectable, searchable, and readable by a screen reader. This is the difference between merging and printing to PDF, and it matters if anyone needs to find a clause later.',
    },
    {
      q: 'What about bookmarks and the outline sidebar?',
      a: 'Those are lost. Page content, text, links, annotations and form fields all survive; the outline tree does not, because it lives at the document level and the library used here cannot rebuild it. If the sidebar matters more to you than the merge, keep the files separate.',
    },
    {
      q: 'Can I merge a password-protected PDF?',
      a: 'Not while it is protected. Remove the password using whatever you open it with, then merge. The file is reported as protected and skipped, rather than being opened anyway and turned into blank pages, which is what happens when a tool ignores the encryption.',
    },
    {
      q: 'Does it work offline?',
      a: 'Yes. After your first visit the tool is cached on your device and will open and run with no connection at all. That follows directly from nothing being uploaded. There is no server for it to need.',
    },
  ],
};

export const splitPdfCopy: ToolCopy = {
  title: 'Split PDF by page range, nothing uploaded | KeptPix',
  metaDescription:
    'Extract page ranges from a PDF in your browser. Each range becomes its own file, delivered as a ZIP. Nothing is uploaded, nothing is stored.',
  lede:
    'Say which pages you want, like 1-3, 7, 9-12. Each range comes back as its own PDF, zipped together. All of it happens on your device.',

  table: {
    caption: 'How ranges are read',
    headers: ['You type', 'You get'],
    rows: [
      ['1-3', 'One file containing pages 1, 2 and 3'],
      ['1-3, 7', 'Two files. Pages 1 to 3, and page 7 on its own'],
      ['1-3, 4-8, 9-12', 'Three files, one per range'],
      ['9-', 'One file from page 9 to the end'],
      ['7-3', 'Pages 3 to 7. A backwards range is read the sensible way'],
      ['1-500 on a 12-page file', 'All 12 pages. A range past the end is trimmed, not refused'],
    ],
  },

  sections: [
    {
      heading: 'Each range becomes its own file',
      paragraphs: [
        'This is the part most tools get wrong in a way that costs you time. Ask for 1-3, 7-9 and you should get two documents, because you named two things. Some tools hand back a single six-page file instead, and you are left splitting it again by hand.',
        'Here every range you type produces its own PDF, named for the pages it holds, and they arrive together in one ZIP. If you actually want one file containing several separate stretches, say it as a single range or merge the results afterwards.',
      ],
    },
    {
      heading: 'It tells you when it did not understand you',
      paragraphs: [
        'Page selections are typed by hand, so they contain typos. Something like 1-3, foo, 7 is a real thing to type. A tool that quietly ignores the part it could not read hands you a document that is wrong in a way you cannot see, and you find out weeks later when a page is missing.',
        'Anything unreadable is reported back by name, and the ranges that did parse are still extracted. Page 0 is rejected rather than nudged to page 1, because a zero usually means a misunderstanding rather than a slip, and silently widening a selection is its own kind of wrong.',
      ],
    },
    {
      heading: 'Text stays text',
      paragraphs: [
        'Pages are copied rather than re-rendered, so the extracted files keep selectable text, working links, annotations and form fields. Nothing is flattened into a picture of a page. If you split a contract to send one clause on, whoever receives it can still search it.',
      ],
    },
  ],

  useCases: [
    'Pulling one signed page out of a long agreement to send on',
    'Separating a bank statement into the months a form actually asked for',
    'Breaking a scanned report into chapters',
    'Extracting just the pages a portal will accept when it caps the page count',
    'Removing pages you would rather not share, without opening an editor',
  ],

  faq: [
    {
      q: 'Are my PDFs uploaded anywhere?',
      a: 'No. Everything runs in your browser on your own device, and nothing is sent over the network at any point. Open the Network tab in developer tools and split a file. You will see no request carrying it, because there is none. Disconnecting from the internet and splitting anyway is the quicker proof.',
    },
    {
      q: 'How do I write the page ranges?',
      a: 'Commas separate ranges and a dash makes a span, so 1-3, 7, 9-12 gives you three files. You can leave one side of a dash open: 9- means page 9 to the end, and -3 means the start through page 3. Backwards ranges like 7-3 are read as 3 to 7, and spaces make no difference.',
    },
    {
      q: 'Why do I get a ZIP instead of separate downloads?',
      a: 'Because a browser asking permission for eleven separate downloads is worse than one archive. Each PDF inside is named for the pages it contains, so you can see what is what before extracting anything.',
    },
    {
      q: 'Will the extracted pages still have selectable text?',
      a: 'Yes. Pages are copied as pages, so text stays text and links keep working. Nothing is rasterised into an image, which is what happens if a tool prints to PDF rather than genuinely extracting.',
    },
    {
      q: 'What if I ask for pages that do not exist?',
      a: 'A range running past the end is trimmed to the last page, since 1-500 on a twelve-page file plainly means all of it. A range that starts past the end is reported as unusable rather than silently ignored, so you know it did not do what you asked.',
    },
    {
      q: 'Does it work offline?',
      a: 'Yes, after the first visit. There is no server involved, so there is nothing to be offline from.',
    },
  ],
};

export const rotatePdfCopy: ToolCopy = {
  title: 'Rotate PDF pages, nothing uploaded | KeptPix',
  metaDescription:
    'Rotate every page of a PDF or only the ones you name, in your browser. The rotation is saved into the file itself. Nothing is uploaded.',
  lede:
    'Turn every page, or only the ones you name. The rotation is written into the file, so it opens the right way up everywhere.',

  table: {
    caption: 'What the options do',
    headers: ['Setting', 'Effect'],
    rows: [
      ['90 degrees clockwise', 'A page lying on its left side comes upright'],
      ['180 degrees', 'For pages that were scanned upside down'],
      ['90 degrees anticlockwise', 'A page lying on its right side comes upright'],
      ['Pages, left empty', 'Every page in the document is rotated'],
      ['Pages, e.g. 1-3, 7', 'Only those pages rotate. The rest are untouched'],
    ],
  },

  sections: [
    {
      heading: 'Rotation adds to what is already there',
      paragraphs: [
        'Scanners often mark a page as rotated without moving the pixels, which is why a document can look sideways in one app and upright in another. If a page already carries a rotation and you ask for 90 degrees more, you get 180. The two add up, exactly as turning a sheet of paper twice would.',
        'The alternative is setting the rotation absolutely, which quietly un-rotates pages that were already correct. On a mixed document, where some pages are fine and a few went in sideways, that turns one problem into two.',
      ],
    },
    {
      heading: 'It changes the file, not just your view',
      paragraphs: [
        'Rotating inside a PDF viewer usually affects only how that viewer displays it. Send the file on and whoever opens it sees it sideways again. This writes the rotation into the document itself, so it opens the right way up in any reader, and prints that way too.',
        'Nothing is re-rendered to achieve it. Text stays text, links keep working, and the file stays essentially the same size, because a rotation is a single number stored per page rather than a new picture of one.',
      ],
    },
    {
      heading: 'Only the pages you name',
      paragraphs: [
        'Mixed documents are the normal case. A report where three scanned pages went through sideways and the rest are fine. Leave the pages field empty to rotate everything, or name the ones that need it as 1-3, 7. Anything you do not name is left exactly as it was.',
      ],
    },
  ],

  useCases: [
    'Fixing a few pages that went through the scanner the wrong way round',
    'Turning a landscape spreadsheet upright before sending it to be printed',
    'Correcting a document photographed on a phone in the wrong orientation',
    'Making a mixed-orientation scan readable without scanning it again',
  ],

  faq: [
    {
      q: 'Are my PDFs uploaded anywhere?',
      a: 'No. The rotation happens in your browser on your own device, with nothing sent over the network. You can confirm it in the Network tab of developer tools, or by disconnecting from the internet and rotating anyway.',
    },
    {
      q: 'Will this change how the file looks in other apps?',
      a: 'Yes, and that is the point. Rotating inside a viewer usually only changes that viewer display, so the file still opens sideways for whoever you send it to. This writes the rotation into the document, so every reader and every printer honours it.',
    },
    {
      q: 'Does rotating lose quality or make the file bigger?',
      a: 'Neither. A rotation is a single number stored against each page, not a new rendering of it, so nothing is re-compressed and the size barely changes. Text remains selectable and links keep working.',
    },
    {
      q: 'What if some pages are already rotated?',
      a: 'The rotation you ask for is added to whatever the page already carries, so a page marked 90 degrees that you rotate 90 degrees ends up at 180. That matches what turning a sheet of paper twice would do, and it means pages that were already correct are not silently knocked out of alignment.',
    },
    {
      q: 'How do I rotate only some pages?',
      a: 'Type them in the pages field as 1-3, 7. Leave it empty to rotate the whole document. Anything you do not name is left untouched.',
    },
    {
      q: 'Can I rotate a password-protected PDF?',
      a: 'Not while it is protected. Remove the password in whatever you open it with first. The file is reported as protected rather than being opened anyway and turned into something broken.',
    },
  ],
};
