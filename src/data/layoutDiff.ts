import { Apartment, CanvasElement, BoardLayout, binLabelOf } from '../types';

/**
 * What restoring a saved layout would actually DO — the ripple, counted.
 *
 * A snapshot is positions only, so the honest summary has three parts:
 *  · what would MOVE (it is somewhere else now than it was then);
 *  · what was added since and simply keeps its spot (the snapshot does not
 *    know it, and restoring never throws anything to 0,0);
 *  · what the snapshot remembers that no longer exists (restoring cannot
 *    resurrect it — deletion is not a position).
 *
 * Pure arithmetic on plain records: no store, no DOM, no clock — so the
 * numbers shown beside a snapshot are testable and cannot drift from what
 * Restore really writes.
 */
export interface LayoutRipple {
  /** Jobs that would move back. */
  jobMoves: number;
  /** Nodes that would move or change size back. */
  elMoves: number;
  /** On the board now, unknown to the snapshot — they keep their spots. */
  keptNew: number;
  /** In the snapshot, gone from the board — restoring cannot bring them back. */
  gone: number;
  /** Up to three names of things that would move, for the summary line. */
  sample: string[];
  /** Nothing would change at all. */
  identical: boolean;
}

const MOVED = 2; // world units — below this a "move" is float noise, not work

/** A node's name, the way somebody would recognise it in a sentence. */
function elName(e: CanvasElement): string {
  if (e.type === 'bin') return binLabelOf(e);
  if (e.type === 'widget') return e.widget ?? 'a widget';
  if (e.text?.trim()) return `“${e.text.trim().slice(0, 24)}”`;
  return e.type;
}

export function layoutRipple(
  layout: BoardLayout,
  apartments: Apartment[],
  canvasElements: CanvasElement[],
): LayoutRipple {
  const jobs = new Map(apartments.map(a => [a.id, a]));
  const els = new Map(canvasElements.map(e => [e.id, e]));
  const sample: string[] = [];
  let jobMoves = 0, elMoves = 0, gone = 0;

  for (const j of layout.jobs) {
    const live = jobs.get(j.id);
    if (!live) { gone++; continue; }
    const dx = Math.abs((live.canvasX ?? 0) - j.x);
    const dy = Math.abs((live.canvasY ?? 0) - j.y);
    if (dx > MOVED || dy > MOVED) {
      jobMoves++;
      if (sample.length < 3) sample.push(live.displayName || 'a job');
    }
  }
  for (const s of layout.els) {
    const live = els.get(s.id);
    if (!live) { gone++; continue; }
    if (Math.abs(live.x - s.x) > MOVED || Math.abs(live.y - s.y) > MOVED
      || Math.abs(live.w - s.w) > MOVED || Math.abs(live.h - s.h) > MOVED) {
      elMoves++;
      if (sample.length < 3) sample.push(elName(live));
    }
  }

  const known = new Set([...layout.jobs.map(j => j.id), ...layout.els.map(e => e.id)]);
  const keptNew =
    apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed && !a.boardBin && !known.has(a.id)).length
    + canvasElements.filter(e => !e.board && !e.attachedTo && !known.has(e.id)).length;

  return {
    jobMoves, elMoves, keptNew, gone, sample,
    identical: jobMoves === 0 && elMoves === 0,
  };
}

/** The ripple as one plain sentence for the snapshot's card. */
export function rippleSentence(r: LayoutRipple): string {
  if (r.identical) {
    return r.gone > 0
      ? `Everything already sits where this snapshot has it. ${r.gone} thing${r.gone === 1 ? '' : 's'} it remembers no longer exist${r.gone === 1 ? 's' : ''}.`
      : 'Everything already sits where this snapshot has it.';
  }
  const bits: string[] = [];
  const moved = r.jobMoves + r.elMoves;
  bits.push(`Moves ${moved} thing${moved === 1 ? '' : 's'} back`
    + (r.sample.length ? ` (${r.sample.join(', ')}${moved > r.sample.length ? '…' : ''})` : ''));
  if (r.keptNew > 0) bits.push(`${r.keptNew} added since keep${r.keptNew === 1 ? 's' : ''} their spot${r.keptNew === 1 ? '' : 's'}`);
  if (r.gone > 0) bits.push(`${r.gone} it remembers ${r.gone === 1 ? 'is' : 'are'} gone and stay${r.gone === 1 ? 's' : ''} gone`);
  return bits.join(' · ') + '.';
}
