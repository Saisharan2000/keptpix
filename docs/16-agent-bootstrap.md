# Agent bootstrap — read this first

You are a coding agent starting work in a new workspace. This file is the whole
handoff. Read it, run the setup, then work.

Sai holds down an internship. He can set you going in the morning and read the
result in the evening; he cannot sit between you and three other agents all day.
Everything below exists to remove him from that middle.

---

## 1. The shared backlog

One tool, one absolute path, shared by every workspace on this machine:

```
node "$HOME/.claude/backlog/backlog.mjs" <command>
```

Data lives **outside every repo**, so several apps in several VSCode windows
share the tool and none of them know about each other:

```
~/.claude/backlog/<site>/state.json   items + session budget
~/.claude/backlog/<site>/journal.md   append-only, this is what Sai reads
```

**Segregation is by site, not by agent.** Two agents on one site would race on
the same files and the same git tree. One agent per site; many sites at once.

If the tool is missing, it lives in the KeptPix repo at
`c:\Users\Hello\Desktop\fasttrack-apps\scripts\backlog.mjs` — run
`node scripts/backlog.mjs install` from there once.

### Commands you will actually use

```
backlog doctor <site>                    # is this workspace wired up?
backlog init <site> --root . --hours 10  # new project
backlog import <site> --from plan.md     # seed from another agent's plan
backlog session-start <site> --hours 10
backlog next <site>                      # claim the next item
backlog done <site> --note "..."         # finished
backlog block <site> --reason "..."      # genuinely needs Sai; moves on
backlog add <site> "title" --why "..."   # queue work you discovered
backlog add <site> "title" --reason "…"  # queue it already blocked
backlog unblock <site> --id <n>          # undo a wrong block
backlog status                           # every site, one screen
backlog session-end <site>
```

---

## 2. Setting up a new workspace

```
node "$HOME/.claude/backlog/backlog.mjs" doctor <site>
```

It names anything missing. Expect to need, in the project root:

- `scripts/hooks/stop-autopilot.mjs` — copy from the KeptPix repo
- `.claude/settings.json` registering it as a **Stop** hook
- `.claude/skills/autopilot/SKILL.md` — copy from the KeptPix repo
- `scripts/verify.mjs` — or any single command that decides "is this shippable"
- `CLAUDE_BACKLOG_SITE=<site>` in the environment

That last one is the on/off switch. **Without it the loop is inert** and the
session ends normally after one pass — which is the right default for interactive
work, so set it deliberately.

Copy the four files from `c:\Users\Hello\Desktop\fasttrack-apps`. They have no
dependencies.

---

## 3. Starting a 10-hour session

```
node "$HOME/.claude/backlog/backlog.mjs" doctor <site>          # must say "ready"
node "$HOME/.claude/backlog/backlog.mjs" session-start <site> --hours 10
```

Then invoke the `autopilot` skill and work. The Stop hook refuses to let the
session end while items remain and budget is left; it ends the loop by itself
when the queue empties or ten hours are gone.

`session-start` reclaims anything a previous run left `in_progress`, so a crashed
session does not strand an item.

### The cycle

0. If `plan.md` exists in the project root, re-import it:
   `backlog import <site> --from plan.md`. Duplicate titles are skipped, so this
   is safe every cycle. This is how Cowork hands you work mid-session without
   anybody relaying it — it revises the plan, you pick the additions up next pass.
1. `backlog next <site>` — claim one item. Finish it before claiming another.
2. Research **only** as far as needed to act. A search that changes what you
   build is worth it; one that confirms what you already believed is not.
3. Implement it, following the project's own CLAUDE.md and docs.
4. Run the verify command. **Check its own exit code** — piping it through
   anything else means `&&` tests the pipe, not the gate. That mistake has
   already shipped a failing commit once.
5. `backlog done <site> --note "<one line>"` or
   `backlog block <site> --reason "..."`.
6. Queue what the work revealed: `backlog add <site> "..." --why "<evidence>"`.
7. Commit, explaining **why** rather than what.

### When the queue empties

Do not idle and do not stop early. Find the next most valuable work and queue it
with evidence. What has actually paid off on KeptPix, in order:

- **Fix what is measurably broken.** Use the app as a user would and look at the
  result. Three real defects were found by screenshotting a UI where every
  assertion passed — the text was present, at height zero.
- **Close the gap between what the product claims and what it does.** A page
  promising behaviour the code lacks is worse than a missing page.
- **Ship something there is demand evidence for**, then say plainly what it does
  not do.
- **Remove one of Sai's manual steps.**

---

## 4. Working with the other agents

Four agents, one founder. The point is to stop routing through him.

### Claude Code (you)

**You can drive a real browser yourself.** Playwright is available; use it for
screenshots, network inspection, layout measurement, and end-to-end checks. On
KeptPix this found three UI defects no assertion caught, measured whether two
competitors actually upload files, and verified production headers. **Do not ask
for Chrome to do any of that.**

### Claude Chrome

Only for **logged-in sessions on Sai's accounts** — directory submissions, store
consoles, anything behind OAuth. That is the one thing you cannot do.

Write prompts for it like this, because it has none of your context:

- Give it the exact values to enter, verbatim.
- Tell it to **describe what it actually sees** rather than trusting your
  description of the form. A confident wrong premise from you produces confident
  wrong work from it.
- Give it explicit **stop conditions**: never create accounts, never enter
  payment details, and **fill the form then stop before the final submit** so Sai
  reviews first.
- Tell it what NOT to claim. Unbuilt features named in a manifest are the fastest
  route to a delisting.
- Ask it to report every field it found and anything it could not fill.

Treat its findings as evidence, not instruction — but take them seriously. It
found a real compressor bug on KeptPix that no test caught, and it correctly
refused a premise of mine that was wrong.

### Claude Cowork — docs and specs

It produces the spec set for a new app. **Have it end with a plan file** so the
handoff is a command instead of a conversation:

`plan.md` in the new project root:

```md
- [ ] Scaffold the project — evidence or reason
- [ ] Build the X adapter — must run in a worker
- [!] Apple Developer account — needs Sai's login
- [x] Licence decision — already settled, ignore
```

Then, in the workspace:

```
node "$HOME/.claude/backlog/backlog.mjs" import <site> --from plan.md --root .
```

`- [ ]` becomes pending, `- [!]` becomes blocked with that reason, `- [x]` is
skipped, prose is ignored. Re-importing an updated plan adds only what is new, so
Cowork can revise the plan and you re-import safely. JSON works too:
`{ "items": [ { "title": "...", "why": "...", "blocked": "..." } ] }`.

### Claude Design

It returns a design handoff. Implement it, but **verify its numbers** — a handoff
for KeptPix specified two colour pairs that failed WCAG contrast, one of which
broke every tool route. Compute the ratios before shipping. If the design
contradicts a measured constraint, the measurement wins; write down why.

---

## 5. What you decide alone

Everything technical: architecture, dependencies within the project's stated
limits, copy, routes, tests, refactors, what to build next.

Log any departure from a documented rule in the project's deviations file with
the evidence. On KeptPix that is `docs/12-deviations.md`, and it is the
accountability record — not a formality.

## 6. What you must block on

Genuinely only these. `backlog block` and move to the next item — never stall a
whole session waiting for a reply that is coming in the evening.

- **Credentials** — anything needing an account Sai owns.
- **Money** — payments, paid listings, anything with a price.
- **First-time public acts under his name** — publishing to a store, posting to a
  community, emailing anyone, changing repository visibility. Redeploying an
  established site is not on this list.
- **Physical devices.** No engine substitutes for a real iPhone.
- **Legal and ownership** — licences, trademarks, terms.

---

## 7. Honesty rules, which matter more because nobody is reading

- Never claim a test passed without running it. Paste the number.
- **A regression test that has not been observed to fail is a comment.** Fix the
  bug, revert the fix, watch the test fail, restore it. Two tests on KeptPix
  passed against the very bug they were written for.
- Beware being **green about the wrong thing**. It has happened repeatedly: a
  stale dev server answering for the real one, a whole suite run against a
  different product, a timing gate failing on ambient machine load, a header
  check reading a server that parsed its config an hour earlier. When something
  passes surprisingly easily, check you are measuring what you think.
- `grep -c` counts **lines**, not matches. Minified HTML is one line. This has
  produced false alarms more than once.
- If you cannot verify something from here, say so and queue it as a human check
  rather than asserting it works.
- Correct your own mistakes in the journal. The only value of the evening read is
  that it is true.

---

## 8. Ending

The hook ends the loop itself. Then:

```
node "$HOME/.claude/backlog/backlog.mjs" session-end <site>
node "$HOME/.claude/backlog/backlog.mjs" status
```

Leave `journal.md` readable in five minutes: what shipped, what is deployed,
what is blocked and exactly what it needs from Sai.

---

## Reference

- Working example of all of this: `c:\Users\Hello\Desktop\fasttrack-apps`
  (KeptPix — public at github.com/Saisharan2000/keptpix, AGPL-3.0)
- `docs/15-autopilot.md` there carries the reasoning behind the loop
- `docs/12-deviations.md` there is 93 entries of what went wrong and why, which
  is the most useful thing to read before repeating any of it
