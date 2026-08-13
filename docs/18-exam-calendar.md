# 18 — The exam notification calendar (docs/12 D-121)

**Why this document exists.** For this niche, "trend keywords" is not Google
Trends — SSC, IBPS, UPSC and NTA publish their examination calendars months in
advance, so every traffic spike for "photo 20kb" queries is **scheduled**. The
distribution strategy's October plan ("match the SSC/IBPS notification
calendar") becomes operational here: each window below says what will happen,
when, and what to do about it *before* it happens.

**Sourcing rule.** SPEC changes (KB bands, dimensions) follow D-118: primary
documents only, verified in their own PDF text. THIS calendar is operational
planning, so a clearly-labelled secondary source is acceptable for a date —
but no spec is ever updated from one, and every date here says where it came
from.

**Maintenance.** When a notice in the table lands, do three things in one
commit: re-verify the exam's specs against the NEW notice (update
`exam-specs.ts` cycle/verifiedOn), update this table, and queue any page work
the volume justifies. An entry whose window has passed moves to the log at the
bottom.

---

## Upcoming windows, nearest first (today: 2026-08-13)

| When | What happens | Source | What to do |
|---|---|---|---|
| **Sept 2026** (adv.), closes Oct 2026 | **SSC GD Constable 2027 notification** — the largest-applicant exam in India; application uploads spike immediately | PRIMARY: [SSC Tentative Calendar 2026-27](https://ssc.gov.in/api/attachment/uploads/masterData/ExamCalendar/Tentative_Calendar2026_27_08012026.pdf), row 12, read 2026-08-13 | PRE-WORK DONE (D-125): /compress/ssc-gd-photo-signature is LIVE, verified from the 2026 GD notice, headline correcting the query's premise (GD has no photo upload). Notice day (#34) is now a cycle update: re-verify against the 2027 PDF, bump ExamSpec cycle/verifiedOn and the page's cycle mentions |
| Oct 10–11, 2026 | IBPS Clerk prelims (registration already closed; admit-card season, no upload spike) | SECONDARY: aggregators citing the official calendar of 16 Jan 2026 — verify at ibps.in before acting | Nothing — the upload window has passed for this cycle |
| Nov–Dec 2026 | IBPS RRB Officer/Assistant prelims + mains | SECONDARY, as above | Nothing this cycle |
| Jan–Mar 2027 | SSC GD Constable 2027 **exam** | PRIMARY: SSC calendar row 12 | Admit-card season; no upload spike |
| ~Jan–Feb 2027 | UPSC CSE 2027 notification (annual pattern; UPSC publishes the year's programme each May) | pattern, unverified for 2027 | Re-verify UPSC specs (D-118) against the 2027 notice; the instruction PDF is portal-level and may not change |
| ~Feb 2027 | NEET (UG) 2027 information bulletin (2026's was released 08 Feb) | pattern from the 2026 bulletin date | Re-verify NEET bands against the 2027 bulletin |
| ~Mar 2026→2027 | SSC CGL/CHSL/JE 2027 cycle notices (2026 cycle: CGL adv. March, CHSL April) | PRIMARY: SSC calendar rows 4–9 (2026 cycle), pattern for 2027 | Re-verify SSC signature spec; the 2027-28 calendar itself lands ~Dec–Jan |

## The verified 2026-27 SSC table, in full

From the primary calendar (read 2026-08-13). Advertisement month is when the
upload spike begins:

| Exam | Advertised | Closes | Exam |
|---|---|---|---|
| CGL 2026 | March 2026 | April 2026 | May–June 2026 |
| JE 2026 | March 2026 | April 2026 | May–June 2026 |
| Selection Post XIV | March 2026 | April 2026 | May–July 2026 |
| CHSL 2026 | April 2026 | May 2026 | July–Sept 2026 |
| Stenographer C&D 2026 | April 2026 | May 2026 | Aug–Sept 2026 |
| Hindi Translators 2026 | April 2026 | May 2026 | Aug–Sept 2026 |
| MTS & Havaldar 2026 | June 2026 | July 2026 | Sept–Nov 2026 |
| SI Delhi Police/CAPF 2026 | May 2026 | June 2026 | Oct–Nov 2026 |
| **GD Constable 2027** | **Sept 2026** | **Oct 2026** | Jan–Mar 2027 |

## Windows that have passed (log)

*(empty — first entries will move here as the table above ages)*
