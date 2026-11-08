/**
 * THE FLAT'S MONEY (owner's D19, connection map 5.5 / 5.6 / 5.7, slice S37).
 *
 * A READ-ONLY mirror on a building flat of two things other apps own:
 *  - the CRM's upgrade orders for the flat's own unit (`crmMoney`, written
 *    onto the flat by the CRM side, the way S12 put the CRM's keys there:
 *    scripts/practice-crm-money.mjs). An ordered upgrade also marks the flat
 *    "Upgraded", once per order (owner, 2026-11-08);
 *  - Finance's balance for the flat's job (`financeBalance`, written by
 *    Finance once it publishes balances per job: S05 job numbers + S07 view).
 *    Until then the window says "Not connected yet", and the line fills
 *    itself the moment the field arrives (the flat is read live).
 *
 * Nobody books money in Wolfson: both fields are stripped from every write
 * made here (crmLink.ts MIRROR_ONLY_FIELDS). They ride inside `apartments`,
 * so the full backup carries them (lib/fullBackup.js RECORD_KEYS).
 */
import type { Apartment, CrmUpgradeOrder, MainUiStrings } from '../types';

/** Agorot to shekels, whole when whole: 495600 → "₪4,956", 76750 → "₪767.50". */
export function shekels(agorot: number | null | undefined): string {
  if (agorot == null || !Number.isFinite(agorot)) return '';
  const neg = agorot < 0;
  const abs = Math.abs(Math.round(agorot));
  const whole = abs % 100 === 0;
  const n = (abs / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  // The shekel sign always sits before the digits and the digits stay
  // left-to-right in a Hebrew line too (the bdi around it in the window).
  return `${neg ? '-' : ''}₪${n}`;
}

/** The order's state in the app's words. */
export function orderStateWord(state: string, ui: MainUiStrings): string {
  if (state === 'won') return ui.moneyOrderWon;
  if (state === 'lost') return ui.moneyOrderLost;
  return ui.moneyOrderOpen;
}

/** Newest first, the lost ones last: the order that matters is on top. */
export function sortedOrders(orders: CrmUpgradeOrder[] | undefined): CrmUpgradeOrder[] {
  const rank = (s: string) => (s === 'won' ? 0 : s === 'lost' ? 2 : 1);
  return [...(orders ?? [])].sort((a, b) => rank(a.state) - rank(b.state));
}

/** What the tile shows: the order that counts (won over open; a lost one shows nothing). */
export function tileOrder(apt: Pick<Apartment, 'crmMoney'> | null | undefined): CrmUpgradeOrder | null {
  const top = sortedOrders(apt?.crmMoney?.orders)[0];
  return top && top.state !== 'lost' ? top : null;
}

/** Does this flat have anything for the Money part to say beyond "not connected"? */
export function hasMoneyPart(apt: Pick<Apartment, 'jobNo' | 'crmCustomerId' | 'crmMoney' | 'financeBalance'> | null | undefined): boolean {
  return !!(apt && (apt.jobNo?.trim() || apt.crmCustomerId?.trim() || apt.crmMoney || apt.financeBalance));
}

/** The balance line's words, or null while Finance is not connected. */
export function balanceWords(apt: Pick<Apartment, 'financeBalance'> | null | undefined, ui: MainUiStrings): string | null {
  const b = apt?.financeBalance;
  if (!b || typeof b.balanceAgorot !== 'number') return null;
  if (b.balanceAgorot > 0) return ui.moneyOwes.replace('{amount}', shekels(b.balanceAgorot));
  if (b.balanceAgorot < 0) return ui.moneyCredit.replace('{amount}', shekels(-b.balanceAgorot));
  return ui.moneySettled;
}
