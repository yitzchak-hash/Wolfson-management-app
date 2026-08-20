import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, X, MapPin, CornerDownLeft, Briefcase, FolderOpen, StickyNote,
  Square, Type, LayoutGrid, Sticker, CornerUpLeft, Crosshair,
} from 'lucide-react';
import {
  Apartment, CanvasElement, Stage, ContractorAssignment, binLabelOf, binKeyOf,
} from '../../types';
import { WIDGET_BY_ID } from '../../data/widgets';

export type HitKind = 'job' | 'bin' | 'node';

export interface BoardHit {
  kind: HitKind;
  /** Jobs only. */
  job?: Apartment;
  /** Bins, and the node hits that live on one. */
  bin: CanvasElement | null;
  /** Nodes only — a note, box, heading, widget or piece of clip art. */
  node?: CanvasElement;
  /** What is shown as the result's title. */
  title: string;
  /** Why it matched, so a result never looks arbitrary. */
  why: string;
  /**
   * Show me WHERE it is, and stop there.
   *
   * The ordinary result travels to the thing and opens it, which is usually
   * what somebody wanted. "Show on board" is the other half of the question —
   * where does this actually sit? — so it flies and pulses and leaves the board
   * on screen instead of a drawer over it.
   */
  reveal?: boolean;
}

const NODE_ICON: Record<string, React.ElementType> = {
  note: StickyNote, box: Square, title: Type, widget: LayoutGrid, clipart: Sticker,
  countdown: Type, stopwatch: Type, voice: Type,
};

/**
 * Search across the whole board — jobs, the groups themselves, and everything
 * placed on either.
 *
 * The first version searched jobs and nothing else, which meant typing
 * "archive" or "ready to start" — the names of the groups sitting right there
 * on the board — returned nothing at all. A board search that cannot find the
 * board's own furniture is not a board search.
 */
export function BoardSearch({
  jobs, bins, nodes, stages, assignments, onGo, onClose,
}: {
  jobs: Apartment[];
  bins: CanvasElement[];
  /** Every non-bin node, on the main board and inside groups. */
  nodes: CanvasElement[];
  stages: Stage[];
  assignments: ContractorAssignment[];
  onGo: (hit: BoardHit) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo<BoardHit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const binByKey = new Map(bins.map(b => [binKeyOf(b), b]));
    const out: BoardHit[] = [];

    // ── the groups themselves ──
    for (const b of bins) {
      const label = binLabelOf(b);
      const stage = stages.find(s => s.id === b.stageId);
      const hay = `${label} ${stage?.name ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
      const n = jobs.filter(j => j.boardBin === binKeyOf(b)).length;
      out.push({
        kind: 'bin', bin: b, title: label,
        why: `${n} ${n === 1 ? 'job' : 'jobs'} filed here`
          + (stage ? ` · sets stage ${stage.name}` : ''),
      });
    }

    // ── jobs ──
    for (const job of jobs) {
      const name = (job.displayName ?? '').toLowerCase();
      const addr = (job.address ?? '').toLowerCase();
      const notes = (job.generalNotes ?? '').toLowerCase();
      const stage = stages.find(s => s.id === job.currentStageId);
      const task = assignments.find(a =>
        a.apartmentId === job.id && (a.taskDescription ?? '').toLowerCase().includes(needle));

      let why = '';
      if (name.includes(needle)) why = job.address ? job.address : 'name';
      else if (addr.includes(needle)) why = job.address ?? 'address';
      else if ((stage?.name ?? '').toLowerCase().includes(needle)) why = `stage · ${stage!.name}`;
      else if (task) why = `task · ${task.taskDescription}`;
      else if (notes.includes(needle)) why = 'in the notes';
      else continue;

      out.push({
        kind: 'job', job, title: job.displayName || 'Job',
        bin: job.boardBin ? binByKey.get(job.boardBin) ?? null : null,
        why,
      });
    }

    // ── notes, boxes, headings, widgets, clip art ──
    for (const el of nodes) {
      const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
      const dataText = el.data
        ? Object.values(el.data).filter(v => typeof v === 'string').join(' ')
        : '';
      const hay = `${el.text ?? ''} ${def?.name ?? ''} ${el.docName ?? ''} ${dataText}`.toLowerCase();
      if (!hay.includes(needle)) continue;

      const label = (el.text ?? '').trim() || def?.name || prettyType(el.type);
      out.push({
        kind: 'node', node: el, title: label,
        bin: el.board ? binByKey.get(el.board) ?? null : null,
        why: def ? `${def.name} widget` : prettyType(el.type),
      });
    }

    // Groups first — they are the coarsest answer to "where is it?" — then
    // whatever is out on the board, then whatever has been filed away.
    const rank = (h: BoardHit) => (h.kind === 'bin' ? 0 : h.bin ? 2 : 1);
    return out.sort((a, b) => rank(a) - rank(b)).slice(0, 50);
  }, [q, jobs, bins, nodes, stages, assignments]);

  useEffect(() => setCursor(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-on]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && hits[cursor]) { e.preventDefault(); onGo(hits[cursor]); }
  }

  return (
    <>
      <div className="fixed inset-0 z-[85]"
        style={{ backgroundColor: 'rgba(15,23,42,.42)', backdropFilter: 'blur(3px)' }}
        onClick={onClose} />
      <div
        className="fixed z-[90] flex flex-col overflow-hidden"
        style={{
          left: '50%', top: '12%', transform: 'translateX(-50%)',
          width: 'min(660px, 94vw)', maxHeight: '70vh',
          background: '#ffffff',
          borderRadius: 18,
          border: '1px solid rgba(15,23,42,.07)',
          boxShadow: '0 24px 60px -12px rgba(15,23,42,.32), 0 0 0 1px rgba(15,23,42,.04)',
        }}
        onKeyDown={onKey}
      >
        {/* A search field, not a form control from 2009: no visible box, one
            accent line under it, and the count sitting quietly on the right. */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 flex-shrink-0">
          <Search size={18} style={{ color: '#4aa8d8' }} />
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search the board — jobs, groups, notes, widgets"
            className="flex-1 text-[16px] outline-none bg-transparent placeholder:text-gray-300"
            style={{ letterSpacing: '-0.01em' }}
          />
          {q && (
            <span className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>
              {hits.length}
            </span>
          )}
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="h-px mx-5 flex-shrink-0"
          style={{ background: 'linear-gradient(90deg, #4aa8d8, rgba(74,168,216,0) 65%)' }} />

        <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2 board-rail">
          {q.trim() && hits.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] text-gray-500">Nothing matches “{q.trim()}”.</p>
              <p className="text-[11.5px] text-gray-400 mt-1">
                Jobs, groups, notes, headings and widgets are all searched — on the board and inside groups.
              </p>
            </div>
          )}
          {!q.trim() && (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] text-gray-500">Start typing.</p>
              <p className="text-[11.5px] text-gray-400 mt-1">
                Try a family name, an address, a stage, or the name of a group.
              </p>
            </div>
          )}

          {hits.map((h, i) => {
            const on = i === cursor;
            const st = h.job ? stages.find(s => s.id === h.job!.currentStageId) : undefined;
            const Icon = h.kind === 'bin' ? FolderOpen
              : h.kind === 'job' ? Briefcase
              : NODE_ICON[h.node?.type ?? 'note'] ?? StickyNote;
            const tint = h.kind === 'bin' ? (h.bin?.color ?? '#7c3aed')
              : h.kind === 'job' ? (st?.color ?? '#94a3b8')
              : '#64748b';
            return (
              /**
               * A ROW, not a button.
               *
               * "Show on board" has to sit inside it, and a button inside a
               * button is invalid markup that browsers flatten — the same trap
               * the Building Progress cell hit. The row keeps its click.
               */
              <div
                key={`${h.kind}-${h.job?.id ?? h.node?.id ?? h.bin?.id ?? i}`}
                data-on={on || undefined}
                role="button"
                tabIndex={-1}
                onMouseEnter={() => setCursor(i)}
                onClick={() => onGo(h)}
                className="w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-xl transition-colors cursor-pointer"
                style={{ backgroundColor: on ? 'rgba(74,168,216,.10)' : undefined }}
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0"
                  style={{ backgroundColor: `${tint}18`, color: tint }}>
                  <Icon size={15} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[13.5px] text-gray-900 truncate">
                    {h.title}
                  </span>
                  <span className="block text-[11px] text-gray-500 truncate">
                    {h.kind === 'job' && h.why === h.job?.address
                      ? <><MapPin size={9} className="inline -mt-0.5 mr-0.5" />{h.why}</>
                      : h.why}
                  </span>
                </span>

                {/* Where it lives — the whole reason groups are in this search. */}
                {h.kind !== 'bin' && (
                  h.bin ? (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 flex items-center gap-1"
                      style={{ backgroundColor: `${h.bin.color}1e`, color: h.bin.color }}>
                      <CornerUpLeft size={9} /> {binLabelOf(h.bin)}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 bg-gray-100 text-gray-500">
                      on the board
                    </span>
                  )
                )}
                {h.kind === 'bin' && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `${h.bin?.color ?? '#7c3aed'}1e`, color: h.bin?.color ?? '#7c3aed' }}>
                    group
                  </span>
                )}
                {/*
                  Show me WHERE it is, without opening it.
                  Choosing the row travels there AND opens the thing, which is
                  usually what you wanted; this is the other half of the
                  question — where does it actually sit on the board — so it
                  flies, pulses and stops.
                */}
                <button
                  onClick={e => { e.stopPropagation(); onGo({ ...h, reveal: true }); }}
                  title="Show it on the board"
                  className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-[#1e3a5f]
                             hover:bg-[#4aa8d8]/12 transition-colors"
                >
                  <Crosshair size={14} />
                </button>
                {on && <CornerDownLeft size={13} className="text-gray-300 flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        {hits.length > 0 && (
          <div className="px-5 py-2.5 flex items-center gap-3 text-[11px] text-gray-400 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(15,23,42,.06)' }}>
            <Kbd>↑</Kbd><Kbd>↓</Kbd> to move
            <Kbd>↵</Kbd> to go there
            <span className="flex-1" />
            anything in a group opens the group first
          </div>
        )}
      </div>
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-[5px] text-[10px] font-bold"
      style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid rgba(15,23,42,.07)' }}>
      {children}
    </span>
  );
}

function prettyType(t: string) {
  return t === 'note' ? 'Sticky note'
    : t === 'box' ? 'Section box'
    : t === 'title' ? 'Heading'
    : t === 'clipart' ? 'Clip art'
    : t === 'voice' ? 'Voice memo'
    : t === 'countdown' ? 'Countdown'
    : t === 'stopwatch' ? 'Stopwatch'
    : 'Node';
}
