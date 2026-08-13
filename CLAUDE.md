# NoUpload — standing instructions

## Rule 0 — meritocracy wins, otherwise the standard rule wins
If there is a clearly better engineering answer, take it, even when it
contradicts something below. "Clearly better" means you can show the evidence —
a measurement, a failing case, a real user consequence — not that you prefer it.
Absent that evidence, follow the documented rule exactly; a tie goes to the
standard, never to improvisation.

Overriding anything below is a DEVIATION: log it in `docs/12-deviations.md` with
the reasoning and the evidence, and update the doc it contradicts in the same
commit. The rule you broke stays in force for every other case.

## Non-negotiables
1. NOTHING is ever uploaded. No fetch/XHR/WebSocket/beacon may carry user file
   data. If a task seems to need a server, stop and ask — do not improvise one.
2. `src/core/` is pure TypeScript. No DOM, no browser globals, no worker APIs.
   It must run under plain Node in Vitest.
3. All image processing happens inside a Web Worker. The main thread never blocks.
4. Follow docs/07-folder-structure.md exactly. New files go where it says.
5. Follow the contracts in docs/06-contracts.md exactly. Do not change a signature
   without updating that doc in the same commit.

## Performance
- Baseline island JS must stay under 60 KB gzipped. `npm run check:budgets` enforces it.
- Try canvas-native encode before loading any WASM codec (ADR-004).
- Transfer ArrayBuffers to workers — never clone. Close every ImageBitmap in a `finally`.
- Revoke every object URL on unmount.

## Quality bar
- Every JobError must use a code from docs/04-architecture.md §6. No generic throws
  reaching the UI.
- One file failing must never abort a batch.
- Every interactive element is keyboard-operable and has an accessible name.
- New format support = a new adapter in src/engines/. Never a branch in the pipeline.

## Islands run on Preact (ADR-007)
- Write components as React. `import { useState } from 'react'` is correct and
  resolves to `preact/compat`. Do NOT install `react` or `react-dom` — React 19's
  runtime alone is 59.45 KB gz and blows the 60 KB budget on its own.
  NOTE (D-124): package.json DOES declare `"react": "npm:@preact/compat"` — that
  is an npm ALIAS, not React; node_modules/react is a ~2 KB shim onto preact.
  It exists because Astro 7's prerender resolves externals with plain Node, where
  Vite aliases cannot reach. Never repoint it at real React, and never "fix" it
  by installing react-dom.
- A dependency that imports React internally must be added to `vite.ssr.noExternal`
  in astro.config.mjs, or the prerender pass fails on it (zustand is already there).
- `@astrojs/preact` must track Astro's major version. Do not install `@latest`.

## Do not add
pdf-lib (unmaintained since 2021), mupdf (AGPL), ffmpeg.wasm, sharp,
react / react-dom (see ADR-007), any analytics that transmits payloads,
any dependency over 100 KB gz without asking.
