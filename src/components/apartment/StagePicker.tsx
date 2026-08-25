import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock, ChevronDown } from 'lucide-react';
import { Stage, MainUiStrings, getStageName } from '../../types';
import { stageStateOf, cycleMark, StageState } from '../../data/stageMarks';

/**
 * The current-stage field, grown up from a native <select> — because a native
 * option cannot wear a checkbox, a strikethrough or a right-click.
 *
 * Every stage row carries a box at its start:
 *  - stages the job has moved PAST draw crossed off with a green check
 *    (derived — moving on is what closes a stage);
 *  - pressing a box crosses that stage off BY HAND, for work done out of
 *    order ("he did wall units before concealed units");
 *  - RIGHT-clicking a box marks the stage half done — a glowing orange
 *    clock — which also puts it on the office's pending list in the header.
 *
 * Pressing the ROW still does what the old select did: sets the current
 * stage (the caller keeps its keep-history / assign-task questions).
 *
 * The panel renders through a PORTAL at z-[140]: the drawer's body is an
 * overflow scroller, and no z-index saves a child from its parent's
 * scissors — the drawer tooltips' disease, cured the same way.
 */
export function StagePicker({ stages, currentStageId, stageMarks, onPickStage, onMarks, ui }: {
  stages: Stage[];
  currentStageId: string;
  stageMarks?: Record<string, 'done' | 'pending'>;
  onPickStage: (stageId: string) => void;
  onMarks: (next: Record<string, 'done' | 'pending'> | undefined) => void;
  ui: MainUiStrings;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const current = stages.find(s => s.id === currentStageId);
  const aptLike = { currentStageId: currentStageId || null, stageMarks };
  const pendingCount = Object.values(stageMarks ?? {}).filter(m => m === 'pending').length;

  function openPanel() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 260);
    const left = ui.isRtl
      ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
      : Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ left, top: Math.min(r.bottom + 4, window.innerHeight - 60), width });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Capture, and stopPropagation, so the drawer's own Escape stays shut out
    // while the panel is the thing being closed.
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);

  const box = (s: Stage, state: StageState) => (
    <button
      data-stage-box
      data-stage-state={state}
      onClick={e => { e.stopPropagation(); onMarks(cycleMark(stageMarks, s.id, 'left')); }}
      onContextMenu={e => {
        e.preventDefault(); e.stopPropagation();
        onMarks(cycleMark(stageMarks, s.id, 'right'));
      }}
      title={ui.stageMarkHint}
      className="w-[18px] h-[18px] flex-shrink-0 rounded flex items-center justify-center border transition-colors"
      style={state === 'done'
        ? { backgroundColor: '#16a34a', borderColor: '#16a34a' }
        : state === 'pending'
          ? { backgroundColor: '#fff7ed', borderColor: '#f97316' }
          : { backgroundColor: '#fff', borderColor: '#d1d5db' }}
    >
      {state === 'done' && <Check size={13} color="#fff" strokeWidth={3} />}
      {state === 'pending' && <Clock size={12} color="#f97316" className="pending-glow" />}
    </button>
  );

  return (
    <>
      <button
        ref={btnRef}
        data-stage-picker
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-left rtl:text-right
                   focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white flex items-center gap-1.5"
        style={{ borderLeftColor: current?.color, borderLeftWidth: current ? '3px' : undefined }}
      >
        {current && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: current.color }} />}
        <span className="flex-1 min-w-0 truncate">
          {current ? getStageName(current, !!ui.isRtl) : ui.notStartedOption}
        </span>
        {pendingCount > 0 && (
          <span className="flex items-center gap-0.5 flex-shrink-0 text-[10px] font-bold" style={{ color: '#f97316' }}>
            <Clock size={11} className="pending-glow" />{pendingCount}
          </span>
        )}
        <ChevronDown size={13} className="flex-shrink-0 text-gray-400" />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          data-stage-panel
          dir={ui.isRtl ? 'rtl' : 'ltr'}
          className="fixed z-[140] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden flex flex-col"
          style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: 'min(360px, calc(100dvh - 24px))' }}
        >
          <div className="flex-1 overflow-y-auto py-1">
            <button
              onClick={() => { onPickStage(''); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left rtl:text-right hover:bg-gray-50 ${
                !currentStageId ? 'font-bold text-[#1e3a5f]' : 'text-gray-500'}`}
            >
              <span className="w-[18px] flex-shrink-0" />
              {ui.notStartedOption}
            </button>
            {stages.map(s => {
              const state = stageStateOf(aptLike, s.id, stages);
              const isCur = s.id === currentStageId;
              return (
                <div
                  key={s.id}
                  data-stage-row={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { onPickStage(s.id); setOpen(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') { onPickStage(s.id); setOpen(false); } }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-gray-50"
                  style={isCur ? { backgroundColor: `${s.color}14` } : undefined}
                >
                  {box(s, state)}
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span
                    className={`flex-1 min-w-0 truncate ${isCur ? 'font-bold' : ''}`}
                    style={state === 'done'
                      ? { textDecoration: 'line-through', color: '#9ca3af' }
                      : state === 'pending' ? { color: '#c2410c' } : undefined}
                  >
                    {getStageName(s, !!ui.isRtl)}
                  </span>
                  {state === 'pending' && (
                    <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide"
                      style={{ color: '#f97316' }}>
                      {ui.stagePendingLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400 flex-shrink-0">
            {ui.stageMarkHint}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
