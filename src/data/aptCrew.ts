import type { Apartment, CustomButton, Stage } from '../types';

/**
 * THE CONTRACTOR AND THE AC COMPANY OF AN APARTMENT (owner, recording 2026-11-11 123621).
 *
 * Contractor (0:07 — "a custom field … I should be able to type in a random name … if AC installation was uploaded
 * and done through the app by a contractor you can fill this in automatically by that contractor and show a little AI
 * icon"): `apartment.crew` is whatever the office typed. While it is empty, the worker who finished the Installation
 * stage through the app (his site visit answered "Yes, Installation") is read here — never written, so a typed name
 * always wins and nothing changes behind anyone's back.
 *
 * AC company (0:31 — "the company of the system … all the AC companies. Get rid of these two buttons"):
 * `apartment.acCompany`. The old yes/no buttons named after a company ("Hisense", "Mitsubishi") are read as the
 * company while the new field is empty, and are no longer drawn as buttons.
 */
export const AC_COMPANIES = ['Hisense', 'Mitsubishi', 'Electra', 'Tadiran', 'Daikin', 'LG', 'Samsung', 'Toshiba', 'Gree', 'Midea'] as const;

const isInstallation = (st: Pick<Stage, 'name' | 'nameHe'>) =>
  /^\s*(ac\s+)?installation\s*$/i.test(st.name ?? '') || (st.nameHe ?? '').trim() === 'התקנה';

/** The contractor's name, and whether the app filled it in by itself. */
export function crewOf(apt: Pick<Apartment, 'crew' | 'siteVisits'>, stages: Stage[]): { name: string; auto: boolean } {
  const typed = (apt.crew ?? '').trim();
  if (typed) return { name: typed, auto: false };
  const inst = new Set(stages.filter(isInstallation).map(s => s.id));
  const visit = [...(apt.siteVisits ?? [])].reverse().find(v => (v.status === 'done' || v.status === 'answered') && !!v.stageId && inst.has(v.stageId));
  return visit?.byName ? { name: visit.byName, auto: true } : { name: '', auto: false };
}

const companyOfName = (name: string) => AC_COMPANIES.find(c => c.toLowerCase() === name.trim().toLowerCase());

/** A custom button that only says which AC company it is — the dropdown has taken its place. */
export const isCompanyButton = (cb: Pick<CustomButton, 'name'>) => !!companyOfName(cb.name);
/** The old "Inspected by Tzvi" yes/no button — the Inspection stages say it now (0:44 — "get rid of inspected by Tzvi"). */
export const isInspectedButton = (cb: Pick<CustomButton, 'name'>) => /^\s*inspected\s+by\b/i.test(cb.name) || /^\s*נבדק\s+ע/.test(cb.name);

/** The apartment's AC company: the chosen one, else an old company button answered Yes. */
export function acCompanyOf(apt: Pick<Apartment, 'acCompany' | 'customAnswers'>, buttons: CustomButton[]): string {
  const own = (apt.acCompany ?? '').trim();
  if (own) return own;
  for (const cb of buttons) {
    const c = companyOfName(cb.name);
    if (c && apt.customAnswers?.[cb.id] === 'yes') return c;
  }
  return '';
}
