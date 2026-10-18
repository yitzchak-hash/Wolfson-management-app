/**
 * The worker's close, the parts that are pure arithmetic (owner, 2026-10-18,
 * "More Than the Task Said"):
 *  - the picture rule: one picture or video closes a step by default (the
 *    office can raise it); past one, a picture and a video are enough;
 *  - which stages "Is it one of these?" offers: the ones still open on this
 *    apartment, never the task's own;
 *  - the office's questions: work that was not on the list waits for an
 *    answer, and only the people who answer that kind of question see it glow.
 */
import type { Apartment, ContractorAssignment, OffListItem, QuestionKind, Stage, User } from '../types';
import { shotKindOf } from './sitePhotos';
import { stageSetOf, stageStateOf, isStartStage, type SetContext } from './stageMarks';

/**
 * How many files a close step needs (owner, 2026-10-18: "a minimum of one
 * file, either a video or a picture"). The office can raise it in Settings →
 * Workers — `BoardSetting.closeMinFiles` in the app-wide `__tv` bag, absent
 * = 1, clamped to 1..5.
 */
export const DEFAULT_CLOSE_MIN_FILES = 1;
export const MAX_CLOSE_MIN_FILES = 5;
export function closeMinFilesOf(v: number | undefined | null): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CLOSE_MIN_FILES;
  return Math.min(MAX_CLOSE_MIN_FILES, n);
}

type MediaLike = { fileType?: 'image' | 'video' | 'file'; filename: string; mimeType?: string };

/** Only pictures and videos count toward a close — a PDF is not proof of work. */
export function shotCount(items: MediaLike[]): number {
  return items.filter(m => shotKindOf(m as never) !== null).length;
}

/**
 * Enough to close? `need` pictures or videos — and for any need of two or
 * more, one picture AND one video are enough on their own: a video shows the
 * work as well as several stills do.
 */
export function enoughMedia(items: MediaLike[], need: number): boolean {
  const kinds = items.map(m => shotKindOf(m as never)).filter(k => k !== null);
  if (kinds.length >= need) return true;
  if (need < 2) return false;
  return kinds.includes('image') && kinds.includes('video');
}

/** The open stages "Is it one of these?" offers, in the workspace's order. */
export function extraStageChoices(apt: Apartment | undefined, sorted: Stage[], taskStages: string[], ctx?: SetContext): Stage[] {
  if (!apt) return [];
  return stageSetOf(apt, sorted, ctx).filter(st => {
    if (taskStages.includes(st.id)) return false;
    // Sold/Start ticks itself the moment any later work begins — never a
    // thing a worker reports doing (owner, recording 2026-10-18).
    if (isStartStage(st)) return false;
    const s = stageStateOf(apt, st.id, sorted);
    return s !== 'done' && s !== 'off';
  });
}

/**
 * The stages already FINISHED here (owner, 2026-10-18: "if he already
 * finished the stage and he clicks it, it should be greyed out, but still
 * allow him to click it and add work to it"). Offered greyed beside the open
 * ones; picking one adds work and pictures to it and changes no mark —
 * nothing is reopened.
 */
export function finishedStageChoices(apt: Apartment | undefined, sorted: Stage[], taskStages: string[], ctx?: SetContext): Stage[] {
  if (!apt) return [];
  return stageSetOf(apt, sorted, ctx).filter(st => {
    if (taskStages.includes(st.id)) return false;
    if (isStartStage(st)) return false;
    return stageStateOf(apt, st.id, sorted) === 'done';
  });
}

export const QUESTION_KINDS: { id: QuestionKind; en: string; he: string }[] = [
  { id: 'offList', en: "Work that wasn't on the list", he: 'עבודה שלא הייתה ברשימה' },
];

/**
 * Is this person someone who answers this kind of question? Absent = YES:
 * the office's roles are words like "Boss" and "Manager", nobody is called
 * "admin", so an admins-only default meant a question nobody would ever
 * see glow. Everybody answers until Settings → Users says otherwise.
 */
export function answersKind(user: Pick<User, 'role' | 'answers'> | null | undefined, kind: QuestionKind): boolean {
  if (!user) return false;
  if (user.answers) return user.answers.includes(kind);
  return true;
}

/** The pieces of "not on the list" work still waiting on the office. */
export function openOffList(t: Pick<ContractorAssignment, 'offList'>): OffListItem[] {
  return (t.offList ?? []).filter(i => !i.answer);
}

/** Should this task glow for this person? */
export function asksUser(t: Pick<ContractorAssignment, 'offList'>, user: Pick<User, 'role' | 'answers'> | null | undefined): boolean {
  return openOffList(t).length > 0 && answersKind(user, 'offList');
}

/** The English line written into the task's messages at the close (stored records are English). */
export function extrasLine(
  extras: { name: string; part: boolean; words?: string }[],
  offList: string[],
  added: { name: string; words?: string }[] = [],
): string {
  const parts: string[] = [];
  if (extras.length) {
    parts.push('Also did today: ' + extras.map(e => e.part ? `${e.name} (part of it${e.words ? ` — ${e.words}` : ''})` : e.name).join(', ') + '.');
  }
  if (added.length) {
    parts.push('Added work to stages already finished: ' + added.map(e => e.words ? `${e.name} (${e.words})` : e.name).join(', ') + '.');
  }
  for (const t of offList) parts.push(`Work that wasn't on the list: ${t}`);
  return parts.join('\n');
}
