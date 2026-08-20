import React, { useCallback, useEffect, useState } from 'react';
import { Undo2, Redo2, AlertTriangle, X } from 'lucide-react';
import { useStore } from '../../data/store';
import { Toast } from '../ui/Toast';
import { nextUndo, nextRedo, undoKey, type UndoEntry } from '../../data/undo';

/**
 * The one door in.
 *
 * The buttons and the keys must take exactly the same path — including the
 * decision about whether to ask — or a press and a keystroke would behave
 * differently on the same entry. The layer publishes its `run` here on mount;
 * the buttons call it. Module-level and session-only, like the panel positions.
 */
let _run: ((dir: 'undo' | 'redo') => void) | null = null;
export const runUndo = (dir: 'undo' | 'redo') => _run?.(dir);

/**
 * Undo and redo, and the question that guards the dangerous half of it.
 *
 * The owner's rule, in his words: placements on the board just undo, and
 * anything that puts real content back has to say in plain English exactly
 * what it is about to do and be approved first. So an entry carries a
 * `weight`, and this layer is the only thing that reads it:
 *
 *   · `arrange` — a position, a size, a colour, a lock. It just happens, with
 *     a one-line toast naming what went back, so nothing is silent either.
 *   · `content` — a notebook entry, a removal, filing a job into a group. It
 *     stops and asks, quoting the entry's own `explain` sentence, which was
 *     written at the moment the action happened and therefore describes what
 *     really changed rather than guessing from the board as it stands now.
 *
 * Mounted in AppLayout, so the keys work on any page and a question raised on
 * the board is still answerable after navigating away from it.
 */
export function UndoLayer() {
  const undoState = useStore(s => s.undoState);
  const stepUndo = useStore(s => s.stepUndo);
  const stepRedo = useStore(s => s.stepRedo);
  const currentProjectId = useStore(s => s.currentProjectId);
  const isRtl = useStore(s => s.mainUiStrings.isRtl);
  const [ask, setAsk] = useState<{ entry: UndoEntry; dir: 'undo' | 'redo' } | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  // A toast is a receipt, not a message: the same words twice in a row must
  // still show, so it is keyed by a counter rather than by its text.
  const [toastKey, setToastKey] = useState(0);
  const say = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    setToast({ text, kind });
    setToastKey(k => k + 1);
  }, []);

  /**
   * Only this workspace's own actions.
   *
   * The stack is cleared on a workspace switch, but a stale entry surviving a
   * race would try to write an apartment that is not in the open workspace's
   * collection — a write to nowhere, which reads as "undo does nothing".
   */
  const usable = (e: UndoEntry | null) => (e && e.projectId === currentProjectId ? e : null);

  const run = useCallback((dir: 'undo' | 'redo') => {
    const state = useStore.getState();
    const entry = usable(dir === 'undo' ? nextUndo(state.undoState) : nextRedo(state.undoState));
    if (!entry) {
      say(dir === 'undo'
        ? (isRtl ? 'אין מה לבטל' : 'Nothing to undo')
        : (isRtl ? 'אין מה לחזור עליו' : 'Nothing to redo'), 'error');
      return;
    }
    if (entry.weight === 'content') { setAsk({ entry, dir }); return; }
    const done = dir === 'undo' ? state.stepUndo() : state.stepRedo();
    if (done) {
      say(`${dir === 'undo' ? (isRtl ? 'בוטל' : 'Undone') : (isRtl ? 'בוצע שוב' : 'Redone')} — ${done.label}`);
    }
  }, [currentProjectId, isRtl, say]);

  useEffect(() => { _run = run; return () => { if (_run === run) _run = null; }; }, [run]);

  // The keys. `undoKey` decides what counts, so the board and this layer can
  // never disagree about what Ctrl+Y means — and a field being typed into
  // keeps its own text undo, which is the browser's job and not ours.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const what = undoKey(e);
      if (!what) return;
      e.preventDefault();
      run(what);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  function approve() {
    if (!ask) return;
    const state = useStore.getState();
    const done = ask.dir === 'undo' ? state.stepUndo() : state.stepRedo();
    setAsk(null);
    if (done) {
      say(`${ask.dir === 'undo' ? (isRtl ? 'בוטל' : 'Undone') : (isRtl ? 'בוצע שוב' : 'Redone')} — ${done.label}`);
    }
  }

  const receipt = toast
    ? <Toast key={toastKey} message={toast.text} type={toast.kind} onClose={() => setToast(null)} />
    : null;

  if (!ask) return receipt;

  const dirWord = ask.dir === 'undo'
    ? (isRtl ? 'לבטל' : 'Undo')
    : (isRtl ? 'לבצע שוב' : 'Redo');

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,.5)' }}
      onClick={() => setAsk(null)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 mb-2">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <h3 className="font-bold text-gray-900 leading-snug">
            {isRtl
              ? `${dirWord} — ${ask.entry.label}?`
              : `${dirWord} “${ask.entry.label}”?`}
          </h3>
        </div>

        {/* The sentence is the whole reason this stops. It was written when the
            action happened, so it names the actual job, day and person. */}
        <p className="text-sm text-gray-700 leading-relaxed mb-3">
          {ask.entry.explain
            ?? (isRtl
              ? 'הפעולה הזאת תוחזר לאחור.'
              : 'This will put things back the way they were before that action.')}
        </p>
        <p className="text-xs text-gray-500 mb-4">
          {isRtl
            ? 'שום דבר לא נמחק — אפשר לחזור על הפעולה שוב מיד אחר כך.'
            : 'Nothing is deleted either way, and you can put it straight back with Redo.'}
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setAsk(null)}
            className="px-3.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center gap-1.5"
          >
            <X size={15} />
            {isRtl ? 'להשאיר כמו שזה' : 'Leave it as it is'}
          </button>
          <button
            onClick={approve}
            className="px-3.5 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {ask.dir === 'undo' ? <Undo2 size={15} /> : <Redo2 size={15} />}
            {isRtl ? 'כן, לעשות את זה' : 'Yes, do it'}
          </button>
        </div>
      </div>
      {receipt}
    </div>
  );
}

/**
 * The buttons.
 *
 * A keyboard-only undo is unreachable on the iPad this app is used on, and the
 * board is exactly where an accidental drag happens. Each button names what it
 * would take back, so pressing it is never a guess.
 */
export function UndoButtons({ className = '' }: { className?: string }) {
  const undoState = useStore(s => s.undoState);
  const currentProjectId = useStore(s => s.currentProjectId);
  const isRtl = useStore(s => s.mainUiStrings.isRtl);

  const pick = (e: UndoEntry | null) => (e && e.projectId === currentProjectId ? e : null);
  const back = pick(nextUndo(undoState));
  const fwd = pick(nextRedo(undoState));

  // The layer owns the decision about asking, so the buttons go through the
  // same door the keys do rather than calling the store themselves.

  const btn = 'p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-default hover:bg-white/15';

  return (
    <div className={`flex items-center ${className}`}>
      <button
        type="button"
        className={btn}
        disabled={!back}
        onClick={() => runUndo('undo')}
        title={back
          ? `${isRtl ? 'לבטל' : 'Undo'}: ${back.label}${back.weight === 'content' ? (isRtl ? ' (ישאל קודם)' : ' (asks first)') : ''}`
          : (isRtl ? 'אין מה לבטל' : 'Nothing to undo')}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className={btn}
        disabled={!fwd}
        onClick={() => runUndo('redo')}
        title={fwd
          ? `${isRtl ? 'לבצע שוב' : 'Redo'}: ${fwd.label}`
          : (isRtl ? 'אין מה לחזור עליו' : 'Nothing to redo')}
      >
        <Redo2 size={16} />
      </button>
    </div>
  );
}
