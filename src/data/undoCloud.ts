/**
 * THE UNDO LIST, IN THE CLOUD (owner, 2026-10-29: "the whole undo thing …
 * we have to fix" — it vanished on every reload, every workspace switch, and
 * on any other computer).
 *
 * Every undo step is already plain data: the records as they were before
 * and after the action (store.ts trackUndo), from which the undo and redo
 * are rebuilt. So each step is kept as ONE document in `userUndo`, per
 * person and per workspace:
 *
 *   userUndo/<person>__<step id> = { owner, projectId, stack: 'past'|'future',
 *                                    pos, weight, label, explain, at, sides }
 *
 * `sides` is the before/after as JSON text — the records exactly, whatever
 * shape they have, and one step can never break another. A step too big for
 * one document (over ~900 KB) stays on this computer only, said in the console.
 *
 * Undoing an old step patches only the fields that step changed onto the
 * records as they are NOW (applyUndoSides → withPatch), and a step that puts
 * content back still asks first, in words — so a step from yesterday cannot
 * quietly undo somebody else's later work on other fields.
 */
import { fsSet, fsPatch, fsDelete, fsGetWhere, isFirebaseConfigured } from './firebase';
import type { UndoEntry, UndoState, UndoWeight } from './undo';

const COLL = 'userUndo';
const MAX_BYTES = 900_000;
const docId = (owner: string, id: string) => `${owner}__${id}`;

export interface StoredStep {
  id: string; owner: string; projectId: string; stack: 'past' | 'future'; pos: number;
  weight: UndoWeight; label: string; explain?: string; at: number; sides: string;
}

/** A new step was taken: it goes up; the redo list it cleared goes away. */
export function saveNewStep(owner: string | null, entry: UndoEntry, dropped: UndoEntry[]) {
  if (!owner || !isFirebaseConfigured) return;
  for (const e of dropped) fsDelete(COLL, docId(owner, e.id));
  if (!entry.sides) return;
  const sides = JSON.stringify(entry.sides);
  if (sides.length > MAX_BYTES) { console.warn(`undo step "${entry.label}" is too large to keep in the cloud — this computer only`); return; }
  const step: StoredStep = {
    id: entry.id, owner, projectId: entry.projectId, stack: 'past', pos: Date.now(),
    weight: entry.weight, label: entry.label, ...(entry.explain ? { explain: entry.explain } : {}), at: entry.at, sides,
  };
  fsSet(COLL, docId(owner, entry.id), step);
}

/** A step moved between the undo and redo lists. */
export function moveStep(owner: string | null, entry: UndoEntry, to: 'past' | 'future') {
  if (!owner || !isFirebaseConfigured || !entry.sides) return;
  fsPatch(COLL, docId(owner, entry.id), { stack: to === 'past' ? 'future' : 'past', pos: 0 }, { stack: to, pos: Date.now() }, { noCreate: true });
}

/** Steps that fell off the end of the list (over the limit). */
export function dropSteps(owner: string | null, entries: UndoEntry[]) {
  if (!owner || !isFirebaseConfigured) return;
  for (const e of entries) fsDelete(COLL, docId(owner, e.id));
}

/** This person's list for this workspace, rebuilt into live steps. */
export async function loadSteps(
  owner: string, projectId: string,
  rebuild: (sides: { before: unknown; after: unknown }) => { undo: () => void; redo: () => void },
): Promise<UndoState> {
  const rows = (await fsGetWhere(COLL, { owner, projectId })) as unknown as StoredStep[];
  const live = (s: StoredStep): UndoEntry | null => {
    try {
      const sides = JSON.parse(s.sides) as { before: unknown; after: unknown };
      return { id: s.id, projectId: s.projectId, weight: s.weight, label: s.label, explain: s.explain, at: s.at, sides, ...rebuild(sides) };
    } catch { return null; }
  };
  const by = (stack: 'past' | 'future') => rows.filter(r => r.stack === stack).sort((a, b) => a.pos - b.pos)
    .map(live).filter((e): e is UndoEntry => !!e);
  return { past: by('past'), future: by('future') };
}
