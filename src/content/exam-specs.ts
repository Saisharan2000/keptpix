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
      'SSC no longer asks you to upload a photo. The form takes your photo live, ' +
      'with your camera, while you fill it in. Pointing the camera at an old photo ' +
      'gets the form rejected. The only image file you upload is your signature.',
    requirements: [
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPEG/JPG',
        minKB: 10,
        maxKB: 20,
        dimensions: '~6.0 × 2.0 cm',
        notes:
          'Blurred or very small signatures are rejected. Different parts of the ' +
          'same notice give slightly different sizes (6 cm and 4 cm wide), so do not ' +
          'chase exact centimetres — just keep the signature big and clear.',
      },
    ],
    hindi:
      'SSC के ऑनलाइन फॉर्म में अब फोटो अपलोड नहीं होती — फोटो फॉर्म भरते समय कैमरे से लाइव ली जाती है। सिर्फ़ हस्ताक्षर (signature) की फ़ाइल अपलोड होती है: JPEG, 10 से 20 KB, लगभग 6 × 2 सेमी।',
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
      'GD has NO photo upload. The form takes your photo live, with your camera. ' +
      'Pointing the camera at an old photo gets the form rejected. The only file you ' +
      'upload is your signature — and the notice itself says most rejected signatures ' +
      'are rejected for being TOO SMALL, so do not squeeze the file below 10 KB.',
    requirements: [
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPEG/JPG',
        minKB: 10,
        maxKB: 20,
        dimensions: '~6.0 × 2.0 cm @ 300 DPI',
        notes:
          'Keep it horizontal. The notice says blurred or very small ("miniature") ' +
          'signatures are rejected — and names "too small" as the number one reason.',
      },
    ],
    hindi:
      'SSC GD (कांस्टेबल भर्ती) में फोटो अपलोड नहीं होती — फोटो लाइव ली जाती है। सिर्फ़ हस्ताक्षर अपलोड होता है: JPEG, 10 से 20 KB। ध्यान दें: बहुत छोटा हस्ताक्षर रिजेक्शन की सबसे बड़ी वजह है, इसलिए फ़ाइल 10 KB से छोटी न करें।',
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
      'UPSC asks for BOTH: an uploaded photo AND a live photo taken with your camera. ' +
      'The two are compared — if they do not match, the form will not go through. ' +
      'And the signature upload is not one signature: you sign THREE times, one below ' +
      'the other, in a single image.',
    requirements: [
      {
        kind: 'photo',
        label: 'Photograph',
        format: 'JPG',
        minKB: 20,
        maxKB: 200,
        notes:
          'The file must be named "photo". Your face must fill at least 75% of the ' +
          'picture, on a plain white background, with both ears visible. Files under ' +
          '20 KB are rejected for being too small — do not over-compress.',
      },
      {
        kind: 'signature',
        label: 'Signature (three, in one image)',
        format: 'JPG',
        minKB: 20,
        maxKB: 100,
        dimensions: '350–500 px',
        notes:
          'The file must be named "signature". Sign three times, one below the other, ' +
          'in black ink on plain white paper. Scan all three as one image.',
      },
    ],
    hindi:
      'UPSC में अपलोड की गई फोटो और लाइव फोटो दोनों ली जाती हैं और आपस में मिलाई जाती हैं। फोटो: JPG, 20 से 200 KB, फ़ाइल का नाम "photo"। हस्ताक्षर: एक ही इमेज में तीन बार साइन करें, JPG, 20 से 100 KB, फ़ाइल का नाम "signature"।',
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
          'Colour or black and white. Your face must fill 80% of the picture, no mask, ' +
          'ears visible, white background.',
      },
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPG/JPEG',
        minKB: 10,
        maxKB: 100,
        notes: 'Your full signature in normal handwriting on white paper. CAPITAL LETTERS are rejected.',
      },
      {
        kind: 'thumb',
        label: 'Fingers & thumb impressions',
        format: 'JPG/JPEG',
        minKB: 10,
        maxKB: 200,
        notes: 'Both hands — left and right — as the bulletin asks.',
      },
    ],
    hindi:
      'NEET (UG) के लिए: फोटो JPG/JPEG 10 से 200 KB (चेहरा 80%, सफ़ेद बैकग्राउंड), हस्ताक्षर 10 से 100 KB (CAPITAL अक्षरों में नहीं), और दोनों हाथों की उँगलियों/अँगूठे के निशान 10 से 200 KB।',
    surfaceOn: ['jpg-to-100kb', 'jpg-to-200kb', 'passport-photo-to-50kb'],
  },
  {
    id: 'rrb-ntpc',
    exam: 'RRB NTPC (Railway non-technical posts)',
    org: 'Railway Recruitment Boards',
    cycle: 'CEN 07/2025 (Undergraduate)',
    sourceTitle: 'Detailed CEN No. 07/2025 NTPC (Under Graduate) — Railway Recruitment Boards',
    sourceUrl: 'https://www.rrbchennai.gov.in/downloads/CEN-07-2025-NTPC-UnderGraduate-English.pdf',
    verifiedOn: '2026-08-15',
    caveat:
      'RRB has NO photo upload. The form takes your photo live, with your camera, while you ' +
      'fill it in — taking a picture of an old printed photo gets the form rejected. The only ' +
      'image file you upload is your signature. Note the size is higher than most exams: 30 to ' +
      '49 KB, not 10–20 KB. Sign in normal running handwriting — block or CAPITAL letters are ' +
      'rejected.',
    requirements: [
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPG/JPEG',
        minKB: 30,
        maxKB: 49,
        dimensions: 'min 140 × 60 px @ 100 DPI (scan box 35 × 20 mm)',
        notes:
          'Black ink on white paper, running (joined) handwriting — NOT block, CAPITAL or ' +
          'disjointed letters. A thumb impression in place of a signature is rejected.',
      },
    ],
    hindi:
      'RRB NTPC (रेलवे भर्ती) में फोटो अपलोड नहीं होती — फोटो फॉर्म भरते समय कैमरे से लाइव ली जाती है। सिर्फ़ हस्ताक्षर अपलोड होता है: JPG/JPEG, 30 से 49 KB, कम से कम 140 × 60 px। सामान्य (जुड़ी हुई) लिखावट में करें — CAPITAL अक्षरों में नहीं।',
    surfaceOn: ['signature-140x60', 'jpg-to-50kb'],
  },
  {
    id: 'sbi',
    exam: 'SBI (PO / Clerk / CBO — recruitments on the same portal)',
    org: 'State Bank of India',
    cycle: '2025-26 (CBO Nov 2025 guidelines)',
    sourceTitle: 'Guidelines for Scanning and Upload of Documents (ibpsreg.ibps.in, SBI CBO Nov 2025)',
    sourceUrl:
      'https://ibpsreg.ibps.in/sbicbonov25/uploads/loadpdf.php?file=k7m5p+fQ15e7vNTWw9jT2d+Yn5S+pdGTpaeV6Kqlcg%3D%3D&t=1LHArOLA2di0yczXwNDa083LmNWypw%3D%3D',
    verifiedOn: '2026-08-13',
    caveat:
      'SBI uses the same four uploads as IBPS: a photo, a signature, a left thumb ' +
      'impression, and a short declaration written by hand in English. The signature ' +
      'and the declaration must NOT be in capital letters.',
    hindi:
      'SBI (बैंक भर्ती) में चार फ़ाइलें अपलोड होती हैं: फोटो 20–50 KB (200×230 px), हस्ताक्षर 10–20 KB (140×60 px, CAPITAL में नहीं), बाएँ अँगूठे का निशान 20–50 KB, और अंग्रेज़ी में हाथ से लिखा घोषणा-पत्र 50–100 KB।',
    requirements: [
      {
        kind: 'photo',
        label: 'Photograph',
        format: 'JPG/JPEG',
        minKB: 20,
        maxKB: 50,
        dimensions: '200 × 230 px (4.5 × 3.5 cm)',
        notes: 'A recent colour photo, passport style, against a light background.',
      },
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPG/JPEG',
        minKB: 10,
        maxKB: 20,
        dimensions: '140 × 60 px',
        notes: 'Black ink on white paper. Do NOT write in capital letters — that is rejected.',
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
        notes: 'Written in English, in your own handwriting, black ink — not in capital letters.',
      },
    ],
    surfaceOn: ['signature-to-20kb', 'passport-photo-to-50kb', 'jpg-to-20kb', 'jpg-to-50kb', 'photo-200x230', 'signature-140x60', 'thumb-240x240', 'declaration-800x400'],
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
      'IBPS (the body that runs bank recruitment exams) wants FOUR separate uploads, ' +
      'each with its own size range: a photo, a signature, a left thumb impression, ' +
      'and a short declaration written by hand in English. A signature written in ' +
      'CAPITAL LETTERS is not accepted.',
    requirements: [
      {
        kind: 'photo',
        label: 'Photograph',
        format: 'JPG/JPEG',
        minKB: 20,
        maxKB: 50,
        dimensions: '200 × 230 px',
        notes: 'A recent colour photo, passport style, against a light background.',
      },
      {
        kind: 'signature',
        label: 'Signature',
        format: 'JPG/JPEG',
        minKB: 10,
        maxKB: 20,
        dimensions: '140 × 60 px',
        notes: 'Black ink on white paper. Do NOT write in capital letters — that is rejected.',
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
        notes: 'Written in English, in your own handwriting, with black ink.',
      },
    ],
    hindi:
      'IBPS (बैंक भर्ती) में चार फ़ाइलें अपलोड होती हैं: फोटो 20–50 KB (200×230 px), हस्ताक्षर 10–20 KB (140×60 px, CAPITAL में नहीं), बाएँ अँगूठे का निशान 20–50 KB, और अंग्रेज़ी में हाथ से लिखा घोषणा-पत्र 50–100 KB।',
    surfaceOn: ['signature-to-20kb', 'passport-photo-to-50kb', 'jpg-to-20kb', 'jpg-to-50kb', 'photo-200x230', 'signature-140x60', 'thumb-240x240', 'declaration-800x400'],
  },
];

/** Specs whose data says they belong on this compress route, in file order. */
export function examSpecsForRoute(slug: string): ExamSpec[] {
  return examSpecs.filter((spec) => spec.surfaceOn.includes(slug));
}
