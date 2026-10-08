import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Layers, Circle } from 'lucide-react';
import {
  Apartment, ContractorAssignment, Stage, MainUiStrings, aptLabel, getStageName,
  DEFAULT_MAIN_UI_STRINGS, HEBREW_MAIN_UI_STRINGS,
} from '../../types';
import { useStore, loadProjectSnapshot } from '../../data/store';
import { buildFloorRows, positionMap, rowCells, rowPillLabel } from '../../data/floorRows';
import { taskStageIds } from '../../data/stageMarks';
import { emWidth } from '../diagram/BuildingDiagram';

/**
 * A BUNDLE — the owner's answer to a worker who does a small thing in a
 * bunch of apartments every day (2026-10-08: Igor drilling and reporting in
 * twenty Wolfson flats a day turned his row into a column of twenty tiny
 * green bars). When four or more single-day tasks of one person, on one day,
 * belong to one workspace, the notebook draws them as ONE bar — "15 tasks ·
 * Wolfson · 13 done" — and a press opens this window: every task in a list,
 * and the building with those apartments lit.
 *
 * Nothing is stored: a bundle is a way of DRAWING tasks that are each still
 * their own record. A multi-day task never joins one (it is a stretch, and a
 * stretch is drawn as itself), and neither does the bar a hand is holding.
 */

export const BUNDLE_MIN = 4;

/** The words, by the notebook's own reading language (the portal passes 'ru'). */
export type BundleWords = Pick<MainUiStrings,
  'nbBundleTasks' | 'nbBundleDone' | 'nbBundleOpen' | 'nbBundleHint' | 'nbBundleList'
  | 'nbBundleBuilding' | 'nbBundleNoBuilding' | 'nbBundleDoneAt' | 'nbBundleOpenWord'
  | 'nbBundleLegendDone' | 'nbBundleLegendOpen' | 'nbBundleOpenUnit' | 'nbBundleClose' | 'nbBundleNoStage'
  | 'nbBundleFloors' | 'nbBundleFloor' | 'nbBundleSeeAll'>;

const RUSSIAN_BUNDLE_WORDS: BundleWords = {
  nbBundleTasks: '{n} задач',
  nbBundleDone: '{n} готово',
  nbBundleOpen: '{n} открыто',
  nbBundleHint: 'Нажмите, чтобы увидеть все задачи и где они в здании',
  nbBundleList: 'Все задачи за день',
  nbBundleBuilding: 'Где в здании',
  nbBundleNoBuilding: 'Для этих работ нет схемы здания.',
  nbBundleDoneAt: 'готово {time}',
  nbBundleOpenWord: 'открыта',
  nbBundleLegendDone: 'Готово',
  nbBundleLegendOpen: 'Ещё открыто',
  nbBundleOpenUnit: 'Открыть квартиру',
  nbBundleClose: 'Закрыть',
  nbBundleNoStage: 'без этапа',
  nbBundleFloors: 'этажи {range}',
  nbBundleFloor: 'этаж {n}',
  nbBundleSeeAll: 'Показать все {n}',
};

export function bundleWords(lang?: string): BundleWords {
  if (lang === 'ru') return RUSSIAN_BUNDLE_WORDS;
  return lang === 'he' ? HEBREW_MAIN_UI_STRINGS : DEFAULT_MAIN_UI_STRINGS;
}

const fill = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** One task inside a bundle — what the list row and the lit cell need. */
export interface BundleItem {
  taskId: string;
  task: ContractorAssignment;
  label: string;
  jobId: string;
  done: boolean;
}

export interface BundleInfo {
  items: BundleItem[];
  /** The workspace every item lives in. */
  projectId: string;
  workspace: string;
  color: string;
  done: number;
  day: string;
  /**
   * Where the bundle's flats are — one entry per building, each with its
   * floors as the diagram prints them (owner, 2026-10-08: a bundle across two
   * buildings names BOTH). Empty on the Job Board.
   */
  buildings?: { id: string; floors: string[] }[];
  /** How many of the bundle's tasks are on each stage, in the workspace's order. */
  stages?: { stage: Stage; count: number }[];
}

/** A colour at an alpha (hex only — workspace colours are hex). */
function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return `rgba(30,58,95,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}


/** A stage colour darkened until it reads as text on a pale pill (the board tile's ink). */
export function inkOf(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return '#334155';
  const k = 0.58;
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
}

/**
 * A stage as the board tile draws it: a pale pill in the stage's colour with
 * its name in a darker ink, on ONE line — the font shrinks to the room the
 * card has (never below 6.5 points at 100%) instead of wrapping. `avail` is
 * the card's inner width in the same local pixels the type is set in; 0
 * means "not measured yet", which draws at the full size for one frame.
 */
export function StagePill({ name, color, count, avail, size, z, ...rest }: {
  name: string;
  color: string;
  count?: number;
  avail: number;
  size: number;
  z: (n: number) => number;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const text = count ? `${name} ${count}` : name;
  const pad = Math.max(4, z(6));
  const max = Math.max(z(6.5), size - z(1.5));
  const min = Math.max(5, z(6.5));
  // emWidth measures at weight 600; the pill is 700, a few per cent wider.
  const fit = avail > 0 ? Math.floor(((avail - pad * 2) / Math.max(0.1, emWidth(text) * 1.05)) * 10) / 10 : max;
  const fs = Math.max(min, Math.min(max, fit));
  return (
    <span {...rest} className="inline-block rounded-full whitespace-nowrap overflow-hidden" title={text}
      style={{
        maxWidth: '100%', textOverflow: 'ellipsis', padding: `${Math.max(1, z(1))}px ${pad}px`,
        fontSize: fs, fontWeight: 700, lineHeight: 1.35,
        backgroundColor: alpha(color, 0.15), color: inkOf(color),
      }}>{text}</span>
  );
}

/**
 * A notebook tile measures itself: its WIDTH (for the pills' fit) as local
 * state, and its natural HEIGHT reported up so the notebook can give that
 * lane exactly the room the tallest tile in it needs. Height follows width
 * and never the other way round, so this cannot feed back on itself; both
 * writes are damped. Measured in a layout effect so the first paint already
 * has the right lane heights.
 */
export function useTileMeasure<T extends HTMLElement>(id: string, onMeasure?: (id: string, h: number) => void) {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  const cb = useRef(onMeasure);
  cb.current = onMeasure;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const nw = el.clientWidth;
      setW(prev => (Math.abs(prev - nw) < 1 ? prev : nw));
      cb.current?.(id, el.offsetHeight);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id]);
  return { ref, w };
}

/** "3–7", "6", or the names the office gave its floors. */
function floorsText(floors: string[], words: BundleWords): string {
  const nums = floors.map(f => Number(f)).filter(n => Number.isFinite(n));
  const named = [...new Set(floors.filter(f => f && !Number.isFinite(Number(f))))];
  const parts: string[] = [];
  if (nums.length) {
    const lo = Math.min(...nums), hi = Math.max(...nums);
    parts.push(lo === hi ? fill(words.nbBundleFloor, { n: lo }) : fill(words.nbBundleFloors, { range: `${lo}–${hi}` }));
  }
  parts.push(...named);
  return parts.join(', ');
}

const DONE_GREEN = '#16a34a';
const OPEN_AMBER = '#f59e0b';

/** No browser menu over the notebook's own cards (owner, 2026-10-08). */
export const noMenu = {
  onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); },
};

/**
 * The bundle's bar. In STRIPS mode it is one slim line, the same height as a
 * task bar. In TILES mode (owner, 2026-10-08, "A — a small board tile") it is
 * a stack of tiles: the count big, the workspace and where in the building,
 * a pill per stage with its count, the done share as a green band, "✓ 13 done
 * · 2 open", and "See all 15 ›" — and its natural height is reported up so the
 * lane it sits in is exactly as tall as it needs.
 */
export function BundleBar({ bundle, height, z, size, strip, words, onOpen, id, onMeasure }: {
  bundle: BundleInfo;
  height: number;
  z: (n: number) => number;
  size: number;
  strip: boolean;
  words: BundleWords;
  onOpen: () => void;
  /** The seg's id — what the measured height is filed under. */
  id?: string;
  onMeasure?: (id: string, h: number) => void;
}) {
  const n = bundle.items.length;
  const done = bundle.done;
  const open = n - done;
  const head = fill(words.nbBundleTasks, { n });
  const doneTxt = fill(words.nbBundleDone, { n: done });
  const { ref, w } = useTileMeasure<HTMLDivElement>(id ?? '', strip ? undefined : onMeasure);
  const common = {
    type: 'button' as const,
    'data-no-drag': true, 'data-el-action': true,
    'data-task-bundle': n, 'data-bundle-ws': bundle.projectId, 'data-bundle-done': done,
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onOpen(); },
    ...noMenu,
    title: `${head} · ${bundle.workspace} · ${doneTxt}${open ? ` · ${fill(words.nbBundleOpen, { n: open })}` : ''} — ${words.nbBundleHint}`,
  };

  if (strip) {
    return (
      <button {...common}
        className="relative rounded-md min-w-0 flex-shrink-0 text-left w-full hover:brightness-[.97]"
        style={{
          height, overflow: 'hidden', position: 'relative', zIndex: 3,
          backgroundColor: alpha(bundle.color, 0.12),
          border: `1px solid ${alpha(bundle.color, 0.35)}`,
          borderLeft: `${Math.max(3, z(4))}px solid ${bundle.color}`,
          padding: `${Math.max(2, z(3))}px ${Math.max(4, z(6))}px`,
          cursor: 'pointer',
        }}
      >
        <span className="flex items-center min-w-0" style={{ fontSize: size, fontWeight: 800, color: '#1e3a5f', lineHeight: 1.2, gap: Math.max(2, z(3)) }}>
          <Layers size={Math.max(9, Math.round(size * 0.95))} className="flex-shrink-0" style={{ color: bundle.color }} />
          <span data-bundle-count className="flex-shrink-0 whitespace-nowrap">{head}</span>
          <span className="truncate min-w-0" style={{ flex: '0 20 auto', color: bundle.color, fontWeight: 700, fontSize: Math.max(z(7), size - z(2)) }}>
            · {bundle.workspace}
          </span>
          <span data-bundle-done-txt className="flex-shrink-0 whitespace-nowrap" style={{ color: DONE_GREEN, fontSize: Math.max(z(7), size - z(2)) }}>
            · {doneTxt}
          </span>
        </span>
        <span aria-hidden="true" className="absolute flex overflow-hidden rounded-sm"
          style={{ left: Math.max(4, z(6)), right: Math.max(4, z(6)), bottom: Math.max(2, z(2)), height: Math.max(3, z(4)), backgroundColor: alpha(OPEN_AMBER, 0.55) }}>
          <span data-bundle-share style={{ width: `${n ? (done / n) * 100 : 0}%`, backgroundColor: DONE_GREEN }} />
        </span>
      </button>
    );
  }

  const small = Math.max(z(7), size - z(1.5));
  const padX = Math.max(4, z(7));
  const shadow = Math.max(3, z(6));
  const where = (bundle.buildings ?? [])
    .map(b => [b.id, floorsText(b.floors, words)].filter(Boolean).join(' · '))
    .filter(Boolean).join(' · ');
  return (
    // The wrapper keeps room for the stacked-paper shadow, so the next lane
    // and the next square never sit under it — and it is what gets measured.
    <div ref={ref} className="min-w-0 flex-shrink-0" style={{ paddingInlineEnd: shadow, paddingBottom: shadow, position: 'relative', zIndex: 3 }}>
      <button {...common}
        className="block w-full text-left rounded-lg min-w-0 hover:brightness-[.98]"
        style={{
          backgroundColor: '#ffffff',
          border: `${Math.max(2, z(3))}px solid #1e3a5f`,
          padding: `${Math.max(3, z(5))}px ${padX}px ${Math.max(3, z(6))}px`,
          boxShadow: `${shadow / 2}px ${shadow / 2}px 0 -1px #fff, ${shadow / 2}px ${shadow / 2}px 0 0 #94a3b8, ${shadow}px ${shadow}px 0 -1px #fff, ${shadow}px ${shadow}px 0 0 #94a3b8`,
          cursor: 'pointer',
        }}
      >
        <span data-bundle-count className="block" style={{ fontSize: size + z(3), fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{head}</span>
        <span className="block break-words" style={{ fontSize: small, color: '#64748b', marginTop: Math.max(1, z(1)), lineHeight: 1.25 }}>
          <b data-bundle-ws-name style={{ color: '#7c3aed', fontWeight: 700 }}>{bundle.workspace}</b>
          {where ? ` ${where}` : ''}
        </span>
        {!!bundle.stages?.length && (
          <span className="flex flex-wrap" style={{ gap: Math.max(2, z(3)), marginTop: Math.max(2, z(4)) }}>
            {bundle.stages.map(({ stage, count }) => (
              <StagePill key={stage.id} data-bundle-stage={stage.id} name={stage.name} color={stage.color} count={count}
                avail={w - padX * 2 - Math.max(4, z(6))} size={size} z={z} />
            ))}
          </span>
        )}
        <span aria-hidden="true" className="flex rounded-full overflow-hidden"
          style={{ height: Math.max(3, z(5)), marginTop: Math.max(3, z(5)), backgroundColor: '#e5e7eb' }}>
          <span data-bundle-share style={{ width: `${n ? (done / n) * 100 : 0}%`, backgroundColor: DONE_GREEN }} />
        </span>
        <span className="block" style={{ fontSize: small, marginTop: Math.max(2, z(3)), color: '#64748b', lineHeight: 1.25 }}>
          <b data-bundle-done-txt className="inline-flex items-center" style={{ color: '#15803d', gap: 2 }}>
            <Check size={Math.max(8, Math.round(z(9)))} strokeWidth={3.5} />{doneTxt}
          </b>
          {open > 0 && <> · {fill(words.nbBundleOpen, { n: open })}</>}
        </span>
        <span data-bundle-see-all className="block" style={{ fontSize: small, fontWeight: 700, color: '#2b86b8', marginTop: Math.max(1, z(2)) }}>
          {fill(words.nbBundleSeeAll, { n })} ›
        </span>
      </button>
    </div>
  );
}

/**
 * The building, small, with the bundle's apartments lit — drawn from the
 * SAME row model the building diagram reads (`floorRows.ts`), so a unit sits
 * on its real floor in its real column, from the workspace's snapshot when
 * it is not the one open. Done = green, still open = amber, everything else
 * the quiet grey of a unit nobody touched that day.
 */
function MiniBuildings({ apartments, lit, layouts, onPick, words }: {
  apartments: Apartment[];
  lit: Map<string, 'done' | 'open'>;
  layouts?: Record<string, unknown>;
  onPick: (aptId: string) => void;
  words: BundleWords;
}) {
  const buildings = useMemo(() => {
    const ids = [...new Set(apartments.map(a => a.buildingId).filter(b => b && b !== 'G'))].sort();
    return ids.map(bid => {
      const layout = (layouts?.[bid] ?? null) as Parameters<typeof buildFloorRows>[3];
      const rows = buildFloorRows(bid, apartments, null, layout);
      const pos = positionMap(bid, apartments);
      return { bid, rows: rows.map(r => ({ row: r, cells: rowCells(r, pos) })) };
    });
  }, [apartments, layouts]);

  if (!buildings.length) {
    return <p className="text-[12px] text-gray-400 m-0">{words.nbBundleNoBuilding}</p>;
  }
  const CELL_H = 17;
  return (
    <div className="flex gap-3 items-start" data-bundle-buildings={buildings.length}>
      {buildings.map(({ bid, rows }) => (
        <div key={bid} className="flex flex-col min-w-0" data-bundle-building={bid}>
          <span className="text-center text-[11px] font-black text-white rounded-t-md mb-1 py-0.5"
            style={{ backgroundColor: '#1e3a5f' }}>{bid}</span>
          {rows.map(({ row, cells }) => (
            <div key={row.key} className="flex items-stretch gap-[2px] mb-[2px]" style={{ height: CELL_H }}>
              <span className="w-6 flex-shrink-0 text-[8.5px] font-bold text-gray-400 flex items-center justify-end pe-0.5 tabular-nums truncate">
                {rowPillLabel(row)}
              </span>
              {cells.map(cell => {
                const apt = cell.apt;
                const state = apt ? lit.get(apt.id) : undefined;
                const real = !!apt && !apt.isUnnamed;
                const bg = state === 'done' ? DONE_GREEN : state === 'open' ? OPEN_AMBER : real ? '#e5e7eb' : 'transparent';
                const ink = state === 'done' ? '#fff' : state === 'open' ? '#451a03' : '#9ca3af';
                const w = 22 * cell.span + 2 * (cell.span - 1);
                return state ? (
                  <button key={cell.col} type="button"
                    data-bundle-cell={apt!.id} data-bundle-cell-state={state}
                    onClick={() => onPick(apt!.id)}
                    title={`${aptLabel(apt)} — ${state === 'done' ? words.nbBundleLegendDone : words.nbBundleLegendOpen}`}
                    className="rounded-[3px] text-[8.5px] font-black leading-none flex items-center justify-center hover:ring-2 hover:ring-[#1e3a5f] tabular-nums overflow-hidden"
                    style={{ width: w, backgroundColor: bg, color: ink, boxShadow: '0 0 0 1px rgba(0,0,0,.12) inset' }}>
                    {apt!.apartmentNumber || '•'}
                  </button>
                ) : (
                  <span key={cell.col}
                    className="rounded-[3px] text-[8px] leading-none flex items-center justify-center tabular-nums overflow-hidden"
                    title={apt && real ? aptLabel(apt) : undefined}
                    style={{
                      width: w, backgroundColor: bg, color: ink,
                      border: real ? undefined : '1px dashed #e5e7eb',
                    }}>
                    {real ? apt!.apartmentNumber : ''}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The window a bundle opens — centred, portalled to the body (a notebook is
 * a board node inside a transformed world, and a dialog drawn in there is
 * clipped by its own widget), and SEALED: a portal's React events bubble
 * through the React tree into the node that hosts it, which would capture
 * the pointer and swallow every click (the standing portal-in-a-node trap).
 */
export function BundlePopup({ bundle, person, personColor, dayLabel, stages, words, isRtl, onOpenItem, onClose }: {
  bundle: BundleInfo;
  person: string;
  personColor: string;
  /** "Tuesday 6 October", already in the reader's language. */
  dayLabel: string;
  /** The bundle's OWN workspace's stage list. */
  stages: Stage[];
  words: BundleWords;
  isRtl: boolean;
  onOpenItem: (item: BundleItem) => void;
  onClose: () => void;
}) {
  // Escape closes the window — and only the window: capture phase, stopped,
  // so the board behind it does not also clear its selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const pid = bundle.projectId;
  const currentProjectId = useStore(st => st.currentProjectId);
  const liveApts = useStore(st => st.apartments);
  const snapTick = useStore(st => st.snapshotTick);
  const layouts = useStore(st => st.boardSettings[pid]?.buildingLayout) as Record<string, unknown> | undefined;
  const apartments = useMemo(
    () => (pid === currentProjectId ? liveApts : loadProjectSnapshot(pid).apartments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pid, currentProjectId, liveApts, snapTick]);

  // An apartment with any open task stays amber — the eye goes to what is left.
  const lit = useMemo(() => {
    const m = new Map<string, 'done' | 'open'>();
    for (const it of bundle.items) {
      if (!it.jobId) continue;
      if (!it.done) m.set(it.jobId, 'open');
      else if (!m.has(it.jobId)) m.set(it.jobId, 'done');
    }
    return m;
  }, [bundle.items]);

  const stageName = (id: string) => {
    const st = stages.find(x => x.id === id);
    return st ? getStageName(st, isRtl) : '';
  };
  const timeOf = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(isRtl ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  const open = bundle.items.length - bundle.done;

  const seal = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerMove: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
    onContextMenu: (e: React.MouseEvent) => e.stopPropagation(),
    onWheel: (e: React.WheelEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };
  const pickApt = (aptId: string) => {
    const it = bundle.items.find(x => x.jobId === aptId && !x.done) ?? bundle.items.find(x => x.jobId === aptId);
    if (it) onOpenItem(it);
  };

  return createPortal(
    <div {...seal} dir={isRtl ? 'rtl' : undefined}>
      <div className="fixed inset-0 z-[170]" style={{ backgroundColor: 'rgba(15,23,42,.45)' }} onClick={onClose} />
      <div
        data-bundle-popup={bundle.items.length}
        className="fixed z-[171] rounded-2xl bg-white overflow-hidden flex flex-col"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(980px, 94vw)', maxHeight: '88vh',
          boxShadow: '0 24px 60px -16px rgba(15,23,42,.45)',
        }}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-start gap-3"
          style={{ backgroundColor: alpha(bundle.color, 0.08) }}>
          <span className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: personColor }} />
          <div className="flex-1 min-w-0">
            <h3 className="m-0 text-[16px] font-extrabold text-slate-800 truncate" data-bundle-person>
              {person} · <span className="font-bold text-slate-600">{dayLabel}</span>
            </h3>
            <div className="flex items-center flex-wrap gap-2 mt-1 text-[12.5px] font-bold">
              <span data-bundle-ws-chip className="px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: bundle.color }}>
                {bundle.workspace}
              </span>
              <span className="text-slate-700">{fill(words.nbBundleTasks, { n: bundle.items.length })}</span>
              <span className="inline-flex items-center gap-1" style={{ color: DONE_GREEN }}>
                <Check size={13} strokeWidth={3} />{fill(words.nbBundleDone, { n: bundle.done })}
              </span>
              {open > 0 && <span style={{ color: '#b45309' }}>{fill(words.nbBundleOpen, { n: open })}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} title={words.nbBundleClose} data-bundle-close
            className="text-gray-400 hover:text-gray-700 p-1 -m-1"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto flex flex-col md:flex-row gap-4 p-4">
          <div className="flex-1 min-w-0 md:min-w-[320px]">
            <h4 className="m-0 mb-2 text-[11px] font-black uppercase tracking-wider text-gray-400">{words.nbBundleList}</h4>
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {bundle.items.map(it => {
                const ids = taskStageIds(it.task);
                const names = ids.map(stageName).filter(Boolean);
                return (
                  <li key={it.taskId}>
                    <button type="button" data-bundle-row={it.taskId} data-bundle-row-done={it.done ? '1' : '0'}
                      onClick={() => onOpenItem(it)}
                      title={it.jobId ? words.nbBundleOpenUnit : undefined}
                      className="w-full text-start flex items-start gap-2 px-2.5 py-2 rounded-lg border hover:bg-slate-50 transition-colors"
                      style={{ borderColor: it.done ? '#bbf7d0' : '#fde68a', backgroundColor: it.done ? '#f0fdf4' : '#fffbeb' }}>
                      {it.done
                        ? <Check size={16} strokeWidth={3} className="flex-shrink-0 mt-0.5" style={{ color: DONE_GREEN }} />
                        : <Circle size={15} strokeWidth={2.5} className="flex-shrink-0 mt-0.5" style={{ color: OPEN_AMBER }} />}
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-extrabold text-[#1e3a5f] break-words">{it.label}</span>
                        <span className="block text-[11.5px] text-slate-500 break-words">
                          {names.length ? names.join(' · ') : words.nbBundleNoStage}
                          {it.task.taskDescription?.trim() ? ` — ${it.task.taskDescription.trim()}` : ''}
                        </span>
                      </span>
                      <span className="flex-shrink-0 text-[11.5px] font-bold whitespace-nowrap mt-0.5"
                        style={{ color: it.done ? DONE_GREEN : '#b45309' }}>
                        {it.done ? fill(words.nbBundleDoneAt, { time: timeOf(it.task.completedAt) }).trim() : words.nbBundleOpenWord}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="md:w-auto md:max-w-[55%] min-w-0" data-bundle-diagram>
            <h4 className="m-0 mb-2 text-[11px] font-black uppercase tracking-wider text-gray-400">{words.nbBundleBuilding}</h4>
            <div className="flex items-center gap-3 mb-2 text-[11px] font-bold text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: DONE_GREEN }} />{words.nbBundleLegendDone}</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: OPEN_AMBER }} />{words.nbBundleLegendOpen}</span>
            </div>
            <div className="overflow-auto" dir="ltr">
              <MiniBuildings apartments={apartments} lit={lit} layouts={layouts} onPick={pickApt} words={words} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
