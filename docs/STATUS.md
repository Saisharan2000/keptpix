# Status — noupload

Generated 2026-08-11 18:23 UTC by `scripts/status.mjs`. **Do not edit by hand** — every
figure below is read from git, the deviations log, the backlog, the built
output or the live origin, and hand edits are overwritten on the next run.

## Live

| | |
|---|---|
| Origin | https://keptpix.com |
| Routes returning 200 | 30/30 |
| Security headers | 6/6 |

## Build

| | |
|---|---|
| Routes in sitemap | 30 |
| Last built | 2026-08-11 18:22 |
| Baseline JS | 45.3 KB gz of 60.0 KB |
| HTML per route | 10.5 KB gz of 25.0 KB |

## Repository

| | |
|---|---|
| Remote | https://github.com/Saisharan2000/keptpix.git |
| Branch | master |
| HEAD | `731e611` A PAN card route, and a flaky assertion fixed for the third time (D-102) (2026-08-11) |
| Uncommitted files | 3 |
| Unpushed commits | 0 |

## Recent changes

- `731e611` 2026-08-11 — A PAN card route, and a flaky assertion fixed for the third time (D-102)
- `5d9fc94` 2026-08-11 — Delete a duplicate spec set that told agents to install React (D-101)
- `b9202d5` 2026-08-11 — AI crawlers unblocked, and two claims of mine that did not survive checking (D-100)
- `950f6c2` 2026-08-11 — docs/14 refreshed, and a lock that outlived its process
- `dc09a46` 2026-08-11 — Cloudflare is blocking the crawlers ADR-001 exists for (D-99)
- `e178f78` 2026-08-11 — docs/17: reconcile the prose with its own table
- `cc91acb` 2026-08-11 — CI runs verify, and a scheduled watch on production
- `9e36255` 2026-08-11 — Monitoring without telemetry, and two copies that disagreed (D-98)
- `3b4ff8c` 2026-08-11 — Generated maintenance docs, and the miscount that proved the point (D-96)
- `49af50a` 2026-08-10 — new-project: an idea to a working workspace in one command
- `fd1699e` 2026-08-10 — A deploy that succeeded and changed nothing (D-97)
- `3e51323` 2026-08-10 — check:token found the project name was wrong (D-96 follow-up)

## Known issues and deviations

`docs/12-deviations.md` holds **101** entries. Most are defects found
here and written down rather than quietly fixed; it is the most useful file in
the repository for anyone about to repeat one.

Most recent:

- **D-103** — the memory budget is measured at last, and it is over
- **D-102** — a PAN card route, and a flaky assertion fixed for the third time
- **D-101** — deleted a duplicate spec set that told agents to install React
- **D-100** — the robots.txt block is off, and I sent someone after the wrong menu
- **D-99** — Cloudflare is telling the crawlers ADR-001 exists for to go away

Outstanding, from that log:

- 🟡 `window.__keptpix_store` reports empty `jobs`/`sources` while the UI shows fifty cards (D-80). `device` reads correctly,
- 🟠 Measure the WORKER's heap (D-45, WO-6) — the counter is now live in the harness under `--enable-precise-memory-info`, bu
- 🟡 HEIC fixture into CI (D-36, WO-7) — `scripts/scrub-fixture.mjs` is written and strips GPS/serials/timestamps while PRESE
- 🟡 Precache truncation on HTTP/2 (D-52, WO-5) — does not reproduce on HTTP/1.1 in any shape, including inside a real SW ins
- 🟠 Deploy to Cloudflare Pages (`noupload.app`) — the one M8 acceptance item not doable from here; needs the account. Re-run
- 🟡 `npx playwright install` is now required for a truthful e2e run — chromium alone silently "passed" while 3 engines never
- 🟡 OPFS pipeline write-through + session-restore UI (D-51) — storage primitive is built and swept; the conversion-path inte

## Work queue

Site `keptpix` — 11 done, 7 pending, 2 blocked.

**Waiting on a human:**

- #11 File the awesome-privacy issue — _needs Sai's GitHub account. Paste-ready in docs/14 §1 — title 'Add KeptPix', open an ISSUE not a PR_
- #12 Re-check whether /pdf/merge and /pdf/from-images got crawled — _TIME-GATED, not human-gated: do not claim before 18 Aug. Request Indexing was filed 11 Aug and Google's crawl scheduling is the only variable. Unblock and re-check then_

Queued:

- #14 Fix or remove window.__keptpix_store, which reports empty jobs/sources
- #15 Add a copyable diagnostic block to /selftest
- #16 Clear the 5 unused eslint-disable directives
- #17 Settle D-52: does precache truncate over HTTP/2?
- #18 Re-attempt the Astro 7 upgrade on its branch
- #19 Audit every route's copy against what the code now does
- #20 Decide: reduce the 12 MP peak, or amend the 400 MB budget with evidence

