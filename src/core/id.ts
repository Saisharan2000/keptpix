/**
 * src/core/id.ts
 *
 * One id generator, shared by every state/ module that needs one. Living in
 * core/ (rather than duplicated per call site, or left in store.ts) is what
 * lets persistence.slice.ts use it without a circular import back to
 * store.ts, which imports persistence.slice.ts to wire it in.
 */
export const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
