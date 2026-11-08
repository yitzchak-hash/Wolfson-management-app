/**
 * THE CRM KEYS (ecosystem slice S12, owner's decisions D2, D3, D4, 2026-11-04).
 *
 * The CRM owns the job number, the customer, the address and the phone. A job
 * tile or a flat that carries a CRM key (`jobNo` or `crmCustomerId`) shows
 * those fields with a small "from CRM" mark, they are not edited here, and a
 * press opens the CRM. A record with no CRM key behaves exactly as before.
 *
 * The keys themselves ride inside `apartments` (jobNo, crmCustomerId) and
 * `contractors` (corePersonId), so persist / export / import / sync / the full
 * backup carry them with no new key; `scripts/check-backup-coverage.mjs`
 * checks that they stay declared and carried (lib/fullBackup.js RECORD_KEYS).
 */
import type { Apartment } from '../types';

export const CRM_BASE = 'https://tzviair-crm.vercel.app';

/** The CRM's page for one job number (his idea 9: open-in links from the job number). */
export function crmJobUrl(jobNo: string): string {
  return `${CRM_BASE}/jobs/${encodeURIComponent(jobNo.trim())}`;
}

/** The CRM's page for one customer. */
export function crmCustomerUrl(customerId: string): string {
  return `${CRM_BASE}/customers/${encodeURIComponent(customerId.trim())}`;
}

/** The fields the CRM owns on a job tile or a flat. */
export const CRM_OWNED_FIELDS = ['jobNo', 'crmCustomerId', 'displayName', 'address', 'phone'] as const;
export type CrmOwnedField = typeof CRM_OWNED_FIELDS[number];

type Keyed = Pick<Apartment, 'jobNo' | 'crmCustomerId'> | null | undefined;

/** Does the CRM own this record's job number, customer, address and phone? */
export function isCrmLinked(a: Keyed): boolean {
  return !!(a?.jobNo?.trim() || a?.crmCustomerId?.trim());
}

/** Where a press on a CRM-owned field goes: the customer's page for the customer, else the job's page. */
export function crmUrlFor(a: Keyed, field: CrmOwnedField): string | null {
  if (!a) return null;
  const job = a.jobNo?.trim();
  const cust = a.crmCustomerId?.trim();
  if ((field === 'displayName' || field === 'crmCustomerId') && cust) return crmCustomerUrl(cust);
  if (job) return crmJobUrl(job);
  if (cust) return crmCustomerUrl(cust);
  return null;
}

/**
 * A write from inside Wolfson with the CRM-owned fields taken out: the two
 * keys always (only the CRM sets them), and the customer, address and phone
 * when the record is linked to the CRM. Everything else passes untouched.
 */
/**
 * The money mirrors (D19): the CRM's upgrade orders and Finance's balance,
 * written onto a flat by those apps only. Wolfson never writes them, linked
 * or not, exactly like the two keys.
 */
export const MIRROR_ONLY_FIELDS = ['crmMoney', 'financeBalance'] as const;

export function withoutCrmOwned<T extends Partial<Apartment>>(existing: Keyed, changes: T): T {
  const linked = isCrmLinked(existing);
  const hit: string[] = CRM_OWNED_FIELDS.filter(f => f in changes && (linked || f === 'jobNo' || f === 'crmCustomerId'));
  for (const f of MIRROR_ONLY_FIELDS) if (f in changes) hit.push(f);
  if (!hit.length) return changes;
  const out = { ...changes };
  for (const f of hit) delete (out as Record<string, unknown>)[f];
  return out;
}
