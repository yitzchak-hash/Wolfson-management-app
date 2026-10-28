import type { Apartment } from '../types';

/**
 * Sold or not sold (owner, recording 2026-10-28).
 *
 * A flat is sold when it has a family name. That is the office's own rule
 * already: the Drive folders read "A3/1 - Not Sold" until a family buys, and
 * the board's unnamed flats carried a placeholder like "Building 3/43" as
 * their name. Neither the placeholder nor the bare number counts as a name.
 */
export function realName(apt: Pick<Apartment, 'displayName' | 'apartmentNumber'> | null | undefined): string {
  const raw = apt?.displayName?.trim() ?? '';
  if (!raw) return '';
  if (raw === apt?.apartmentNumber?.trim()) return '';
  if (/^building\s*\w*\s*\/\s*[\d\s/-]+$/i.test(raw)) return '';
  if (/^not\s*sold$/i.test(raw)) return '';
  return raw;
}

export function isSold(apt: Pick<Apartment, 'displayName' | 'apartmentNumber'> | null | undefined): boolean {
  return !!realName(apt);
}

/**
 * The building's short name, as the office says it: Wolfson's A1 · A2 · A3
 * are "1 · 2 · 3" (owner: "we don't want to see the A"). Other workspaces
 * keep their own names.
 */
export function buildingShort(id: string): string {
  return /^A\d+$/.test(id) ? id.slice(1) : id;
}
