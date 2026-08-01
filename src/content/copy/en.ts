/**
 * src/content/copy/en.ts
 *
 * Spec: docs/07-folder-structure.md §1 — message catalog
 * Implemented in: Milestone 4
 *
 * Every user-facing string lives here. Milestone 12 adds hi / id / pt.
 */

export const en = {} as const;

export type MessageKey = keyof typeof en;
