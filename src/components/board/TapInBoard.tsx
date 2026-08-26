import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Fingerprint, LogIn, LogOut } from 'lucide-react';
import { CanvasElement, personColor } from '../../types';
import { Frame, d, useTick, WidgetCtx } from '../../data/widgets';
import { useStore } from '../../data/store';
import { isClockedIn, clockedInSince, hhmm } from '../../data/timeClock';

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
  const cols = Math.max(1, Math.min(6, Number(data.cols ?? 3)));

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
  const f = Math.max(1, Math.min(3, tileH / 46));

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
      tone={here > 0 ? '#16a34a' : undefined}>
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
            return (
              // The WHOLE tile is the button — name, time, icon and every
              // pixel of colour around them press as one thing.
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
                  backgroundColor: inNow ? col : 'rgba(148,163,184,.12)',
                  color: inNow ? '#fff' : '#334155',
                  boxShadow: inNow ? `0 2px 10px ${col}44` : 'none',
                  padding: `${Math.round(6 * f)}px ${Math.round(8 * f)}px`,
                }}
              >
                <span className="block font-black leading-tight truncate"
                  style={{ fontSize: Math.round(12 * f) }}>{e.name}</span>
                <span className="block leading-tight truncate"
                  style={{ opacity: inNow ? 0.85 : 0.55, fontSize: Math.max(8.5, 8.5 * f) }}>
                  {inNow && since ? `in since ${hhmm(since)}` : (e.role || 'tap to clock in')}
                </span>
                <span className="absolute"
                  style={{ top: Math.round(5 * f), right: Math.round(5 * f), opacity: inNow ? 0.9 : 0.35 }}>
                  {inNow ? <LogOut size={Math.round(11 * f)} /> : <LogIn size={Math.round(11 * f)} />}
                </span>
                {saying && (
                  <span className="absolute inset-0 flex items-center justify-center px-1 text-center
                                   font-bold leading-tight"
                    style={{
                      backgroundColor: 'rgba(15,23,42,.88)', color: '#fff',
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
