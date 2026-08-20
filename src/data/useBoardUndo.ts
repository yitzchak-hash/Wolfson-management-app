/**
 * Recording a board action so it can be taken back.
 *
 * `useBoardTrack()` gives one function. Wrap the writes an action performs in
 * it and the rest is automatic:
 *
 *     track({ weight: 'arrange', label: 'Moved 3 things' }, () => {
 *       ids.forEach(id => updateApartment(id, { canvasX, canvasY }, user));
 *     });
 *
 * It snapshots every board record before the body runs and again after,
 * then keeps only the ones that actually changed. Nothing is enumerated by
 * the caller, which removes the whole class of bug where an action grows a
 * fourth thing it writes to and the undo quietly stops covering it.
 *
 * Snapshotting everything sounds expensive and is not: it happens once per
 * finished action — a mouse-up, a menu press — never per frame. A board of a
 * thousand records builds two maps of a thousand shallow copies and then
 * throws away all but the handful that moved.
 */

import { useCallback } from 'react';
import { useStore } from './store';
import type { UndoWeight } from './undo';
import { snapJobs, snapEls, sidesDiffer, applySide, type BoardSides } from './undoBoard';
import type { Apartment, CanvasElement } from '../types';

export interface TrackOpts {
  weight: UndoWeight;
  /** What was DONE, past tense: "Moved 3 things". Shown in the history. */
  label: string;
  /**
   * What undoing it will DO, spelled out — required for `content`, because
   * that sentence is the whole reason a content undo stops to ask.
   */
  explain?: string;
}

const changedIds = <T extends { id: string }>(
  before: Map<string, T>, after: Map<string, T>,
): string[] => {
  const out: string[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id);
    const b = after.get(id);
    if (a === b) continue;                       // same object → untouched
    if (!a || !b) { out.push(id); continue; }    // appeared or went away
    // The store replaces the record object on every write, so identity alone
    // already answers this. The value check is the backstop for a write that
    // set a field to what it already held — recording that as an undo step
    // would put a do-nothing entry on the stack.
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(id);
  }
  return out;
};

export function useBoardTrack() {
  const rememberUndo = useStore(s => s.rememberUndo);

  return useCallback(<T,>(opts: TrackOpts, body: () => T): T => {
    const s0 = useStore.getState();
    const pid = s0.currentProjectId;
    const jobs0 = new Map<string, Apartment>(s0.apartments.map(a => [a.id, a]));
    const els0 = new Map<string, CanvasElement>(s0.canvasElements.map(e => [e.id, e]));

    const out = body();

    const s1 = useStore.getState();
    const jobs1 = new Map<string, Apartment>(s1.apartments.map(a => [a.id, a]));
    const els1 = new Map<string, CanvasElement>(s1.canvasElements.map(e => [e.id, e]));

    const jobIds = changedIds(jobs0, jobs1);
    const elIds = changedIds(els0, els1);
    if (jobIds.length === 0 && elIds.length === 0) return out;

    const before: BoardSides = {
      jobs: snapJobs([...jobs0.values()], jobIds),
      els: snapEls([...els0.values()], elIds),
    };
    const after: BoardSides = {
      jobs: snapJobs([...jobs1.values()], jobIds),
      els: snapEls([...els1.values()], elIds),
    };
    if (!sidesDiffer(before, after)) return out;

    rememberUndo({
      projectId: pid,
      weight: opts.weight,
      label: opts.label,
      explain: opts.explain,
      // The sides are held in the closure. They are plain data captured at the
      // moment it happened, which is what makes an undo say what it meant then
      // rather than guessing from what the board looks like now.
      undo: () => runSide(before, after),
      redo: () => runSide(after, before),
    });
    return out;
  }, [rememberUndo]);
}

/**
 * The writers, resolved from the store at the moment the undo runs.
 *
 * Deliberately not captured in the closure: an entry can be undone minutes
 * later, and the actions it should call are the store's current ones.
 */
function runSide(to: BoardSides, from: BoardSides) {
  const st = useStore.getState();
  const user = st.currentUser;
  applySide(to, from, {
    updateJob: (id, patch) => { if (user) st.updateApartment(id, patch, user); },
    updateEl: (id, patch) => st.updateCanvasElement(id, patch),
    restoreEls: els => st.restoreCanvasElements(els),
    deleteEl: id => st.deleteCanvasElement(id),
  });
}
