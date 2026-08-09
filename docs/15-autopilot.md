# 15 — Autopilot: unattended multi-hour sessions

How an agent runs against the shared backlog for a working day without anyone
mediating. Written for the agent, not about it.

> **To make this auto-load as a skill**, copy this file to
> `.claude/skills/autopilot/SKILL.md` and add the frontmatter below. It is kept
> here as documentation because writing agent-instruction files that load
> themselves is a permission a human should grant deliberately, not something a
> session grants itself.
>
> ```
> ---
> name: autopilot
> description: Run an unattended multi-hour build session against this site's shared backlog.
> ---
> ```

## Where the backlog lives

Outside every repo, so several sites in several VSCode workspaces can share one
tool and never know about each other:

```
~/.claude/backlog/backlog.mjs        the tool (installed copy)
~/.claude/backlog/<site>/state.json  items + session budget
~/.claude/backlog/<site>/journal.md  append-only, for the evening read
```

Segregation is **by site, not by agent**. Two agents on one site would race on the
same files and the same git tree. One agent per site, many sites in parallel.

## Start

```
node "$HOME/.claude/backlog/backlog.mjs" status
node "$HOME/.claude/backlog/backlog.mjs" session-start <site> --hours 10
```

`session-start` reclaims anything a previous run left `in_progress`, so a crashed
session does not strand an item.

The Stop hook needs `CLAUDE_BACKLOG_SITE=<site>` in the environment. **Without it
the loop is inert** and the session ends normally after one pass — the correct
default for interactive work, so set it deliberately.

New site:

```
node "$HOME/.claude/backlog/backlog.mjs" init <site> --root . --hours 10
```

## The cycle

One item at a time. Finish it before claiming the next.

1. **Claim.** `backlog next <site>` prints the item, the repo root, the verify
   command, and how much budget is gone.
2. **Research only as far as needed to act.** A search that changes what you build
   is worth it; a search that confirms what you already believed is not. Measure
   rather than assume — `docs/12` is largely entries where an assumption was
   cheaper to check than to be wrong about.
3. **Implement.** CLAUDE.md and the docs it points at still bind at 3am. Layer
   boundaries and the privacy non-negotiables are not negotiable unattended.
4. **Verify.** Run the verify command. It must pass. If a gate fails, fix the
   cause. **Never weaken an assertion to make it green** — if an assertion is
   genuinely wrong, say why in the commit and in `docs/12`.
5. **Close it.** `backlog done <site> --note "<one line>"`, or
   `backlog block <site> --reason "..."` if it truly needs a human.
6. **Queue what the work revealed.** `backlog add <site> "<title>" --why
   "<evidence>"`. This is how a backlog survives ten hours.
7. **Commit.** Explain *why*, not what. Log deviations in `docs/12`.

## When the queue empties

Do not idle, and do not stop early. Find the next most valuable work and queue it
with evidence. In rough order of what has actually paid off on this project:

- **Fix what is measurably broken.** Run the app as a user would and look at the
  result. Three real defects (D-89) were found by screenshotting the UI and none
  of them tripped an assertion, because assertions ask "is the text present" and
  it was — at height zero.
- **Close the gap between what the site claims and what it does.** A page
  promising behaviour the code lacks is worse than a missing page. D-91 and D-92
  were both this.
- **Ship a route there is demand evidence for**, then say plainly what it does
  not do. `docs/05` §5 treats a page that ranks while being less useful than the
  destination as doorway abuse. That rule binds you.
- **Remove a manual step.** Anything the founder does by hand every time is a
  candidate for a script.

## What you decide alone

Everything technical: architecture, dependencies within the CLAUDE.md limits,
copy, routes, test strategy, refactors, what to build next. Log any departure
from a documented rule in `docs/12-deviations.md` with the evidence.

## What you must block on

Genuinely only these. Use `backlog block` and move to the next item — do not
stall a whole session waiting for a reply that is coming in the evening.

- **Credentials and logged-in sessions** — anything needing an account he owns.
- **Money** — payments, paid listings, anything with a price.
- **Public, irreversible acts under his name** — publishing to a store, posting
  to a community, emailing anyone, changing repository visibility. Redeploying an
  established site is not on this list; a first-time public launch is.
- **Physical devices.** No engine substitutes for a real iPhone.
- **Legal and ownership** — licences, trademarks, terms.

## Honesty rules, which matter more when nobody is reading

- Never claim a test passed without running it. Paste the number.
- **A regression test that has not been observed to fail is a comment.** When you
  fix a bug, revert the fix, watch the test fail, restore it. Two tests in this
  repo passed against the bug they were written for (D-91, D-93).
- If you cannot verify something from here, say so and queue it as a human check
  rather than asserting it works.
- Correct your own errors in the journal. The whole value of the evening read is
  that it is true.

## End

The hook ends the loop itself when the queue empties or the budget is spent.

```
node "$HOME/.claude/backlog/backlog.mjs" session-end <site>
node "$HOME/.claude/backlog/backlog.mjs" status
```

Leave the journal readable in five minutes: what shipped, what is deployed, what
is blocked and precisely what it needs.
