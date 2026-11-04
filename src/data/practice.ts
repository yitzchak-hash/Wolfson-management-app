/**
 * THE PRACTICE COPY (owner, 2026-11-04: "set up a practice database and work
 * on a practice branch only"). The practice deploy (branch `claude/practice`)
 * is built with VITE_PRACTICE=1 and the practice Firebase project's config.
 * Absent everywhere else, so on the real site every check below is false and
 * nothing changes.
 */
export const PRACTICE = (import.meta.env.VITE_PRACTICE as string | undefined) === '1'
  || (import.meta.env.VITE_PRACTICE_BRANCH as string | undefined) === '1';

/** The only Firebase project a practice build may ever talk to. */
export const PRACTICE_PROJECT = 'wolfson-practice';

/**
 * True when a URL belongs to the practice project. A practice build refuses
 * any Firebase address that does not (the live presence database, say),
 * so a missing branch variable can never reach the office's real data.
 */
export function practiceAllows(url: string): boolean {
  if (!PRACTICE) return true;
  return url.includes(PRACTICE_PROJECT);
}
