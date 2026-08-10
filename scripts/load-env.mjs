/**
 * scripts/load-env.mjs — read `.env` for the tooling scripts.
 *
 * ONE COPY, SHARED, because there were two and they disagreed. `check-token.mjs`
 * read the file and `deploy.mjs` read only `process.env`, so `npm run
 * check:token` passed and `npm run deploy` then refused for want of the same
 * credentials — after sitting through all eight gates first (docs/12 D-96).
 *
 * Node does not load `.env` on its own. `--env-file` exists but has to be passed
 * at every call site, which is one more thing to forget in one of two places.
 *
 * TOLERANT ON PURPOSE: `KEY=v`, `KEY = v`, quoted values, trailing spaces, CRLF.
 * A strict parser here already caused real damage — it silently found nothing in
 * a file that had values, and that empty result became the input to a
 * `git checkout --`, discarding the very thing it was meant to protect.
 *
 * Real environment variables WIN over the file, so CI can override without
 * anyone editing anything.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @returns {Record<string,string>} parsed pairs, file values only */
export function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m === null) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Look up a variable: the real environment first, then `.env`.
 *
 * Returns undefined for an unset OR empty value, because an empty string in a
 * half-filled `.env` is not a credential and treating it as one produces a
 * confusing 401 instead of a clear "not set".
 */
export function env(name, { file = path.join(process.cwd(), '.env') } = {}) {
  const fromProcess = process.env[name];
  if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
  const fromFile = parseEnvFile(file)[name];
  return fromFile === undefined || fromFile === '' ? undefined : fromFile;
}
