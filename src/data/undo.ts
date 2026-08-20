/**
 * Undo and redo.
 *
 * The shape of this is decided by one thing the owner asked for by name: some
 * undos are cheap and obvious and should just happen, and some put real
 * content back and must SAY, in plain English, what they are about to do
 * before they do it.
 *
 * So an entry carries three things:
 *   · `weight`  — `arrange` just runs; `content` asks first
 *   · `label`   — what the ORIGINAL action was, for the history list
 *   · `explain` — the sentence shown before undoing a content change
 *
 * And the mechanism is deliberately the dullest one that works: an entry
 * carries the exact `undo` and `redo` closures the caller built at the moment
 * it happened, with the before-values captured then. No diffing of state, no
 * replaying of actions, no attempt to reconstruct an inverse after the fact —
 * all three are ways of being subtly wrong about what actually changed, and a
 * wrong undo is worse than none.
 *
 * It is per-SESSION and per-workspace, never persisted. An undo stack that
 * survived a reload would offer to undo something somebody else has since
 * changed on another device, which is exactly the kind of quiet damage this
 * feature must not do.
 */

export type UndoWeight = 'arrange' | 'content';

export interface UndoEntry {
  id: string;
  /** Which workspace it happened in — the stack never crosses one. */
  projectId: string;
  weight: UndoWeight;
  /** What was DONE, in the past tense: "Moved 3 things", "Took a job off Tuesday". */
  label: string;
  /**
   * What undoing it will do, spelled out. Required for `content`, because
   * that sentence is the whole point of asking.
   */
  explain?: string;
  undo: () => void;
  redo: () => void;
  at: number;
}

/** How many steps back it is worth being able to go. */
export const UNDO_LIMIT = 60;

export interface UndoState {
  past: UndoEntry[];
  future: UndoEntry[];
}

export const emptyUndo = (): UndoState => ({ past: [], future: [] });

/**
 * Record something that just happened.
 *
 * Doing anything new throws the redo stack away — the classic rule, and the
 * right one: once you have taken a different turn, the road you did not take
 * no longer leads anywhere that exists.
 */
export function remember(state: UndoState, entry: Omit<UndoEntry, 'id' | 'at'>): UndoState {
  const full: UndoEntry = {
    ...entry,
    id: `U-${Math.random().toString(36).slice(2, 9)}`,
    at: Date.now(),
  };
  return { past: [...state.past, full].slice(-UNDO_LIMIT), future: [] };
}

/** The entry Ctrl+Z would act on, without acting on it. */
export const nextUndo = (s: UndoState): UndoEntry | null => s.past[s.past.length - 1] ?? null;
/** The entry Ctrl+Shift+Z would act on. */
export const nextRedo = (s: UndoState): UndoEntry | null => s.future[s.future.length - 1] ?? null;

/** Move one entry from past to future. The caller runs `entry.undo()`. */
export function popUndo(s: UndoState): { entry: UndoEntry | null; next: UndoState } {
  const entry = nextUndo(s);
  if (!entry) return { entry: null, next: s };
  return { entry, next: { past: s.past.slice(0, -1), future: [...s.future, entry] } };
}

/** Move one entry from future back to past. The caller runs `entry.redo()`. */
export function popRedo(s: UndoState): { entry: UndoEntry | null; next: UndoState } {
  const entry = nextRedo(s);
  if (!entry) return { entry: null, next: s };
  return { entry, next: { past: [...s.past, entry], future: s.future.slice(0, -1) } };
}

/**
 * Is this keystroke an undo, a redo, or neither?
 *
 * Kept here rather than inline so both the board and the notebook cannot end
 * up disagreeing about what Ctrl+Y means. A field being typed into is never
 * an undo: the browser's own text undo belongs to the box you are in, and
 * stealing it would make editing a note feel broken.
 */
export function undoKey(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const t = e.target as HTMLElement | null;
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y') return 'redo';
  return null;
}

/** "3 things", "1 thing" — used in a dozen labels, so written once. */
export const things = (n: number) => `${n} ${n === 1 ? 'thing' : 'things'}`;
