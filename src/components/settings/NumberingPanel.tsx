import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import {
  LayoutBuilding, NumberingOptions, applyNumbering, isDuplexUpper,
} from '../../data/projectLayout';

/**
 * Auto-numbering, with the result shown before it happens.
 *
 * The old version offered one fixed scheme and a one-line summary of what would
 * change, which is not enough to trust a bulk rewrite of every number in a
 * building. This shows the whole building before and after, side by side, with
 * the numbers that would change picked out — and lets you turn the dials until
 * the "after" is the one you want.
 *
 * Nothing is written until Apply. Hand-typed numbers are pinned and stay pinned
 * through every scheme, which is what makes it safe to experiment.
 */
export function NumberingPanel({ building, onApply, onClose }: {
  building: LayoutBuilding;
  onApply: (next: LayoutBuilding) => void;
  onClose: () => void;
}) {
  const [opts, setOpts] = useState<NumberingOptions>({
    start: 1, direction: 'ltr', continueAcrossFloors: true,
  });
  /** Per-floor mode adds the floor number in front: floor 7 → 701, 702, … */
  const [byFloor, setByFloor] = useState(false);
  const [floorStep, setFloorStep] = useState(100);
  const [respectPins, setRespectPins] = useState(true);

  const after = useMemo(() => {
    const src: LayoutBuilding = structuredClone(building);
    if (!respectPins) src.floors.forEach(f => f.slots.forEach(s => { delete s.pinned; }));

    if (!byFloor) return applyNumbering(src, opts);

    // Floor-prefixed: each floor restarts, offset by the floor's own number.
    let out = structuredClone(src);
    out.floors = out.floors.map(floor => {
      const n = Number(floor.label);
      const base = Number.isFinite(n) ? n * floorStep : 0;
      let i = opts.start;
      const order = opts.direction === 'ltr'
        ? floor.slots.map((_, k) => k)
        : floor.slots.map((_, k) => floor.slots.length - 1 - k);
      const slots = [...floor.slots];
      for (const k of order) {
        const s = slots[k];
        if (s.kind !== 'apartment' || isDuplexUpper(s)) continue;
        if (respectPins && s.pinned) continue;
        slots[k] = { ...s, number: String(base + i++) };
      }
      return { ...floor, slots };
    });
    return out;
  }, [building, opts, byFloor, floorStep, respectPins]);

  const changed = useMemo(() => {
    let n = 0;
    building.floors.forEach((f, fi) => f.slots.forEach((s, si) => {
      const t = after.floors[fi]?.slots[si];
      if (s.kind === 'apartment' && t && s.number !== t.number) n++;
    }));
    return n;
  }, [building, after]);

  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    after.floors.forEach(f => f.slots.forEach(s => {
      if (s.kind !== 'apartment' || !s.number || isDuplexUpper(s)) return;
      seen.set(s.number, (seen.get(s.number) ?? 0) + 1);
    }));
    return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  }, [after]);

  const Toggle = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors"
      style={on ? { backgroundColor: '#1e3a5f', color: '#fff' } : { backgroundColor: '#f1f5f9', color: '#64748b' }}>
      {children}
    </button>
  );

  /** One building drawn small, with changed numbers highlighted. */
  const Mini = ({ b, compareTo }: { b: LayoutBuilding; compareTo?: LayoutBuilding }) => (
    <div className="flex flex-col gap-[3px]">
      {b.floors.map((floor, fi) => (
        <div key={fi} className="flex items-center gap-1.5">
          <span className="w-7 flex-none text-right text-[9px] font-bold text-gray-400 tabular-nums">
            {floor.label}
          </span>
          <div className="flex gap-[3px]">
            {floor.slots.map((s, si) => {
              const other = compareTo?.floors[fi]?.slots[si];
              const diff = !!other && s.kind === 'apartment' && s.number !== other.number;
              const upper = isDuplexUpper(s);
              return (
                <span key={si}
                  className="w-8 h-5 rounded-[3px] flex items-center justify-center text-[9px] font-bold tabular-nums"
                  style={{
                    backgroundColor: s.kind !== 'apartment' ? 'transparent'
                      : diff ? '#dcfce7' : upper ? '#fbeade' : '#f1f5f9',
                    border: s.kind !== 'apartment'
                      ? '1px dashed #cbd5e1'
                      : `1px solid ${diff ? '#4ade80' : upper ? '#e0b394' : '#e2e8f0'}`,
                    color: diff ? '#166534' : upper ? '#b3541e' : '#475569',
                  }}>
                  {s.kind === 'apartment' && !upper ? (s.number ?? '–') : ''}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[80]" onClick={onClose} />
      <div className="fixed z-[90] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                 width: 'min(940px, 95vw)', height: 'min(760px, 92vh)' }}>
        <div className="flex items-center gap-3 px-4 py-3 bg-[#1e3a5f] text-white flex-shrink-0">
          <span className="font-bold text-sm">Numbering · {building.name}</span>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X size={17} /></button>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-end gap-4 flex-shrink-0">
          <div>
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Scheme</div>
            <div className="flex gap-1.5">
              <Toggle on={!byFloor} onClick={() => setByFloor(false)}>Straight run</Toggle>
              <Toggle on={byFloor} onClick={() => setByFloor(true)}>By floor</Toggle>
            </div>
          </div>

          {byFloor ? (
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Floor prefix</div>
              <div className="flex gap-1.5">
                {[10, 100, 1000].map(v => (
                  <Toggle key={v} on={floorStep === v} onClick={() => setFloorStep(v)}>
                    {v === 10 ? '7 → 71' : v === 100 ? '7 → 701' : '7 → 7001'}
                  </Toggle>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Start at</div>
                <input type="number" value={opts.start}
                  onChange={e => setOpts(o => ({ ...o, start: Number(e.target.value) || 1 }))}
                  className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums" />
              </div>
              <div>
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Across floors</div>
                <div className="flex gap-1.5">
                  <Toggle on={opts.continueAcrossFloors} onClick={() => setOpts(o => ({ ...o, continueAcrossFloors: true }))}>
                    Keep counting
                  </Toggle>
                  <Toggle on={!opts.continueAcrossFloors} onClick={() => setOpts(o => ({ ...o, continueAcrossFloors: false }))}>
                    Restart each floor
                  </Toggle>
                </div>
              </div>
            </>
          )}

          <div>
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Direction</div>
            <div className="flex gap-1.5">
              <Toggle on={opts.direction === 'ltr'} onClick={() => setOpts(o => ({ ...o, direction: 'ltr' }))}>
                Left → right
              </Toggle>
              <Toggle on={opts.direction === 'rtl'} onClick={() => setOpts(o => ({ ...o, direction: 'rtl' }))}>
                Right → left
              </Toggle>
            </div>
          </div>

          <div>
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Typed numbers</div>
            <div className="flex gap-1.5">
              <Toggle on={respectPins} onClick={() => setRespectPins(true)}>Leave alone</Toggle>
              <Toggle on={!respectPins} onClick={() => setRespectPins(false)}>Overwrite too</Toggle>
            </div>
          </div>
        </div>

        {/* Before / after */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <div className="flex items-start gap-6">
            <div>
              <div className="text-[10px] font-extrabold text-gray-400 tracking-wide mb-2">NOW</div>
              <Mini b={building} />
            </div>
            <div className="pt-8 text-gray-300"><ArrowRight size={20} /></div>
            <div>
              <div className="text-[10px] font-extrabold text-gray-400 tracking-wide mb-2">
                AFTER · <span className="text-emerald-600">{changed} change{changed === 1 ? '' : 's'}</span>
              </div>
              <Mini b={after} compareTo={building} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3 flex-shrink-0 flex-wrap">
          {duplicates.length > 0 ? (
            <span className="text-[11.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Would repeat: {duplicates.slice(0, 6).join(', ')}{duplicates.length > 6 ? '…' : ''}
            </span>
          ) : (
            <span className="text-[11.5px] text-gray-400">
              Every number unique. Nothing is written until you apply.
            </span>
          )}
          <span className="flex-1" />
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onApply(after)}
            disabled={changed === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
            <Check size={15} /> Apply {changed} change{changed === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </>
  );
}
