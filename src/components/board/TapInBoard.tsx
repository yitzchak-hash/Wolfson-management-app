import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Fingerprint, LogIn } from 'lucide-react';
import { CanvasElement, personColor } from '../../types';
import { Frame, d, useTick, WidgetCtx } from '../../data/widgets';
import { useStore } from '../../data/store';
import { isClockedIn, clockedInSince, hhmm, dayOf, niceDay } from '../../data/timeClock';

/**
 * The tap-in board.
 *
 * Made for a thumb on a wall panel in a corridor, which is the only place it
 * will ever be used: big tiles, one tap, and no keyboard anywhere. Somebody
 * arriving presses their own name and that is the whole interaction.
 *
 * It doubles as the "who is here now" board — a tile that is green is somebody
 * currently on the clock, with the time they arrived under their name. That is
 * why a separate who's-here widget was not worth building: the answer is
 * already on the thing people tap.
 *
 * Two rules paid for:
 * - **The wall must be tappable.** The TV renders every widget `readOnly`
 *   (the wall is read-only by design), and honouring that here made the one
 *   widget BUILT for the wall panel dead on it — "the tap-in widget isn't
 *   working". A punch is not a board edit: it goes to the global time clock,
 *   not the board, so the guard is `sampleMode` (the shelf's canned people),
 *   never `c.readOnly`.
 * - **Tiles FILL the box in even rows.** They carried a fixed 46px height
 *   under WidgetSurface's scale, so changing "tiles across" or resizing the
 *   node left a band of dead space and rows that stopped lining up with the
 *   box. The grid is measured (damped, the WorldClocks rule) and the rows
 *   share the height exactly, with the type sized from the tile.
 */
export function TapInBoard({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  // The lit tiles are a clock reading, so the board has to keep up on its own.
  useTick(true, 30_000);
  const data = d(el);
  // The store on a real board; the shelf hands over a sample so the card shows
  // a board with people on it rather than its own empty state.
  const storeEmployees = useStore(s => s.employees);
  const storePunches = useStore(s => s.timePunches);
  const sampleMode = !!c.employees?.length;
  const employees = sampleMode ? c.employees! : storeEmployees;
  const punches = sampleMode ? (c.punches ?? []) : storePunches;
  const punchClock = useStore(s => s.punchClock);
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null);

  const rows = useMemo(() => employees
    .filter(e => e.active)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name))
    .map(e => ({
      e,
      inNow: isClockedIn(punches, e.id),
      since: clockedInSince(punches, e.id),
    })), [employees, punches]);

  const here = rows.filter(r => r.inNow).length;
  // Never more columns than people — two workers on a three-across grid
  // squeezed both into narrow tiles beside a permanently empty cell.
  const cols = Math.max(1, Math.min(6, Number(data.cols ?? 3), rows.length || 1));

  // The box the tiles have to fill, measured off the grid itself. Damped —
  // writing state for a sub-pixel resize echo is the feedback loop that made
  // the world clocks blink on the TV.
  const gridRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const read = () => {
      const w = node.clientWidth, h = node.clientHeight;
      setFit(prev => (Math.abs(prev.h - h) > 2 || Math.abs(prev.w - w) > 8) ? { w, h } : prev);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, [rows.length]);

  const GAP = 6;
  const rowCount = Math.max(1, Math.ceil(rows.length / cols));
  // Every row an equal share of the height, floored where a crowd would make
  // tiles untappable — past the floor the grid scrolls instead of shrinking.
  const share = fit.h > 0 ? (fit.h - (rowCount - 1) * GAP) / rowCount : 46;
  const tileH = Math.max(44, share);
  /**
   * The type follows the SMALLER of the tile's two dimensions. Height alone
   * decided it before, so two people on a tall board got one enormous row
   * whose 37px names truncated to a single letter — a dot and a sliver where
   * a name should be. A narrow tile keeps readable type however tall it is.
   */
  const tileW = fit.w > 0 ? (fit.w - (cols - 1) * GAP) / cols : 110;
  const f = Math.max(1, Math.min(3, Math.min(tileH / 46, tileW / 110)));

  const tap = (id: string, inNow: boolean) => {
    // Only the shelf's sample board is inert. The wall passes readOnly — and
    // must still take punches, or the widget is dead where it was built to live.
    if (sampleMode) return;
    const said = punchClock(id, inNow ? 'out' : 'in', 'board');
    setFlash({ id, text: said });
    // Long enough to read a sentence, short enough that the next person is not
    // waiting for the panel. A tap is not a dialogue.
    window.setTimeout(() => setFlash(f2 => (f2?.id === id ? null : f2)), 4000);
  };

  if (rows.length === 0) {
    return (
      <Frame title={data.title || 'Tap in'} icon={Fingerprint}>
        <span className="text-[10px] text-gray-400">
          Nobody on the list yet — add your people in App settings, under Time clock.
        </span>
      </Frame>
    );
  }

  return (
    <Frame title={`${data.title || 'Tap in'} · ${here} here`} icon={Fingerprint}
      tone={here > 0 ? '#1e3a5f' : undefined}>
      <div className="h-full flex flex-col min-h-0">
        <div ref={gridRef}
          className="flex-1 min-h-0 overflow-y-auto grid content-start"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridAutoRows: `${tileH}px`,
            gap: GAP,
          }}>
          {rows.map(({ e, inNow, since }) => {
            const col = personColor(e.name, e.color);
            const saying = flash?.id === e.id;
            /** The date rides along whenever the shift is not today's. */
            const sinceLabel = since
              ? (dayOf(since) === dayOf(new Date())
                ? `in since ${hhmm(since)}`
                : `in since ${niceDay(dayOf(since))} ${hhmm(since)}`)
              : '';
            /**
             * The running COUNTER (the owner's ask): how long they have been
             * on the clock, as h:mm, kept current by the board's own 30s
             * tick. The arrival time stays beside it — "how long" and
             * "since when" answer different questions from the corridor.
             */
            const mins = since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000)) : 0;
            const counter = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
            return (
              // The WHOLE tile is the button — name, time, icon and every
              // pixel of colour around them press as one thing. Dressed in
              // the company's own navy and sky (the owner's "TzviAir colors,
              // look nicer") — the person's colour survives as the small dot
              // beside the name.
              <button
                key={e.id}
                data-no-drag data-el-action
                onClick={() => tap(e.id, inNow)}
                disabled={sampleMode}
                title={inNow ? `${e.name} — tap to clock out` : `${e.name} — tap to clock in`}
                className="relative rounded-xl text-left transition-all active:scale-95
                           disabled:active:scale-100 overflow-hidden flex flex-col justify-center"
                style={{
                  // A tile that is on is FILLED, not merely outlined. From five
                  // metres down a corridor an outline is invisible and the
                  // board stops answering the question it exists for.
                  // GREEN in, RED out — the owner's ruling (2026-09-01),
                  // superseding the navy-in / grey-out dress: the board reads
                  // as a traffic light, which is what a corridor glance wants.
                  background: inNow
                    ? 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)'
                    : 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
                  color: inNow ? '#fff' : '#7f1d1d',
                  border: inNow ? '1px solid #166534' : '1px solid #fca5a5',
                  boxShadow: inNow
                    ? '0 3px 12px rgba(22,101,52,.35), inset 0 1px 0 rgba(255,255,255,.15)'
                    : '0 1px 2px rgba(153,27,27,.08)',
                  padding: `${Math.round(6 * f)}px ${Math.round(9 * f)}px`,
                }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="rounded-full flex-shrink-0"
                    style={{
                      width: Math.round(7 * f), height: Math.round(7 * f),
                      backgroundColor: inNow ? '#bbf7d0' : col,
                      boxShadow: inNow ? '0 0 0 2px rgba(255,255,255,.3)' : 'none',
                    }} />
                  <span className="block font-black leading-tight truncate"
                    style={{ fontSize: Math.round(12.5 * f) }}>{e.name}</span>
                  {/* The counter — how long they have been in, ticking. */}
                  {inNow && (
                    <span data-tap-counter
                      className="ms-auto flex-shrink-0 rounded-full font-black tabular-nums"
                      style={{
                        fontSize: Math.max(9, 10 * f),
                        padding: `${Math.round(1 * f)}px ${Math.round(5 * f)}px`,
                        backgroundColor: 'rgba(255,255,255,.22)', color: '#f0fdf4',
                      }}>
                      {counter}
                    </span>
                  )}
                </span>
                <span className="block leading-tight truncate font-semibold"
                  style={{
                    color: inNow ? '#bbf7d0' : '#b91c1c',
                    fontSize: Math.max(8.5, 8.5 * f),
                    paddingInlineStart: Math.round(7 * f) + 6,
                  }}>
                  {inNow ? sinceLabel : (e.role || 'tap to clock in')}
                </span>
                {/* The corner glyph survives only on OUT tiles — on a green
                    tile the ticking counter sits where it sat, and two things
                    in one corner overlapped. The whole tile is the button
                    either way; the hover title says which way it will punch. */}
                {!inNow && (
                  <span className="absolute"
                    style={{ top: Math.round(5 * f), right: Math.round(5 * f), color: '#ef4444' }}>
                    <LogIn size={Math.round(11 * f)} />
                  </span>
                )}
                {saying && (
                  <span className="absolute inset-0 flex items-center justify-center px-1 text-center
                                   font-bold leading-tight"
                    style={{
                      backgroundColor: 'rgba(30,58,95,.92)', color: '#fff',
                      fontSize: Math.max(8.5, 8.5 * f),
                    }}>
                    {flash!.text}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Frame>
  );
}
