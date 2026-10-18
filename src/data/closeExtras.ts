/**
 * The worker's close, the parts that are pure arithmetic (owner, 2026-10-18,
 * "More Than the Task Said"):
 *  - the picture rule: three pictures close a stage — or one picture and one
 *    video, which show the work as well as three stills do;
 *  - which stages "Is it one of these?" offers: the ones still open on this
 *    apartment, never the task's own;
 *  - the office's questions: work that was not on the list waits for an
 *    answer, and only the people who answer that kind of question see it glow.
 */
import type { Apartment, ContractorAssignment, OffListItem, QuestionKind, Stage, User } from '../types';
import { shotKindOf } from './sitePhotos';
import { stageSetOf, stageStateOf, type SetContext } from './stageMarks';

export const MIN_CLOSE_MEDIA = 3;

type MediaLike = { fileType?: 'image' | 'video' | 'file'; filename: string; mimeType?: string };

/** Enough to close? `need` 3 → three of anything, or one picture AND one video. */
export function enoughMedia(items: MediaLike[], need: number): boolean {
  if (items.length >= need) return true;
  if (need < MIN_CLOSE_MEDIA) return false;
  const kinds = items.map(m => shotKindOf(m as never));
  return kinds.includes('image') && kinds.includes('video');
}

/** The open stages "Is it one of these?" offers, in the workspace's order. */
export function extraStageChoices(apt: Apartment | undefined, sorted: Stage[], taskStages: string[], ctx?: SetContext): Stage[] {
  if (!apt) return [];
  return stageSetOf(apt, sorted, ctx).filter(st => {
    if (taskStages.includes(st.id)) return false;
    const s = stageStateOf(apt, st.id, sorted);
    return s !== 'done' && s !== 'off';
  });
}

export const QUESTION_KINDS: { id: QuestionKind; en: string; he: string }[] = [
  { id: 'offList', en: "Work that wasn't on the list", he: 'עבודה שלא הייתה ברשימה' },
];

/** Is this person someone who answers this kind of question? */
export function answersKind(user: Pick<User, 'role' | 'answers'> | null | undefined, kind: QuestionKind): boolean {
  if (!user) return false;
  if (user.answers) return user.answers.includes(kind);
  return (user.role ?? '').toLowerCase().includes('admin');
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
): string {
  const parts: string[] = [];
  if (extras.length) {
    parts.push('Also did today: ' + extras.map(e => e.part ? `${e.name} (part of it${e.words ? ` — ${e.words}` : ''})` : e.name).join(', ') + '.');
  }
  for (const t of offList) parts.push(`Work that wasn't on the list: ${t}`);
  return parts.join('\n');
}
