/**
 * src/content/exam-specs.ts — verified exam upload requirements (docs/12 D-118).
 *
 * THE RULE OF THIS FILE: every number was read in the primary source named in
 * `sourceUrl`, on `verifiedOn`, from the actual PDF text — never from an
 * aggregator. The aggregators were wrong about every exam checked: they carry
 * UPSC's photo cap as 300 KB (the official instruction PDF says 200), a NEET
 * "postcard photo" upload the 2026 bulletin does not ask for, and SSC photo
 * compression advice for an application that no longer accepts photo uploads
 * at all.
 *
 * Specs change every cycle. When a new notification lands, re-verify against
 * it and update `cycle`, `verifiedOn` and the values together — an entry with
 * a stale cycle is due for a pass, and docs/12 D-100 is what happens when
 * copy outlives the thing it described.
 */
import type { ExamSpec } from '../core/types';

export const examSpecs: readonly ExamSpec[] = [
  {
    id: 'ssc-cgl',
    exam: 'SSC CGL (and SSC exams on the same portal)',
    org: 'Staff Selection Commission',
    cycle: '2026',
    sourceTitle: 'CGL 2026 Examination Notice (ssc.gov.in, 21-05-2026)',
    sourceUrl:
      'https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_cgl_2026.pdf',
    verifiedOn: '2026-08-12',
    caveat:
      'SSC no longer accepts an uploaded photograph: the photo is captured LIVE ' +
      'inside the application, and capturing a photo of an existing photograph is ' +
      'listed as grounds for rejection (notice §9.5). The only image you compress ' +
      'for SSC is the signature.',
    requirements: [
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPEG/JPG',
        minKB: 10,
        maxKB: 20,
        dimensions: '~6.0 × 2.0 cm',
        notes:
          'Blurred or miniature signatures are rejected summarily (§9.6). One annexure ' +
          'of the same notice says ~4.0 × 2.0 cm — the portals disagree with themselves, ' +
          'so keep the strokes large and clear rather than chasing exact centimetres.',
      },
    ],
    surfaceOn: ['signature-to-20kb', 'jpg-to-20kb'],
  },
  {
    id: 'ssc-gd',
    exam: 'SSC GD Constable',
    org: 'Staff Selection Commission',
    cycle: '2026 (2027 notice expected Sept 2026 — docs/18)',
    sourceTitle: 'Constable (GD) in CAPFs & SSF Examination 2026 Notice (ssc.gov.in)',
    sourceUrl:
      'https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_CTGD_2026.pdf',
    verifiedOn: '2026-08-13',
    caveat:
      'GD has NO photo upload: the photograph is captured LIVE inside the application, and ' +
      'capturing a photo of an existing photograph is grounds for summary rejection (notice ' +
      '§8.5). The only image you compress for GD is the signature — and the notice itself says ' +
      'the major reason signatures are rejected is that they are too small ("miniature"), so ' +
      'do not over-compress below the 10 KB floor.',
    requirements: [
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPEG/JPG',
        minKB: 10,
        maxKB: 20,
        dimensions: '~6.0 × 2.0 cm @ 300 DPI',
        notes:
          'Horizontally aligned, on the 2026 notice’s own emphasis: blurred or MINIATURE ' +
          'signatures are rejected summarily, and miniature is named as the top rejection ' +
          'reason (Annexure-III §21).',
      },
    ],
    surfaceOn: ['ssc-gd-photo-signature', 'signature-to-20kb', 'jpg-to-20kb'],
  },
  {
    id: 'upsc-cse',
    exam: 'UPSC Civil Services (and exams on the UPSC OTR portal)',
    org: 'Union Public Service Commission',
    cycle: '2026',
    sourceTitle: 'Instructions for Uploading the Photo & Signature (upsconline.nic.in)',
    sourceUrl: 'https://upsconline.nic.in/ngrp/assets/PDF/instruction-photo-signature-upload-upsc.pdf',
    verifiedOn: '2026-08-12',
    caveat:
      'UPSC also captures a live photograph and face-matches it against your upload — ' +
      'if the two differ, the application cannot proceed. And the signature upload is ' +
      'not one signature: it is THREE, one below the other, in a single image.',
    requirements: [
      {
        kind: 'photo',
        label: 'Photograph',
        format: 'JPG',
        minKB: 20,
        maxKB: 200,
        notes:
          'File must be NAMED "photo". Face must cover at least 75% of the frame, plain ' +
          'white background, both ear lobes visible. Note the 20 KB FLOOR: a file ' +
          'compressed below it is rejected for being too small.',
      },
      {
        kind: 'signature',
        label: 'Signature (three, in one image)',
        format: 'JPG',
        minKB: 20,
        maxKB: 100,
        dimensions: '350–500 px',
        notes:
          'File must be NAMED "signature". Sign three times, one below the other, black ' +
          'ink on plain white paper, scanned as a single image.',
      },
    ],
    surfaceOn: ['passport-photo-to-50kb', 'jpg-to-100kb', 'jpg-to-50kb'],
  },
  {
    id: 'neet-ug',
    exam: 'NEET (UG)',
    org: 'National Testing Agency',
    cycle: '2026',
    sourceTitle: 'NEET (UG) 2026 Information Bulletin (released 08-02-2026)',
    sourceUrl:
      'https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2026/02/20260208939209382.pdf',
    verifiedOn: '2026-08-12',
    requirements: [
      {
        kind: 'photo',
        label: 'Passport-size photograph',
        format: 'JPG/JPEG',
        minKB: 10,
        maxKB: 200,
        notes:
          'Colour or black & white, 80% of the frame must be the face (no mask), ears ' +
          'visible, white background.',
      },
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPG/JPEG',
        minKB: 10,
        maxKB: 100,
        notes: 'Full signature in running handwriting on white paper. Capitals rejected.',
      },
      {
        kind: 'thumb',
        label: 'Fingers & thumb impressions',
        format: 'JPG/JPEG',
        minKB: 10,
        maxKB: 200,
        notes: 'Left and right hands, per the bulletin.',
      },
    ],
    surfaceOn: ['jpg-to-100kb', 'jpg-to-200kb', 'passport-photo-to-50kb'],
  },
  {
    id: 'ibps',
    exam: 'IBPS (and bank recruitments on the same portal)',
    org: 'Institute of Banking Personnel Selection',
    cycle: '2026',
    sourceTitle: 'Guidelines for Scanning and Upload of Documents (ibpsreg.ibps.in, 2026 cycle)',
    sourceUrl:
      'https://ibpsreg.ibps.in/cbisofeb26/uploads/loadpdf.php?file=k7m5p+fQ15ervNTm0M%2FKzJucmdWyp5rXppSo3aRx&t=1LHArOLA2di0yczXwNDa083LmNWypw%3D%3D',
    verifiedOn: '2026-08-12',
    caveat:
      'IBPS wants FOUR uploads, each with its own band — photo, signature, left thumb ' +
      'impression, and a handwritten declaration in English. A signature in capital ' +
      'letters is explicitly not accepted.',
    requirements: [
      {
        kind: 'photo',
        label: 'Photograph',
        format: 'JPG/JPEG',
        minKB: 20,
        maxKB: 50,
        dimensions: '200 × 230 px',
        notes: 'Recent passport-style colour photo against a light background.',
      },
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPG/JPEG',
        minKB: 10,
        maxKB: 20,
        dimensions: '140 × 60 px',
        notes: 'Black ink on white paper. NOT in capital letters — explicitly rejected.',
      },
      {
        kind: 'thumb',
        label: 'Left thumb impression',
        format: 'JPG/JPEG',
        minKB: 20,
        maxKB: 50,
        dimensions: '240 × 240 px @ 200 DPI (3 × 3 cm)',
      },
      {
        kind: 'declaration',
        label: 'Handwritten declaration',
        format: 'JPG/JPEG',
        minKB: 50,
        maxKB: 100,
        dimensions: '800 × 400 px @ 200 DPI (10 × 5 cm)',
        notes: 'In English, in the candidate’s own handwriting, black ink.',
      },
    ],
    surfaceOn: ['signature-to-20kb', 'passport-photo-to-50kb', 'jpg-to-20kb', 'jpg-to-50kb'],
  },
];

/** Specs whose data says they belong on this compress route, in file order. */
export function examSpecsForRoute(slug: string): ExamSpec[] {
  return examSpecs.filter((spec) => spec.surfaceOn.includes(slug));
}
