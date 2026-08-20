import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Undo2, Redo2, AlertTriangle, X, History } from 'lucide-react';
import { useStore } from '../../data/store';
import { Toast } from '../ui/Toast';
import { nextUndo, nextRedo, undoKey, type UndoEntry } from '../../data/undo';
import { relativeTime } from '../../types';

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

/**
 * The one door in.
 *
 * The buttons, the history list and the keys must take exactly the same path —
 * including the decision about whether to ask — or a press and a keystroke
 * would behave differently on the same entry. The layer publishes its runners
 * here on mount. Module-level and session-only, like the panel positions.
 */
let _run: ((dir: 'undo' | 'redo') => void) | null = null;
let _runTo: ((id: string, dir: 'undo' | 'redo') => void) | null = null;
export const runUndo = (dir: 'undo' | 'redo') => _run?.(dir);
export const runUndoTo = (id: string, dir: 'undo' | 'redo') => _runTo?.(id, dir);

/** A run of steps waiting to be approved. One step is a run of one. */
interface Ask { run: UndoEntry[]; dir: 'undo' | 'redo' }

export function UndoLayer() {
  const undoState = useStore(s => s.undoState);
  const currentProjectId = useStore(s => s.currentProjectId);
  const isRtl = useStore(s => s.mainUiStrings.isRtl);

  const [ask, setAsk] = useState<Ask | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  // A toast is a receipt, not a message: the same words twice in a row must
  // still show, so it is keyed by a counter rather than by its text.
  const [toastKey, setToastKey] = useState(0);
  const say = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    setToast({ text, kind });
    setToastKey(k => k + 1);
  }, []);

  const word = (dir: 'undo' | 'redo', done: boolean) => isRtl
    ? (dir === 'undo' ? (done ? 'בוטל' : 'לבטל') : (done ? 'בוצע שוב' : 'לבצע שוב'))
    : (dir === 'undo' ? (done ? 'Undone' : 'Undo') : (done ? 'Redone' : 'Redo'));

  /** Actually walk the stack. Nothing else calls the store's steppers. */
  const walk = useCallback((run: UndoEntry[], dir: 'undo' | 'redo') => {
    const st = useStore.getState();
    let last: UndoEntry | null = null;
    for (let i = 0; i < run.length; i++) {
      last = dir === 'undo' ? st.stepUndo() : st.stepRedo();
      if (!last) break;
    }
    if (!last) return;
    say(run.length > 1
      ? `${word(dir, true)} — ${run.length} ${isRtl ? 'צעדים' : 'steps'}`
      : `${word(dir, true)} — ${last.label}`);
  }, [isRtl, say]);

  /**
   * Only this workspace's own steps.
   *
   * The stack is cleared on a workspace switch, but a stale entry surviving a
   * race would try to write an apartment that is not in the open workspace's
   * collection — a write to nowhere, which reads as "undo does nothing".
   */
  const mine = useCallback(
    (e: UndoEntry | null) => (e && e.projectId === currentProjectId ? e : null),
    [currentProjectId]);

  const run = useCallback((dir: 'undo' | 'redo') => {
    const st = useStore.getState();
    const entry = mine(dir === 'undo' ? nextUndo(st.undoState) : nextRedo(st.undoState));
    if (!entry) {
      say(dir === 'undo'
        ? (isRtl ? 'אין מה לבטל' : 'Nothing to undo')
        : (isRtl ? 'אין מה לחזור עליו' : 'Nothing to redo'), 'error');
      return;
    }
    if (entry.weight === 'content') { setAsk({ run: [entry], dir }); return; }
    walk([entry], dir);
  }, [mine, isRtl, say, walk]);

  /** Everything back to and including one step in the history list. */
  const runTo = useCallback((id: string, dir: 'undo' | 'redo') => {
    const st = useStore.getState();
    const stack = dir === 'undo'
      ? st.undoState.past.slice().reverse()
      : st.undoState.future.slice().reverse();
    const at = stack.findIndex(e => e.id === id);
    if (at < 0) return;
    const steps = stack.slice(0, at + 1).filter(e => e.projectId === currentProjectId);
    if (!steps.length) return;
    if (steps.some(e => e.weight === 'content')) { setAsk({ run: steps, dir }); return; }
    walk(steps, dir);
  }, [currentProjectId, walk]);

  useEffect(() => {
    _run = run; _runTo = runTo;
    return () => { if (_run === run) _run = null; if (_runTo === runTo) _runTo = null; };
  }, [run, runTo]);

  // The keys. `undoKey` decides what counts, so the board and this layer can
  // never disagree about what Ctrl+Y means — and a field being typed into
  // keeps its own text undo, which is the browser's job and not ours.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ask && e.key === 'Escape') { setAsk(null); return; }
      const what = undoKey(e);
      if (!what) return;
      e.preventDefault();
      run(what);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, ask]);

  function approve() {
    if (!ask) return;
    const { run: steps, dir } = ask;
    setAsk(null);
    walk(steps, dir);
  }

  const receipt = toast
    ? <Toast key={toastKey} message={toast.text} type={toast.kind} onClose={() => setToast(null)} />
    : null;

  if (!ask) return receipt;

  // Only the content steps need explaining: an arrange step inside a run is
  // just a position going back, and listing all of them would bury the ones
  // that matter under a wall of "Moved 1 thing".
  const heavy = ask.run.filter(e => e.weight === 'content');
  const many = ask.run.length > 1;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,.5)' }}
      onClick={() => setAsk(null)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 mb-2">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <h3 className="font-bold text-gray-900 leading-snug">
            {many
              ? (isRtl
                ? `${word(ask.dir, false)} ${ask.run.length} צעדים אחורה?`
                : `${word(ask.dir, false)} the last ${ask.run.length} steps?`)
              : (isRtl
                ? `${word(ask.dir, false)} — ${ask.run[0].label}?`
                : `${word(ask.dir, false)} “${ask.run[0].label}”?`)}
          </h3>
        </div>

        {/* The sentences are the whole reason this stops. Each was written
            when its action happened, so it names the actual job, day and
            person rather than guessing from the board as it stands now. */}
        <div className="text-sm text-gray-700 leading-relaxed mb-3 space-y-2 max-h-64 overflow-auto">
          {heavy.slice(0, 5).map(e => (
            <p key={e.id}>
              {many && <span className="font-semibold text-gray-900">{e.label}: </span>}
              {e.explain ?? (isRtl
                ? 'הפעולה הזאת תוחזר לאחור.'
                : 'This puts things back the way they were before that action.')}
            </p>
          ))}
          {heavy.length > 5 && (
            <p className="text-gray-500">
              {isRtl ? `ועוד ${heavy.length - 5}.` : `…and ${heavy.length - 5} more like these.`}
            </p>
          )}
          {many && ask.run.length > heavy.length && (
            <p className="text-gray-500">
              {isRtl
                ? `בנוסף ${ask.run.length - heavy.length} צעדי סידור על הלוח.`
                : `Plus ${ask.run.length - heavy.length} board arrangement `
                  + `${ask.run.length - heavy.length === 1 ? 'step' : 'steps'} — positions and sizes.`}
            </p>
          )}
        </div>
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
 * The buttons, and the history behind them.
 *
 * A keyboard-only undo is unreachable on the iPad this app is used on, and the
 * board is exactly where an accidental drag happens. Each button names what it
 * would take back, and the list shows what is queued up behind it — so you can
 * see what is about to be undone before committing to it.
 */
export function UndoButtons({ className = '' }: { className?: string }) {
  const undoState = useStore(s => s.undoState);
  const currentProjectId = useStore(s => s.currentProjectId);
  const isRtl = useStore(s => s.mainUiStrings.isRtl);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  const pick = (e: UndoEntry | null) => (e && e.projectId === currentProjectId ? e : null);
  const back = pick(nextUndo(undoState));
  const fwd = pick(nextRedo(undoState));

  const past = undoState.past.filter(e => e.projectId === currentProjectId).slice().reverse();
  const future = undoState.future.filter(e => e.projectId === currentProjectId).slice().reverse();

  /**
   * The list renders through a PORTAL.
   *
   * The board header is a flex item with `z-30`, which makes it a stacking
   * context — so no z-index ON the panel could lift it above the board's
   * floating chrome. The same disease the workspace picker had, cured the
   * same way.
   */
  function toggle() {
    if (open) { setOpen(false); return; }
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 6, left: isRtl ? r.left : Math.max(8, r.right - 320) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    // BOTH refs: with a portal, `wrapRef.contains` alone closes the panel on
    // its own rows.
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const btn = 'p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-default hover:bg-white/15';
  const asksWord = isRtl ? ' (ישאל קודם)' : ' (asks first)';

  function Row({ e, dir, next }: { e: UndoEntry; dir: 'undo' | 'redo'; next: boolean }) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(false); runUndoTo(e.id, dir); }}
        className="w-full text-start px-3 py-2 hover:bg-gray-50 flex items-start gap-2 border-b border-gray-100 last:border-0"
      >
        <span className="mt-0.5 flex-shrink-0" style={{ color: next ? '#1e3a5f' : '#cbd5e1' }}>
          {dir === 'undo' ? <Undo2 size={13} /> : <Redo2 size={13} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-gray-800 truncate">{e.label}</span>
          <span className="block text-[11px] text-gray-400">
            {relativeTime(new Date(e.at).toISOString())}
            {e.weight === 'content' && (
              <span className="text-amber-600 font-medium">
                {' · '}{isRtl ? 'ישאל קודם' : 'asks first'}
              </span>
            )}
          </span>
        </span>
        {next && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1e3a5f] mt-0.5">
            {isRtl ? 'הבא' : 'next'}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`flex items-center ${className}`} ref={wrapRef}>
      <button
        type="button"
        className={btn}
        disabled={!back}
        onClick={() => runUndo('undo')}
        title={back
          ? `${isRtl ? 'לבטל' : 'Undo'}: ${back.label}${back.weight === 'content' ? asksWord : ''}`
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
      <button
        type="button"
        data-undo-history
        className={btn}
        onClick={toggle}
        title={isRtl ? 'מה אפשר לבטל' : 'What can be undone'}
      >
        <History size={16} />
      </button>

      {open && at && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] w-80 max-w-[92vw] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ top: at.top, left: at.left }}
        >
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {isRtl ? 'מה אפשר לבטל' : 'What can be undone'}
            </div>
            <div className="text-[11px] text-gray-400">
              {isRtl
                ? 'לחיצה על שורה תבטל עד אליה, כולל'
                : 'Press a step to undo back to it, that step included'}
            </div>
          </div>

          <div className="max-h-72 overflow-auto">
            {past.length === 0 && future.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-400">
                {isRtl ? 'עוד לא נעשה כלום שאפשר לבטל.' : 'Nothing done yet that could be undone.'}
              </div>
            )}
            {past.map((e, i) => <Row key={e.id} e={e} dir="undo" next={i === 0} />)}

            {future.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-gray-50 border-y border-gray-100
                                text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {isRtl ? 'בוטלו — אפשר לחזור עליהם' : 'Undone — can be put back'}
                </div>
                {future.map((e, i) => <Row key={e.id} e={e} dir="redo" next={i === 0} />)}
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
