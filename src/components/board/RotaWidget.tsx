import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays } from 'lucide-react';
import { Apartment, CanvasElement, Contractor, User, personColor, aptLabel } from '../../types';
import { registerRota, onRotaHover, RotaHit } from '../../data/rotaDrop';

/**
 * The rota.
 *
 * Not a planner — a rota, which is a different shape. People down the left, the
 * working week across the top, a cell for each person on each day, and weeks
 * stacked down the page. The office week is SUNDAY TO THURSDAY, so that is the
 * default rather than a setting somebody has to find and change.
 *
 * The thing the paper sheet makes obvious, and which any tidier design would
 * have got wrong: a cell holds a real job AND free words, in the same cell, at
 * the same time. "Pardes 8 am", "Davidian??", "Not working" carry as much
 * meaning as a linked job does, so neither can be second-class. A cell is
 * therefore a LIST of entries, each of which is either a job or some words, and
 * several of them fit — five on a busy Sunday.
 */

export interface RotaEntry {
  id: string;
  /** A real job from the board. */
  jobId?: string;
  /** Or plain words. Both can sit in the same cell. */
  text?: string;
}

export interface RotaData {
  title?: string;
  /** Who is on it, as ids: `c:<contractorId>`, `u:<userId>` or `n:<free name>`. */
  people?: string[];
  /** The Sunday the view starts on, yyyy-mm-dd. */
  start?: string;
  /** How many weeks are stacked. */
  weeks?: number;
  /** How many days across. 5 = Sunday to Thursday. */
  span?: number;
  cells?: Record<string, RotaEntry[]>;
  dayNameSize?: number;
  textSize?: number;
  bold?: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const cellKey = (person: string, day: string) => `${person}|${day}`;

const iso = (d: Date) => {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return t.toISOString().slice(0, 10);
};

/** The Sunday on or before a date — where a week starts here. */
export function sundayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - out.getDay());
  return out;
}

const addDays = (d: Date, n: number) => {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
};

/** Resolve a person id to a name and a colour. */
export function personOf(id: string, contractors: Contractor[], users: User[]) {
  if (id.startsWith('c:')) {
    const c = contractors.find(x => x.id === id.slice(2));
    return { name: c?.name ?? 'Someone', color: personColor(c?.name ?? id, c?.color) };
  }
  if (id.startsWith('u:')) {
    const u = users.find(x => x.id === id.slice(2));
    return { name: u?.name ?? 'Someone', color: personColor(u?.name ?? id, u?.color) };
  }
  const name = id.slice(2) || id;
  return { name, color: personColor(name) };
}

export function RotaWidget({ el, data, jobs, contractors, users, readOnly, update, openJob }: {
  el: CanvasElement;
  data: RotaData;
  jobs: Apartment[];
  contractors: Contractor[];
  users: User[];
  readOnly?: boolean;
  update: (patch: Partial<CanvasElement>) => void;
  openJob: (id: string) => void;
}) {
  // The settings panel hands numbers back as strings — a <select> always does —
  // so everything numeric is coerced here rather than trusted. Array.from with
  // a string length is the failure this prevents.
  const num = (v: unknown, fallback: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;
  };
  const people = data.people?.length ? data.people : [];
  const span = num(data.span, 5, 1, 7);
  const weeks = num(data.weeks, 2, 1, 6);
  const textSize = num(data.textSize, 10, 6, 24);
  const daySize = num(data.dayNameSize, 10, 6, 26);
  const cells = data.cells ?? {};

  const start = useMemo(
    () => (data.start ? new Date(`${data.start}T00:00:00`) : sundayOf(new Date())),
    [data.start],
  );

  const cellRefs = useRef(new Map<string, HTMLElement>());
  const [hover, setHover] = useState<RotaHit | null>(null);

  /**
   * Answer "is one of my cells under this point?" in SCREEN coordinates.
   *
   * The board drags in world coordinates and this grid lives in CSS layout, so
   * asking each cell for its own client rect is the one question both sides can
   * agree on — it already has the board's pan and zoom baked in.
   */
  useEffect(() => registerRota(el.id, (x, y) => {
    for (const [key, node] of cellRefs.current) {
      const r = node.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const [person, day] = key.split('|');
        return { elId: el.id, person, day };
      }
    }
    return null;
  }), [el.id]);

  useEffect(() => onRotaHover(h => setHover(h?.elId === el.id ? h : null)), [el.id]);

  const write = useCallback((next: Record<string, RotaEntry[]>) => {
    update({ data: { ...(el.data ?? {}), cells: next } });
  }, [el.data, update]);

  function setCell(key: string, entries: RotaEntry[]) {
    const next = { ...cells };
    if (entries.length) next[key] = entries; else delete next[key];
    write(next);
  }

  function shift(byWeeks: number) {
    update({ data: { ...(el.data ?? {}), start: iso(addDays(start, byWeeks * 7)) } });
  }

  const jobById = useMemo(() => {
    const m = new Map<string, Apartment>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const todayIso = iso(new Date());

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 flex-shrink-0">
        <CalendarDays size={12} className="text-gray-400 flex-shrink-0" />
        <span className="text-[10px] font-extrabold tracking-wide text-gray-500 truncate flex-1">
          {(data.title || 'Rota').toUpperCase()}
        </span>
        {!readOnly && (
          <>
            <button data-no-drag data-el-action onClick={() => shift(-1)} title="Back a week"
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <ChevronLeft size={13} />
            </button>
            <button data-no-drag data-el-action title="This week"
              onClick={() => update({ data: { ...(el.data ?? {}), start: iso(sundayOf(new Date())) } })}
              className="px-1.5 py-0.5 rounded text-[9px] font-bold text-gray-500 hover:bg-gray-100">
              Today
            </button>
            <button data-no-drag data-el-action onClick={() => shift(1)} title="On a week"
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <ChevronRight size={13} />
            </button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-2 pb-2" data-no-drag>
        {people.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-4">
            <span className="text-[10.5px] text-gray-400 leading-snug">
              Nobody on the rota yet. Open its settings — the pencil — and choose
              who is on it.
            </span>
          </div>
        ) : Array.from({ length: weeks }, (_, wi) => {
          const weekStart = addDays(start, wi * 7);
          const days = Array.from({ length: span }, (_, di) => addDays(weekStart, di));
          return (
            <div key={wi} className={wi ? 'mt-2.5' : ''}>
              {/* Each week carries its own dated header, so a stack of them is
                  readable without counting rows back to the top. */}
              <div
                className="grid gap-px mb-px"
                style={{ gridTemplateColumns: `minmax(56px, 0.9fr) repeat(${span}, minmax(0, 1fr))` }}
              >
                <div className="text-[8.5px] font-black tracking-wide text-gray-400 flex items-end pb-0.5">
                  {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
                {days.map(dt => {
                  const key = iso(dt);
                  const isToday = key === todayIso;
                  return (
                    <div key={key}
                      className="px-1 py-0.5 rounded-t-md leading-tight"
                      style={{ backgroundColor: isToday ? '#e0f2fe' : '#f1f5f9' }}>
                      <div className="font-bold truncate"
                        style={{ fontSize: daySize, color: isToday ? '#0369a1' : '#475569' }}>
                        {span > 5 ? SHORT_DAYS[dt.getDay()] : DAY_NAMES[dt.getDay()]}
                      </div>
                      <div className="tabular-nums truncate"
                        style={{ fontSize: Math.max(7, daySize - 2.5), color: '#94a3b8' }}>
                        {dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {people.map(pid => {
                const person = personOf(pid, contractors, users);
                return (
                  <div key={pid}
                    className="grid gap-px mb-px"
                    style={{ gridTemplateColumns: `minmax(56px, 0.9fr) repeat(${span}, minmax(0, 1fr))` }}>
                    <div className="flex items-center gap-1 px-1 py-1 rounded-l-md min-w-0"
                      style={{ backgroundColor: `${hexish(person.color, 0.10)}` }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: person.color }} />
                      <span className="truncate font-bold"
                        style={{ fontSize: textSize, color: '#334155' }}>{person.name}</span>
                    </div>

                    {days.map(dt => {
                      const day = iso(dt);
                      const key = cellKey(pid, day);
                      const entries = cells[key] ?? [];
                      const lit = hover?.person === pid && hover?.day === day;
                      return (
                        <div
                          key={day}
                          ref={node => {
                            if (node) cellRefs.current.set(key, node);
                            else cellRefs.current.delete(key);
                          }}
                          className="group/cell min-h-[26px] p-0.5 flex flex-col gap-0.5 transition-colors"
                          style={{
                            backgroundColor: lit ? '#dbeafe' : '#fbfcfd',
                            outline: lit ? '2px solid #4aa8d8' : '1px solid #eef2f7',
                            outlineOffset: lit ? -2 : -1,
                          }}
                        >
                          {entries.map(en => (
                            <Entry
                              key={en.id}
                              entry={en}
                              job={en.jobId ? jobById.get(en.jobId) : undefined}
                              color={person.color}
                              size={textSize}
                              bold={data.bold}
                              readOnly={readOnly}
                              onOpen={() => en.jobId && openJob(en.jobId)}
                              onText={v => setCell(key, entries.map(x => (x.id === en.id ? { ...x, text: v } : x)))}
                              onRemove={() => setCell(key, entries.filter(x => x.id !== en.id))}
                            />
                          ))}
                          {!readOnly && (
                            <button
                              data-no-drag data-el-action
                              onClick={() => setCell(key, [...entries, { id: newId(), text: '' }])}
                              title="Add a note to this cell"
                              className="self-start px-0.5 text-gray-300 hover:text-[#1e3a5f]
                                         opacity-0 group-hover/cell:opacity-100 transition-opacity"
                            >
                              <Plus size={9} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One thing in a cell.
 *
 * A linked job reads as a chip in the person's colour and opens on click; free
 * words are just editable words. They look different because they ARE different,
 * but they sit in the same list at the same level.
 */
function Entry({ entry, job, color, size, bold, readOnly, onOpen, onText, onRemove }: {
  entry: RotaEntry;
  job?: Apartment;
  color: string;
  size: number;
  bold?: boolean;
  readOnly?: boolean;
  onOpen: () => void;
  onText: (v: string) => void;
  onRemove: () => void;
}) {
  const [v, setV] = useState(entry.text ?? '');
  useEffect(() => setV(entry.text ?? ''), [entry.text]);

  if (entry.jobId) {
    return (
      <div className="group/en flex items-center gap-0.5 rounded px-1 py-px min-w-0"
        style={{ backgroundColor: hexish(color, 0.16) }}>
        <button
          data-no-drag data-el-action
          onClick={onOpen}
          className="flex-1 min-w-0 text-left truncate"
          style={{ fontSize: size, fontWeight: bold ? 800 : 700, color: '#1e293b' }}
          title={job ? aptLabel(job) : 'This job is no longer on the board'}
        >
          {job ? (job.displayName?.trim() || aptLabel(job)) : '(job removed)'}
        </button>
        {!readOnly && (
          <button data-no-drag data-el-action onClick={onRemove} title="Take it out of this cell"
            className="opacity-0 group-hover/en:opacity-100 text-gray-400 hover:text-red-500 flex-shrink-0">
            <X size={8} />
          </button>
        )}
      </div>
    );
  }

  if (readOnly) {
    return (
      <span className="truncate" style={{ fontSize: size, fontWeight: bold ? 700 : 500, color: '#475569' }}>
        {entry.text}
      </span>
    );
  }

  return (
    <div className="group/en flex items-center gap-0.5 min-w-0">
      <input
        data-no-drag data-el-action
        value={v}
        placeholder="…"
        onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== entry.text) onText(v); if (!v.trim()) onRemove(); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="flex-1 min-w-0 bg-transparent outline-none"
        style={{ fontSize: size, fontWeight: bold ? 700 : 500, color: '#475569' }}
      />
      <button data-no-drag data-el-action onClick={onRemove} title="Remove"
        className="opacity-0 group-hover/en:opacity-100 text-gray-300 hover:text-red-500 flex-shrink-0">
        <X size={8} />
      </button>
    </div>
  );
}

export const newId = () => `R-${Math.random().toString(36).slice(2, 8)}`;

/** A colour at an alpha, whether it arrived as hex or as hsl(). */
function hexish(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const h = color.slice(1);
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  // hsl(Hdeg S% L%) — insert the alpha rather than parsing it apart.
  return color.replace(/^hsl\((.*)\)$/, (_, inner) => `hsla(${inner} / ${alpha})`);
}
