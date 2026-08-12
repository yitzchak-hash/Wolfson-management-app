import React, { useMemo, useState } from 'react';
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
 */
export function TapInBoard({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  // The lit tiles are a clock reading, so the board has to keep up on its own.
  useTick(true, 30_000);
  const data = d(el);
  const employees = useStore(s => s.employees);
  const punches = useStore(s => s.timePunches);
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

  const tap = (id: string, inNow: boolean) => {
    if (c.readOnly) return;
    const said = punchClock(id, inNow ? 'out' : 'in', 'board');
    setFlash({ id, text: said });
    // Long enough to read a sentence, short enough that the next person is not
    // waiting for the panel. A tap is not a dialogue.
    window.setTimeout(() => setFlash(f => (f?.id === id ? null : f)), 4000);
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
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 grid gap-1.5 content-start"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {rows.map(({ e, inNow, since }) => {
            const col = personColor(e.name, e.color);
            const saying = flash?.id === e.id;
            return (
              <button
                key={e.id}
                data-no-drag data-el-action
                onClick={() => tap(e.id, inNow)}
                disabled={c.readOnly}
                title={inNow ? `${e.name} — tap to clock out` : `${e.name} — tap to clock in`}
                className="relative rounded-xl px-2 py-2 text-left transition-all active:scale-95
                           disabled:active:scale-100 overflow-hidden"
                style={{
                  // A tile that is on is FILLED, not merely outlined. From five
                  // metres down a corridor an outline is invisible and the
                  // board stops answering the question it exists for.
                  backgroundColor: inNow ? col : 'rgba(148,163,184,.12)',
                  color: inNow ? '#fff' : '#334155',
                  boxShadow: inNow ? `0 2px 10px ${col}44` : 'none',
                  minHeight: 46,
                }}
              >
                <span className="block text-[12px] font-black leading-tight truncate">{e.name}</span>
                <span className="block text-[8.5px] leading-tight truncate"
                  style={{ opacity: inNow ? 0.85 : 0.55 }}>
                  {inNow && since ? `in since ${hhmm(since)}` : (e.role || 'tap to clock in')}
                </span>
                <span className="absolute top-1.5 right-1.5" style={{ opacity: inNow ? 0.9 : 0.35 }}>
                  {inNow ? <LogOut size={11} /> : <LogIn size={11} />}
                </span>
                {saying && (
                  <span className="absolute inset-0 flex items-center justify-center px-1 text-center
                                   text-[8.5px] font-bold leading-tight"
                    style={{ backgroundColor: 'rgba(15,23,42,.88)', color: '#fff' }}>
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
