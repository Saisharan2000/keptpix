# 17 — Ideation to maintenance, without a human in the middle

What can actually be automated, what cannot, and the design for the rest.

The goal Sai stated: *"everything automated from ideation to deploy and
maintenance documentation."* This is an honest map of the distance to that, and
the pieces already standing.

---

## The seven stages, and where each one really is

| Stage | Today | Needs |
|---|---|---|
| 1. Ideation / research | manual (Cowork) | **replaceable in-house** |
| 2. Specs and docs | **scaffolded** | `new-project.mjs`; Cowork's plan imports |
| 3. Design | manual (Claude Design) | **replaceable, with a quality trade** |
| 4. Build | automated (`autopilot` + backlog) | done |
| 5. Verify | automated (`verify.mjs`, 8 gates) | done |
| 6. Deploy | **automated** (`deploy.mjs`) | a scoped CF token |
| 7. Maintenance / monitoring | **automated** | `status.mjs` + `monitor.mjs`; Sentry is unusable here (D-98) |

Four of seven are done. Two of the remaining three are agent work that does not
need a separate product at all. The last one — anything behind Sai's logins — is
the only genuinely immovable dependency.

---

## The one thing that cannot be automated

**Claude Chrome acts on Sai's authenticated accounts.** Directory submissions,
App Store consoles, payment screens, anything behind OAuth. No amount of design
removes the need for a human to be present at a login. There is no message bus
between Claude products; what exists here is coordination through **files**, and
files cannot hold a session cookie.

So the rule is: work that needs Chrome gets `backlog block`ed with a precise
reason and waits for the evening. It never stalls the loop.

Everything else on that list is either automated or automatable.

---

## What is standing now

### The backlog — coordination without conversation

```
~/.claude/backlog/<site>/state.json   items + session budget
~/.claude/backlog/<site>/journal.md   append-only, human-readable
```

Outside every repo, so N sites in N workspaces share one tool. Segregated by
site, because two agents on one site race on the same git tree. See docs/15.

### `verify.mjs` — the thing that makes autonomy possible

Eight gates, one exit code. Without this, "is this shippable" is a judgement a
human assembles from seven outputs, and **that judgement is the actual
bottleneck** — not the coding. An agent that cannot answer it has to stop and
ask.

### `deploy.mjs` — build, ship, then prove it shipped

Runs verify first and refuses to deploy if it fails. Then, against the live
origin: every sitemap route returns 200, all six security headers are present,
the CSP still pins `connect-src 'self'`, and a sample of pages is compared to
`dist/` **by sha256**.

That last check was length-based in its first version and reported 5/5 identical
against a production build that was demonstrably older — Astro's content hashes
are fixed width, so a different bundle yields a same-length HTML file. A check
that cannot fail is worse than no check, because it signs off every stale
deploy. Digests now; verified by watching it fail on the real stale deploy and
name the exact three routes whose bundles had changed.

### The Stop hook — the ten-hour loop

Refuses to end a session while the queue has work and the budget has time. Inert
unless `CLAUDE_BACKLOG_SITE` is set; fails open on every error path.

---

## What to build next, in order of leverage

### A. Cowork replacement: a `spec` skill *(highest leverage)*

Cowork writes the initial doc set, and Sai relays it. But an agent can research a
market, name the wedge, and write the spec set itself — that is ordinary agent
work, and the artefact is a `plan.md` the backlog already imports.

- Input: one line of product intent
- Output: `docs/0X-*.md` for the project, plus `plan.md` with evidence in each
  `--why`
- Constraint that matters: **demand evidence before routes.** docs/05 §5 treats a
  page that ranks while being less useful than the destination as doorway abuse,
  and that rule has already killed one proposed route here (a visa page, on
  regionally contradictory facts).

Removes: the Cowork→Sai→Code relay.

### B. Design in-house: a `design-system` skill

Claude Design returns a good handoff, but it also returned two colour pairs that
failed WCAG contrast, one of which broke every tool route. So the handoff needs
verification either way — and if the verification is in-house, generating it can
be too.

- Output: `tokens.css` and a contrast report that **computes the ratios** rather
  than asserting them
- Trade: a specialist tool will produce a more distinctive visual identity. Worth
  keeping Design for a flagship launch; not worth a relay for every internal page.

Removes: the Design→Sai→Code relay for routine work.

### C. Maintenance documentation, generated

The inputs already exist and are already honest — `docs/12-deviations.md` (95
entries), the backlog journal, and git history. A generator turns them into:

- `CHANGELOG.md` grouped by what shipped, from commit subjects
- a status page: routes live, budgets, last deploy, open blockers
- an "outstanding" section from `backlog status`, with the reason each blocked
  item needs a human

The rule: **generated from evidence, never authored.** A maintenance doc that
claims a state nobody measured is the D-91 and D-95 failure again, and those both
told a user something false.

### D. Monitoring loop, via the Sentry MCP

Sentry is already connected. An agent can read new issues, reproduce them
locally, queue them with the stack trace as `--why`, and fix them in the next
cycle. That is the difference between "built" and **maintained**, which is the
last word in Sai's request.

Rule: read-only until it can reproduce. A fix for an error nobody has reproduced
is a guess with a commit message.

### E. CI as the second referee

`verify` on push, via GitHub Actions. Not because local verify is untrusted, but
because a clean machine catches what a warm one hides. Two flakes here appeared
only under load (D-93, and a mobile-safari run that nearly caused a correct fix
to be reverted).

---

## The loop, once A–E are in

```
intent ──> spec skill ──> plan.md ──> backlog import
                                          │
              ┌───────────────────────────┘
              v
        backlog next ──> implement ──> verify ──> deploy.mjs ──> verified live
              ^                                        │
              │                                        v
              └──── queue from Sentry + from what the work revealed
```

Everything in that diagram runs without Sai. What leaves the diagram and waits
for him: credentials, money, first-time public acts under his name, physical
devices, legal calls. Five things, each one `block`ed with a reason, none of them
stalling the rest.

---

## Credential hygiene, since this stage introduces one

`deploy.mjs` reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the
**environment**. Never from a tracked file, never printed — wrangler echoes
environment context on failure, so its output is filtered rather than dumped, and
this runs unattended into logs.

**Scope the token to Account → Cloudflare Pages → Edit and nothing else.** A
token with broader scope can edit DNS and read billing. Deploying needs neither,
and the blast radius of a leaked deploy token should be one Pages project.

A token that has ever been pasted into a chat, a commit, or a screenshot is
compromised regardless of its scope. Roll it.
