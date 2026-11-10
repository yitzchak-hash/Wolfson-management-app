import type { Apartment, Stage, StageHow, SiteVisit, ContractorCategory, User } from '../types';
import { stageSetOf, stageStateOf, isStartStage, type SetContext } from './stageMarks';

/**
 * THREE KINDS OF STAGE (owner, 2026-11-10, the Site Flow Preview he approved and said "build it" to).
 *
 *   site        — the worker's: "I'm working here", then "I'm done here" with pictures (Working → Done).
 *   inspection  — a user's (Tzvi to start with): a video, then "Do you approve this apartment?" (one step).
 *   office      — one tick in the office ("Sent plans back to contractor"); everyone in the office may tick it.
 *
 * Every stage has the same three settings whatever its kind: who can do it, the proof to finish, and the word it
 * shows when done. These are the ONE reading of them — the settings card, the job window, the worker's phone and the
 * board all ask here.
 */

export function howOf(st: Pick<Stage, 'how'> & Partial<Pick<Stage, 'name' | 'nameHe'>>): StageHow {
  if (st.how) return st.how;
  // Wolfson's list already holds "Inspection 1" / "Inspection 2" (ביקורת) as plain stages: until Settings says
  // otherwise, a stage NAMED an inspection is one, so nothing in the live records has to be rewritten.
  if (/^\s*inspection\b/i.test(st.name ?? '') || /^\s*ביקורת/.test(st.nameHe ?? '')) return 'inspection';
  return 'site';
}

/** An inspection with nobody ticked is Tzvi's — the button was his alone before it became a setting. */
export const isTzviName = (name?: string | null) => {
  const n = (name ?? '').trim();
  return /^(tzvi|zvi)\b/i.test(n) || /^צבי(\s|$)/.test(n);
};

/** The trades that may do a site stage: its own list, else its one trade, else every trade. */
export function tradesOf(st: Pick<Stage, 'canTrades' | 'trade'>): ContractorCategory[] {
  if (st.canTrades?.length) return st.canTrades;
  if (st.trade) return [st.trade];
  return ['ac', 'drywall', 'general'];
}

/** May this office user do this stage? Office tasks: everyone. Inspections: the ticked users (none → Tzvi). */
export function userCanDo(st: Stage, user: Pick<User, 'id' | 'name'> | null | undefined, users?: Pick<User, 'id' | 'name'>[]): boolean {
  if (!user) return false;
  const how = howOf(st);
  if (how === 'office') return true;
  const ticked = st.canUsers ?? [];
  if (ticked.length) return ticked.includes(user.id) || ticked.some(id => users?.find(u => u.id === id)?.name === user.name);
  return how === 'inspection' ? isTzviName(user.name) : true;
}

/** May this worker (of this trade, or this id) do this site stage? */
export function workerCanDo(st: Stage, worker: { id: string; category?: ContractorCategory }): boolean {
  if (howOf(st) !== 'site') return false;
  return !worker.category || tradesOf(st).includes(worker.category) || (st.canUsers ?? []).includes(worker.id);
}

/** The word a done stage shows: its own ("Sent", "Approved"), else Done. */
export function doneWordOf(st: Pick<Stage, 'doneWord' | 'doneWordHe' | 'how'>, rtl: boolean): string {
  const own = rtl ? (st.doneWordHe || st.doneWord) : st.doneWord;
  if (own?.trim()) return own.trim();
  if (howOf(st as Stage) === 'inspection') return rtl ? 'אושר' : 'Approved';
  return rtl ? 'בוצע' : 'Done';
}

/** An inspection asks "Do you approve this apartment?" unless switched off; it always wants a video unless switched off. */
export const asksApprove = (st: Stage) => howOf(st) === 'inspection' && st.proofApprove !== false;
export const wantsVideo = (st: Stage) => st.proofVideo ?? (howOf(st) === 'inspection');

/** The apartment's set, in order, with each stage's state — the same set the job window draws. */
function rows(apt: Apartment, sortedStages: Stage[], ctx?: SetContext) {
  return stageSetOf(apt, sortedStages, ctx)
    .filter(st => !isStartStage(st))
    .map(st => ({ st, state: stageStateOf(apt, st.id, sortedStages) }));
}

/** The first SITE stage still open here — what the worker is asked about at the end ("Did you do Framing?"). */
export function nextSiteStage(apt: Apartment, sortedStages: Stage[], ctx?: SetContext): Stage | null {
  return rows(apt, sortedStages, ctx).find(r => howOf(r.st) === 'site' && r.state !== 'done' && r.state !== 'off')?.st ?? null;
}

/** Every inspection stage on this apartment, in order, with whether it is done. */
export function inspectionsOf(apt: Apartment, sortedStages: Stage[], ctx?: SetContext): { st: Stage; done: boolean }[] {
  return rows(apt, sortedStages, ctx).filter(r => howOf(r.st) === 'inspection').map(r => ({ st: r.st, done: r.state === 'done' }));
}

/** The next inspection: the first one not done yet (the pop-up starts it; "Choose another" offers the rest). */
export function nextInspection(apt: Apartment, sortedStages: Stage[], ctx?: SetContext): Stage | null {
  return inspectionsOf(apt, sortedStages, ctx).find(r => !r.done)?.st ?? null;
}

/**
 * WAITING FOR INSPECTION: the next open stage in the apartment's order is an inspection, and something before it is
 * done (an untouched apartment is not waiting for anybody).
 */
export function waitingInspection(apt: Apartment, sortedStages: Stage[], ctx?: SetContext): Stage | null {
  const list = rows(apt, sortedStages, ctx).filter(r => r.state !== 'off');
  const i = list.findIndex(r => r.state !== 'done');
  if (i <= 0) return null;
  return howOf(list[i].st) === 'inspection' ? list[i].st : null;
}

/** Visits still open (someone is working here now). */
export const workingVisits = (apt: Pick<Apartment, 'siteVisits'>): SiteVisit[] =>
  (apt.siteVisits ?? []).filter(v => v.status === 'working');

/** Visits waiting for the office's answer ("No, something else"). */
export const openQuestions = (apt: Pick<Apartment, 'siteVisits'>): SiteVisit[] =>
  (apt.siteVisits ?? []).filter(v => v.status === 'question');

/** What the board draws on an apartment: someone working (glows), a question (flashes), waiting for inspection. */
export type AptSignal = 'work' | 'ask' | 'wait';
export function signalOf(apt: Apartment, sortedStages: Stage[], ctx?: SetContext): AptSignal | null {
  if (openQuestions(apt).length) return 'ask';
  if (workingVisits(apt).length) return 'work';
  if (waitingInspection(apt, sortedStages, ctx)) return 'wait';
  return null;
}

/** A visit's id: time plus a little noise (two workers can start the same second). */
export const visitId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
