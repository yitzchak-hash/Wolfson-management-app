/**
 * Recording an action so it can be taken back.
 *
 * `useBoardTrack()` gives one function. Wrap the writes an action performs in
 * it and the rest is automatic:
 *
 *     track({ weight: 'arrange', label: 'Moved 3 things' }, () => {
 *       ids.forEach(id => updateApartment(id, { canvasX, canvasY }, user));
 *     });
 *
 * It is `trackUndo` (store.ts) in a hook's clothing: every kind of record —
 * jobs, board nodes, tasks and what hangs off them, notes, files, the settings
 * bags, tasks written into another workspace — is snapshotted before the body
 * and again after, and only what actually changed is kept. Nothing is
 * enumerated by the caller, which removes the whole class of bug where an
 * action grows a fourth thing it writes to and the undo quietly stops
 * covering it. (Until 2026-10-15 it snapshotted jobs and nodes alone, so every
 * notebook gesture that wrote a TASK's days was wrapped in a track that
 * recorded nothing — the owner's grey undo arrow.)
 *
 * Snapshotting everything sounds expensive and is not: it happens once per
 * finished action — a mouse-up, a menu press — never per frame.
 */

import { useCallback } from 'react';
import { trackUndo } from './store';
import type { TrackOpts } from './undo';

export type { TrackOpts };

export function useBoardTrack() {
  return useCallback(<T,>(opts: TrackOpts | null, body: () => T): T => trackUndo(opts, body), []);
}
