# Status — noupload

Generated 2026-08-11 15:34 UTC by `scripts/status.mjs`. **Do not edit by hand** — every
figure below is read from git, the deviations log, the backlog, the built
output or the live origin, and hand edits are overwritten on the next run.

## Live

| | |
|---|---|
| Origin | https://keptpix.com |
| Routes returning 200 | 29/29 |
| Security headers | 6/6 |

## Build

| | |
|---|---|
| Routes in sitemap | 29 |
| Last built | 2026-08-11 15:32 |
| Baseline JS | 45.3 KB gz of 60.0 KB |
| HTML per route | 10.5 KB gz of 25.0 KB |

## Repository

| | |
|---|---|
| Remote | https://github.com/Saisharan2000/keptpix.git |
| Branch | master |
| HEAD | `e178f78` docs/17: reconcile the prose with its own table (2026-08-11) |
| Uncommitted files | 2 |
| Unpushed commits | 0 |

## Recent changes

- `e178f78` 2026-08-11 — docs/17: reconcile the prose with its own table
- `cc91acb` 2026-08-11 — CI runs verify, and a scheduled watch on production
- `9e36255` 2026-08-11 — Monitoring without telemetry, and two copies that disagreed (D-98)
- `3b4ff8c` 2026-08-11 — Generated maintenance docs, and the miscount that proved the point (D-96)
- `49af50a` 2026-08-10 — new-project: an idea to a working workspace in one command
- `fd1699e` 2026-08-10 — A deploy that succeeded and changed nothing (D-97)
- `3e51323` 2026-08-10 — check:token found the project name was wrong (D-96 follow-up)
- `a953e9d` 2026-08-10 — Add check:token, after values landed in a tracked file (D-96)
- `6fae152` 2026-08-10 — Automated deploy with post-deploy proof, and the pipeline design (docs/17)
- `63d944f` 2026-08-10 — bootstrap doc: same plan.md re-import step as the skill
- `b009b49` 2026-08-10 — autopilot: re-import plan.md each cycle, so Cowork can hand over mid-session
- `8b7b088` 2026-08-10 — iOS: download manager instead of the share sheet (D-95 follow-up)

## Known issues and deviations

`docs/12-deviations.md` holds **97** entries. Most are defects found
here and written down rather than quietly fixed; it is the most useful file in
the repository for anyone about to repeat one.

Most recent:

- **D-99** — Cloudflare is telling the crawlers ADR-001 exists for to go away
- **D-98** — monitoring without telemetry, and two copies that disagreed
- **D-97** — a deploy that succeeded and changed nothing
- **D-96** — a valid token reported dead, and secrets in a tracked file
- **D-95** — the PDF was never saved, and the UI said it was

Outstanding, from that log:

- 🟡 `window.__keptpix_store` reports empty `jobs`/`sources` while the UI shows fifty cards (D-80). `device` reads correctly,
- 🟠 Measure the WORKER's heap (D-45, WO-6) — the counter is now live in the harness under `--enable-precise-memory-info`, bu
- 🟡 HEIC fixture into CI (D-36, WO-7) — `scripts/scrub-fixture.mjs` is written and strips GPS/serials/timestamps while PRESE
- 🟡 Precache truncation on HTTP/2 (D-52, WO-5) — does not reproduce on HTTP/1.1 in any shape, including inside a real SW ins
- 🟠 Deploy to Cloudflare Pages (`noupload.app`) — the one M8 acceptance item not doable from here; needs the account. Re-run
- 🟡 `npx playwright install` is now required for a truthful e2e run — chromium alone silently "passed" while 3 engines never
- 🟡 OPFS pipeline write-through + session-restore UI (D-51) — storage primitive is built and swept; the conversion-path inte

## Work queue

Site `keptpix` — 5 done, 4 pending, 1 blocked.

**Waiting on a human:**

- #10 Turn off Cloudflare's managed robots.txt so AI crawlers are not blocked — _Cloudflare dashboard only — the API returns Unauthorized for ai_bots_protection even with the current over-scoped token. Security -> Bots (or AI Crawl Control): disable the managed robots.txt / AI bot blocking. It issues Disallow: / for GPTBot, ClaudeBot and Google-Extended, contradicting our own Allow rules and defeating ADR-001_

Queued:

- #1 awesome-privacy submission issue
- #2 Delete stale NoUploadblueprints/ duplicate of docs/
- #3 Update docs/14 + listing copy now that Open Source is true
- #4 Research 2 more use-case routes with demand evidence

