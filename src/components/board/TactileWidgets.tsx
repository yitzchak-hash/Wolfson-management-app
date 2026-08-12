import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Images, Rows3, Trophy } from 'lucide-react';
import { CanvasElement, isCountableApartment, personColor } from '../../types';
import { Frame, d, useTick, WidgetCtx } from '../../data/widgets';

/**
 * The three that are worth touching.
 *
 * Everything else on the board reports. These three are the ones somebody
 * walks up to: a photo wipe you drag, letters that physically flip, and a race
 * that moves when work gets closed. On a wall panel in an office that matters
 * more than another bar chart — a screen nobody approaches is a screen nobody
 * reads.
 */

// ─── Before and after ────────────────────────────────────────────────────────

/**
 * Two photos of the same place, with a divider you drag between them.
 *
 * The photos are already being collected; nothing else in the app does
 * anything with the pair except list them in date order. Wiping between them
 * is the one presentation of a before and an after that makes the difference
 * legible in a second.
 */
export function BeforeAfter({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const box = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(Number(data.split ?? 50));
  const [dragging, setDragging] = useState(false);

  /**
   * Pick the pair automatically when none is set: the oldest and newest photo
   * of whichever job has the most. A widget that opens asking to be configured
   * gets configured by nobody.
   */
  const auto = useMemo(() => {
    const byJob = new Map<string, typeof c.photos>();
    for (const p of c.photos) {
      if (!p.storageUrl && !p.driveUrl && !p.dataUrl) continue;
      const task = c.assignments.find(a => a.id === p.assignmentId);
      const jobId = task?.apartmentId ?? p.apartmentId;
      if (!jobId) continue;
      byJob.set(jobId, [...(byJob.get(jobId) ?? []), p]);
    }
    let best: { jobId: string; list: typeof c.photos } | null = null;
    for (const [jobId, list] of byJob) {
      if (list.length >= 2 && (!best || list.length > best.list.length)) best = { jobId, list };
    }
    if (!best) return null;
    const sorted = [...best.list].sort((a, b) => (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? ''));
    return { jobId: best.jobId, before: sorted[0], after: sorted[sorted.length - 1] };
  }, [c.photos, c.assignments]);

  const src = (p: { storageUrl?: string; driveUrl?: string; dataUrl?: string } | undefined) =>
    p ? (p.storageUrl || p.dataUrl || p.driveUrl || '') : '';

  const beforeUrl = (data.beforeUrl as string) || src(auto?.before);
  const afterUrl = (data.afterUrl as string) || src(auto?.after);
  const job = c.jobs.find(j => j.id === (data.jobId || auto?.jobId));

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    setPct(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  if (!beforeUrl || !afterUrl) {
    return (
      <Frame title={data.title || 'Before and after'} icon={Images}>
        <span className="text-[10px] text-gray-400">
          Two photos of one job are needed — pick them in the settings, or wait until
          site has sent a second picture back.
        </span>
      </Frame>
    );
  }

  return (
    <Frame title={data.title || (job ? `Before and after · ${job.displayName}` : 'Before and after')} icon={Images}>
      <div
        ref={box}
        // Both attributes, or the board takes the press as the start of a drag
        // and the divider never moves at all.
        data-no-drag data-el-action
        className="relative w-full h-full rounded-md overflow-hidden select-none"
        style={{ cursor: 'ew-resize', touchAction: 'none' }}
        onPointerDown={e => {
          if (c.readOnly) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragging(true); move(e.clientX);
        }}
        onPointerMove={e => { if (dragging) move(e.clientX); }}
        onPointerUp={() => {
          setDragging(false);
          if (!c.readOnly) c.update({ data: { ...data, split: Math.round(pct) } });
        }}
      >
        <img src={afterUrl} alt="after" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        {/* The "before" is clipped rather than faded, so the two halves are
            genuinely the same frame at the same scale and the eye can compare
            them. A cross-fade hides exactly the detail you are looking for. */}
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
          <img src={beforeUrl} alt="before"
            className="absolute inset-0 h-full object-cover" draggable={false}
            style={{ width: box.current?.clientWidth ?? '100%' }} />
        </div>
        <div className="absolute inset-y-0" style={{ left: `${pct}%`, width: 2, backgroundColor: '#fff', boxShadow: '0 0 4px rgba(0,0,0,.5)' }} />
        <div className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow flex items-center justify-center"
          style={{ left: `calc(${pct}% - 10px)`, width: 20, height: 20 }}>
          <span className="text-[9px] text-slate-500">↔</span>
        </div>
        <span className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded text-[8px] font-bold text-white"
          style={{ backgroundColor: 'rgba(15,23,42,.6)' }}>BEFORE</span>
        <span className="absolute right-1 bottom-1 px-1.5 py-0.5 rounded text-[8px] font-bold text-white"
          style={{ backgroundColor: 'rgba(15,23,42,.6)' }}>AFTER</span>
      </div>
    </Frame>
  );
}

// ─── Split-flap board ────────────────────────────────────────────────────────

const FLAP_ALPHABET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-/·';

/**
 * One character that flips from whatever it was to whatever it should be.
 *
 * The flip is not decoration: it is the mechanism that makes your eye go to
 * the line that CHANGED, on a board that is otherwise still. Each cell steps
 * through the alphabet rather than cutting, which is what an airport board
 * does and why the movement reads as a machine rather than as a glitch.
 */
function Flap({ ch, size }: { ch: string; size: number }) {
  const target = ch.toUpperCase();
  const idx = Math.max(0, FLAP_ALPHABET.indexOf(target));
  const [shown, setShown] = useState(idx);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (shown === idx) return;
    let cur = shown;
    const step = () => {
      cur = (cur + 1) % FLAP_ALPHABET.length;
      setShown(cur);
      if (cur !== idx) raf.current = window.setTimeout(step, 34) as unknown as number;
    };
    raf.current = window.setTimeout(step, 34) as unknown as number;
    return () => { if (raf.current) clearTimeout(raf.current); };
  }, [idx]);

  return (
    <span
      className="inline-flex items-center justify-center font-black tabular-nums rounded-[2px]"
      style={{
        width: size * 0.62, height: size, fontSize: size * 0.68, lineHeight: 1,
        backgroundColor: '#111827', color: '#f8fafc',
        // The seam across the middle is what makes it read as a flap rather
        // than as a dark box with a letter in it.
        backgroundImage: 'linear-gradient(#111827 49.5%, #0b1220 49.5%, #0b1220 50.5%, #111827 50.5%)',
      }}
    >
      {FLAP_ALPHABET[shown]}
    </span>
  );
}

export function SplitFlap({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  useTick(true, 30_000);
  const data = d(el);
  const size = Number(data.size ?? 22);
  const source = String(data.source ?? 'text');

  const line = useMemo(() => {
    const live = c.jobs.filter(isCountableApartment);
    const open = c.assignments.filter(a => !a.completedAt
      && live.some(j => j.id === a.apartmentId));
    const todayIso = new Date().toISOString().slice(0, 10);
    switch (source) {
      case 'openTasks': return `OPEN ${open.length}`;
      case 'overdue': return `LATE ${open.filter(a => a.dueDate && a.dueDate < todayIso).length}`;
      case 'jobs': return `JOBS ${live.length}`;
      case 'dueToday': return `TODAY ${open.filter(a => a.dueDate === todayIso).length}`;
      default: return String(data.text ?? 'TZVIAIR');
    }
  }, [source, data.text, c.jobs, c.assignments]);

  const chars = line.slice(0, 24).split('');

  return (
    <Frame title={data.title || 'Split-flap'} icon={Rows3}>
      <div className="h-full flex items-center justify-center flex-wrap gap-[2px] overflow-hidden">
        {chars.map((ch, i) => <Flap key={i} ch={ch} size={size} />)}
      </div>
    </Frame>
  );
}

// ─── Crew race ───────────────────────────────────────────────────────────────

/**
 * Everybody's week as a lane, with a van driving down it.
 *
 * The contractor-load widget already says who is carrying what — this says who
 * is CLEARING it, which is the number people actually compete over. Counted
 * over a rolling window so it resets on its own and last month's hero does not
 * sit at the finish line forever.
 */
export function CrewRace({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  useTick(true, 60_000);
  const data = d(el);
  const days = Number(data.days ?? 7);
  const target = Number(data.target ?? 0);
  const since = Date.now() - days * 86_400_000;

  const live = new Set(c.jobs.filter(isCountableApartment).map(j => j.id));
  const rows = c.contractors.filter(x => x.active).map(x => ({
    x,
    done: c.assignments.filter(a =>
      a.contractorId === x.id
      && a.completedAt
      && live.has(a.apartmentId)
      && new Date(a.completedAt).getTime() >= since).length,
  })).sort((a, b) => b.done - a.done);

  // Without an explicit target the leader IS the finish line, so somebody is
  // always at the end of the track and the picture never looks empty.
  const top = Math.max(1, target || Math.max(1, ...rows.map(r => r.done)));

  return (
    <Frame title={data.title || `Race · last ${days} days`} icon={Trophy} tone="#d97706">
      <div className="h-full overflow-y-auto pr-1 flex flex-col gap-1.5">
        {rows.length === 0 && <span className="text-[10px] text-gray-400">No contractors yet.</span>}
        {rows.map(({ x, done }, i) => {
          const pct = Math.min(100, (done / top) * 100);
          const col = personColor(x.name, x.color);
          return (
            <div key={x.id} className="min-w-0">
              <div className="flex items-center gap-1 mb-[1px]">
                <span className="text-[8px] font-black tabular-nums w-3 flex-shrink-0"
                  style={{ color: i === 0 ? '#d97706' : '#cbd5e1' }}>{i + 1}</span>
                <span className="text-[9.5px] font-semibold text-slate-600 flex-1 truncate">{x.name}</span>
                <span className="text-[9.5px] font-black tabular-nums text-slate-700">{done}</span>
              </div>
              <div className="relative h-3 rounded-full bg-slate-100">
                {/* The finish line, always at the right-hand end. */}
                <div className="absolute inset-y-0 right-0 w-[3px] rounded-r-full"
                  style={{ backgroundImage: 'repeating-linear-gradient(45deg,#334155 0 3px,#e2e8f0 3px 6px)' }} />
                <div className="absolute top-1/2 -translate-y-1/2 transition-all duration-700"
                  style={{ left: `calc(${pct}% - 9px)` }}>
                  <span style={{ fontSize: 11, filter: i === 0 ? 'none' : 'grayscale(.4)' }}>🚐</span>
                </div>
                <div className="absolute inset-y-0 left-0 rounded-full opacity-25 transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: col }} />
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}
