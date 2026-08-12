import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Disc3, Grid3x3, PartyPopper, Calculator } from 'lucide-react';
import { CanvasElement, isCountableApartment, personColor } from '../../types';
import { Frame, d, WidgetCtx } from '../../data/widgets';
import { listOf } from './TimeWidgets';

/**
 * The ones that are only there to make the board feel alive.
 *
 * A wall panel that only ever reports gets walked past. These cost nothing,
 * hold no data anybody depends on, and are the reason somebody stands in front
 * of the screen long enough to read the things that do matter.
 */

// ─── Streak flame ────────────────────────────────────────────────────────────

const isoOf = (t: number) => {
  const dt = new Date(t);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/**
 * How many days running somebody has closed something.
 *
 * Counted in LOCAL days, because the streak is about the office's day. Using
 * the UTC date would have broken the streak every evening after nine in
 * Israel, which is exactly when the last job of the day gets ticked off.
 */
export function StreakFlame({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const live = new Set(c.jobs.filter(isCountableApartment).map(j => j.id));

  const { streak, best, last } = useMemo(() => {
    const days = new Set<string>();
    for (const a of c.assignments) {
      if (!a.completedAt || !live.has(a.apartmentId)) continue;
      days.add(isoOf(new Date(a.completedAt).getTime()));
    }
    // Today not being finished yet must not read as a broken streak, so the
    // count is allowed to start from yesterday.
    const now = Date.now();
    let start = days.has(isoOf(now)) ? 0 : 1;
    let run = 0;
    for (let i = start; i < 400; i++) {
      if (!days.has(isoOf(now - i * 86_400_000))) break;
      run++;
    }
    let bestRun = 0, cur = 0;
    for (let i = 0; i < 400; i++) {
      if (days.has(isoOf(now - i * 86_400_000))) { cur++; bestRun = Math.max(bestRun, cur); }
      else cur = 0;
    }
    const recent = Array.from({ length: 14 }, (_, i) => days.has(isoOf(now - (13 - i) * 86_400_000)));
    return { streak: run, best: bestRun, last: recent };
  }, [c.assignments, c.jobs]);

  const hot = streak >= 5;
  return (
    <Frame title={data.title || 'Streak'} icon={Flame} tone={hot ? '#dc2626' : '#94a3b8'}>
      <div className="h-full flex items-center gap-2">
        <span
          style={{
            fontSize: 34, lineHeight: 1,
            // A cold streak is a grey flame, not a missing one — the widget
            // still has to say what it is when the number is nought.
            filter: streak === 0 ? 'grayscale(1) opacity(.35)' : 'none',
            animation: hot ? 'streakPulse 1.6s ease-in-out infinite' : undefined,
          }}
        >🔥</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span className="text-[24px] font-black tabular-nums leading-none text-slate-800">{streak}</span>
            <span className="text-[9px] text-gray-400">day{streak === 1 ? '' : 's'} running</span>
          </div>
          <div className="text-[8.5px] text-gray-400 mb-1">best {best}</div>
          <div className="flex gap-[2px]">
            {last.map((on, i) => (
              <span key={i} className="rounded-[1px]" style={{
                width: 5, height: 9, backgroundColor: on ? '#f97316' : '#e2e8f0',
              }} />
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ─── Spin the wheel ──────────────────────────────────────────────────────────

/**
 * A wheel of names, to settle who takes the job nobody wants.
 *
 * The result is deliberately NOT stored: it is a coin toss in the room, not a
 * decision the app made. Writing the winner into the record would turn a
 * three-second argument-settler into something people argue with.
 */
export function SpinWheel({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const names: string[] = listOf(
    data.names,
    c.contractors.filter(x => x.active).map(x => x.name).slice(0, 8),
  );

  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  const spin = () => {
    if (spinning || names.length < 2) return;
    setSpinning(true); setWinner(null);
    const turns = 4 + Math.random() * 3;
    const to = angle + turns * 360 + Math.random() * 360;
    setAngle(to);
    window.setTimeout(() => {
      // The pointer is at the top, so the winning slice is the one whose
      // range contains the angle measured BACKWARDS from there.
      const norm = ((-to % 360) + 360) % 360;
      setWinner(names[Math.floor((norm / 360) * names.length) % names.length]);
      setSpinning(false);
    }, 3200);
  };

  const slice = 360 / Math.max(1, names.length);
  const R = 46;

  return (
    <Frame title={data.title || 'Spin'} icon={Disc3} tone="#7c3aed">
      <div className="h-full flex items-center gap-2 min-h-0">
        <div className="relative h-full flex-shrink-0" style={{ aspectRatio: '1' }}>
          <svg viewBox="0 0 100 100" className="w-full h-full"
            style={{ transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 3.1s cubic-bezier(.15,.9,.2,1)' : 'none' }}>
            {names.map((n, i) => {
              const a0 = (i * slice - 90) * Math.PI / 180;
              const a1 = ((i + 1) * slice - 90) * Math.PI / 180;
              const x0 = 50 + R * Math.cos(a0), y0 = 50 + R * Math.sin(a0);
              const x1 = 50 + R * Math.cos(a1), y1 = 50 + R * Math.sin(a1);
              return (
                <path key={i}
                  d={`M 50 50 L ${x0} ${y0} A ${R} ${R} 0 ${slice > 180 ? 1 : 0} 1 ${x1} ${y1} Z`}
                  fill={personColor(n)} opacity={0.85} stroke="#fff" strokeWidth={0.6} />
              );
            })}
            <circle cx="50" cy="50" r="7" fill="#fff" stroke="#e2e8f0" />
          </svg>
          {/* The pointer sits outside the spinning group, or it would turn
              with the wheel and never point at anything. */}
          <span className="absolute left-1/2 -translate-x-1/2 -top-[1px] text-[10px]">▼</span>
        </div>
        <div className="flex-1 min-w-0">
          <button
            data-no-drag data-el-action
            onClick={spin}
            disabled={spinning || names.length < 2}
            className="w-full px-2 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: '#7c3aed' }}
          >
            {spinning ? 'spinning…' : 'Spin'}
          </button>
          <div className="mt-1.5 text-[13px] font-black text-slate-800 truncate min-h-[18px]">
            {winner ?? ''}
          </div>
          {names.length < 2 && (
            <div className="text-[8.5px] text-gray-400">Add some names in the settings.</div>
          )}
        </div>
      </div>
    </Frame>
  );
}

// ─── Bubble wrap ─────────────────────────────────────────────────────────────

/**
 * Bubble wrap. That is the whole feature.
 *
 * The popped state IS stored, because a sheet that resets whenever the board
 * re-renders is not bubble wrap, it is a flickering grid. It resets from its
 * own button when the sheet is used up.
 */
export function BubbleWrap({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const cols = Math.max(4, Math.min(20, Number(data.cols ?? 10)));
  const rows = Math.max(3, Math.min(20, Number(data.rows ?? 7)));
  const total = cols * rows;
  const popped: number[] = Array.isArray(data.popped) ? data.popped : [];
  const set = new Set(popped);

  const pop = (i: number) => {
    if (c.readOnly || set.has(i)) return;
    c.update({ data: { ...data, popped: [...popped, i] } });
  };

  return (
    <Frame title={data.title || 'Bubble wrap'} icon={Grid3x3}>
      <div className="h-full flex flex-col min-h-0">
        {/*
          Rows are declared as well as columns, and the sheet is clipped.

          With only the columns declared and the content centred, a sheet
          taller than its node overflowed EQUALLY in both directions — so the
          top row sat behind the widget's own title bar and could not be
          pressed at all. Nothing looked wrong; the bubbles were simply
          unreachable. Giving the grid explicit rows makes it fill the box
          instead of overflowing it, and each bubble stays round by taking the
          smaller of its cell's two dimensions.
        */}
        <div
          className="flex-1 min-h-0 grid gap-[2px] overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i} data-no-drag data-el-action
              onPointerEnter={e => { if (e.buttons === 1) pop(i); }}
              onPointerDown={() => pop(i)}
              className="rounded-full transition-transform"
              style={{
                aspectRatio: '1',
                width: '100%', maxWidth: '100%', maxHeight: '100%', margin: 'auto',
                background: set.has(i)
                  ? 'radial-gradient(circle at 50% 60%, #e2e8f0, #cbd5e1)'
                  : 'radial-gradient(circle at 35% 30%, #ffffff, #bfdbfe 55%, #93c5fd)',
                boxShadow: set.has(i) ? 'inset 0 1px 2px rgba(15,23,42,.25)' : '0 1px 2px rgba(15,23,42,.18)',
                transform: set.has(i) ? 'scale(.82)' : 'scale(1)',
              }}
            />
          ))}
        </div>
        {set.size >= total && !c.readOnly && (
          <button data-no-drag data-el-action
            onClick={() => c.update({ data: { ...data, popped: [] } })}
            className="mt-1 text-[9px] font-bold text-[#4aa8d8] flex-shrink-0">
            fresh sheet
          </button>
        )}
      </div>
    </Frame>
  );
}

// ─── Celebrate ───────────────────────────────────────────────────────────────

interface Bit { x: number; y: number; vx: number; vy: number; r: number; c: string; s: number }

/**
 * A button that throws confetti.
 *
 * Drawn on a canvas rather than as elements: a hundred absolutely positioned
 * divs animating at once on a wall panel is enough to make the whole board
 * stutter, and a celebration that drops frames celebrates nothing.
 */
export function Celebrate({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bits = useRef<Bit[]>([]);
  const raf = useRef<number>(0);

  const draw = () => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = 0;
    for (const b of bits.current) {
      b.vy += 0.16;
      b.x += b.vx; b.y += b.vy; b.r += b.s;
      if (b.y < cv.height + 20) alive++;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-3, -2, 6, 4);
      ctx.restore();
    }
    if (alive > 0) raf.current = requestAnimationFrame(draw);
    else { bits.current = []; ctx.clearRect(0, 0, cv.width, cv.height); }
  };

  const fire = () => {
    const cv = canvas.current;
    if (!cv) return;
    // Sized to its own box each time, so it still lands correctly after the
    // node has been resized.
    cv.width = cv.clientWidth; cv.height = cv.clientHeight;
    const colours = ['#f59e0b', '#dc2626', '#16a34a', '#4aa8d8', '#7c3aed', '#ec4899'];
    bits.current = Array.from({ length: 110 }, () => ({
      x: cv.width / 2, y: cv.height * 0.62,
      vx: (Math.random() - 0.5) * 9,
      vy: -4 - Math.random() * 7,
      r: Math.random() * Math.PI,
      s: (Math.random() - 0.5) * 0.4,
      c: colours[Math.floor(Math.random() * colours.length)],
    }));
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <Frame title={data.title || 'Celebrate'} icon={PartyPopper} tone="#ec4899">
      <div className="relative h-full flex items-center justify-center">
        <canvas ref={canvas} className="absolute inset-0 w-full h-full pointer-events-none" />
        <button
          data-no-drag data-el-action
          onClick={fire}
          className="px-3 py-2 rounded-xl text-[13px] font-black text-white shadow-sm active:scale-95 transition-transform"
          style={{ backgroundColor: '#ec4899' }}
        >
          {String(data.label ?? '🎉 Nice one')}
        </button>
      </div>
    </Frame>
  );
}

// ─── BTU ↔ horsepower ────────────────────────────────────────────────────────

/**
 * The two horsepowers, side by side, because they are not the same number.
 *
 * "One horse" means two different things in this trade and mixing them up is a
 * three-fold error. A mechanical horsepower is 2,544 BTU/hr — that is physics.
 * But every mini-split catalogue out of Asia sells a "1 HP" unit meaning about
 * 9,000 BTU/hr of cooling, which is three quarters of a ton and nothing to do
 * with the mechanical figure. A converter that silently picked one would be
 * wrong for half the people who used it, so both are always on screen and both
 * are labelled.
 */
const BTU_PER_MECH_HP = 2544.4336;
const BTU_PER_TRADE_HP = 9000;
const BTU_PER_TON = 12_000;
const BTU_PER_KW = 3412.142;

export function BtuHp({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const unit = String(data.unit ?? 'btu');
  const raw = String(data.value ?? '24000');
  const n = parseFloat(raw);

  // Everything goes through BTU/hr, so any box can be the one you type in.
  const btu = !Number.isFinite(n) ? null
    : unit === 'btu' ? n
    : unit === 'hpTrade' ? n * BTU_PER_TRADE_HP
    : unit === 'hpMech' ? n * BTU_PER_MECH_HP
    : unit === 'ton' ? n * BTU_PER_TON
    : n * BTU_PER_KW;

  // Two decimals under a hundred. One was not enough: 36,000 BTU/hr is 14.15
  // mechanical horsepower and printing "14.1" loses the half-tenth that tells
  // you which side of a nominal size you are on.
  const round = (x: number) => Math.abs(x) >= 1000 ? Math.round(x)
    : Math.abs(x) >= 100 ? Math.round(x * 10) / 10
    : Math.round(x * 100) / 100;

  const out: [string, string, number | null][] = [
    ['BTU/hr', 'cooling capacity', btu],
    ['HP (unit size)', '9,000 BTU/hr — catalogue horsepower', btu === null ? null : btu / BTU_PER_TRADE_HP],
    ['HP (mechanical)', '2,544 BTU/hr — the physics one', btu === null ? null : btu / BTU_PER_MECH_HP],
    ['Tons', '12,000 BTU/hr', btu === null ? null : btu / BTU_PER_TON],
    ['kW', 'thermal', btu === null ? null : btu / BTU_PER_KW],
  ];

  return (
    <Frame title={data.title || 'BTU and horsepower'} icon={Calculator} tone="#0ea5e9">
      <div className="h-full flex flex-col gap-1 min-h-0">
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            data-no-drag data-el-action readOnly={c.readOnly}
            value={raw}
            inputMode="decimal"
            onChange={e => c.update({ data: { ...data, value: e.target.value } })}
            className="w-[54%] text-[13px] font-black bg-slate-50 rounded px-1.5 py-1 outline-none tabular-nums"
          />
          <select
            data-no-drag data-el-action disabled={c.readOnly}
            value={unit}
            onChange={e => c.update({ data: { ...data, unit: e.target.value } })}
            className="flex-1 min-w-0 text-[9.5px] bg-slate-50 rounded px-1 py-1 outline-none"
          >
            <option value="btu">BTU/hr</option>
            <option value="hpTrade">HP (unit size)</option>
            <option value="hpMech">HP (mechanical)</option>
            <option value="ton">Tons</option>
            <option value="kw">kW</option>
          </select>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-[2px]">
          {out.filter(([label]) => label.toLowerCase() !== unitLabel(unit)).map(([label, hint, v]) => (
            <div key={label} className="flex items-baseline gap-1 min-w-0">
              <span className="text-[13px] font-black tabular-nums text-[#1e3a5f] w-[62px] flex-shrink-0 text-right">
                {v === null ? '—' : round(v).toLocaleString()}
              </span>
              <span className="text-[9px] font-semibold text-slate-600 flex-shrink-0">{label}</span>
              <span className="text-[8px] text-slate-300 truncate">{hint}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** The row matching what you typed is not worth repeating back to you. */
function unitLabel(unit: string): string {
  return unit === 'btu' ? 'btu/hr'
    : unit === 'hpTrade' ? 'hp (unit size)'
    : unit === 'hpMech' ? 'hp (mechanical)'
    : unit === 'ton' ? 'tons' : 'kw';
}
