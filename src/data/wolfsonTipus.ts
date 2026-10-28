/**
 * Wolfson's tipus, by rule (owner, recording 2026-10-28, approved on the
 * "Wolfson Tipus Map" page the same day).
 *
 * Our own quote for the project ("W Residence Mini Merkazi", April 2025)
 * splits the flats into A, B, C1 and C2 — 39 of each — and the plans and file
 * names in Drive agree flat by flat: on floors 1–13 the four flats of a floor
 * go A · B · C1 · C2 in number order, so 45 is A, 30 is B, 43 and 47 are C1
 * and 40 is C2. Floor 14 has two flats (53 A, 54 B) and so do the duplexes on
 * 15–16 (55 A, 56 B). The same in all three buildings.
 *
 * A unit made of several flats is a mix, not a tipus of its own ("it's an
 * apartment that is A plus C2"): it carries the first and the last flat it
 * covers, so the joined 21–24 reads "A+C2" and 18–19 reads "B+C1".
 */

export const WOLFSON_TIPUSIM = ['A', 'B', 'C1', 'C2'] as const;

const ROW = ['A', 'B', 'C1', 'C2'];
const TOP: Record<number, string> = { 53: 'A', 54: 'B', 55: 'A', 56: 'B' };

/** The tipus of one flat number, or '' for a number outside the building. */
export function tipusOfNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1) return '';
  if (n <= 52) return ROW[(n - 1) % 4];
  return TOP[n] ?? '';
}

/**
 * The tipus a Wolfson unit should carry, read from its number ("47", "38/39",
 * "21-24") and how many positions it spans. '' when the number says nothing.
 */
export function wolfsonTipus(apt: { apartmentNumber?: string; colSpan?: number }): string {
  const nums = (apt.apartmentNumber ?? '').match(/\d+/g)?.map(Number) ?? [];
  if (!nums.length) return '';
  const lo = nums[0];
  let hi = nums[nums.length - 1];
  if (hi === lo && (apt.colSpan ?? 1) > 1 && lo <= 52) hi = lo + (apt.colSpan ?? 1) - 1;
  const a = tipusOfNumber(lo);
  if (!a) return '';
  if (hi === lo || lo > 52) return a;
  const b = tipusOfNumber(hi);
  return b && b !== a ? `${a}+${b}` : a;
}
