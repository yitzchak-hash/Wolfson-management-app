import React, { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { WIDGETS, CATEGORY_LABEL, WidgetCategory, WidgetDef } from '../../data/widgets';

/**
 * Browse and place widgets.
 *
 * Grouped rather than one long grid, because the groups answer a real question:
 * "will this stay correct on its own, or do I have to keep it up to date?"
 * Live widgets read the actual data; planning ones hold their own. That
 * distinction is the first thing anyone needs to know before placing one.
 */
export function WidgetStore({ onPick, onClose }: {
  onPick: (def: WidgetDef) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<WidgetCategory | 'all'>('all');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return WIDGETS.filter(w =>
      (cat === 'all' || w.category === cat)
      && (!needle || w.name.toLowerCase().includes(needle) || w.blurb.toLowerCase().includes(needle)));
  }, [q, cat]);

  const groups = (['live', 'plan', 'ref', 'visual'] as WidgetCategory[])
    .map(c => ({ c, items: shown.filter(w => w.category === c) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[80] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(820px, 94vw)', height: 'min(660px, 88vh)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 bg-[#1e3a5f] text-white flex-shrink-0">
          <span className="font-bold text-sm">Widget store</span>
          <span className="text-[11px] text-white/60">{WIDGETS.length} to choose from</span>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X size={17} /></button>
        </div>

        <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 flex-shrink-0 flex-wrap">
          <Search size={14} className="text-gray-400" />
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search widgets…"
            className="flex-1 min-w-[140px] text-sm outline-none bg-transparent"
          />
          {(['all', 'live', 'plan', 'ref', 'visual'] as const).map(c => (
            <button key={c} onClick={() => setCat(c)}
              className="text-[10.5px] font-bold px-2.5 py-1 rounded-full transition-colors"
              style={cat === c
                ? { backgroundColor: '#1e3a5f', color: '#fff' }
                : { backgroundColor: '#f1f5f9', color: '#64748b' }}>
              {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {groups.length === 0 && (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">Nothing matches that.</div>
          )}
          {groups.map(({ c, items }) => (
            <div key={c} className="mb-5">
              <div className="text-[10px] font-extrabold text-gray-400 tracking-wide mb-2">
                {CATEGORY_LABEL[c].toUpperCase()}
                {c === 'live' && <span className="ml-2 font-medium normal-case text-gray-300">keeps itself up to date</span>}
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))' }}>
                {items.map(w => {
                  const Icon = w.icon;
                  return (
                    <button
                      key={w.id}
                      onClick={() => onPick(w)}
                      className="text-left rounded-xl border border-gray-200 p-3 hover:border-[#4aa8d8] hover:bg-sky-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: '#f1f5f9', color: '#1e3a5f' }}>
                          <Icon size={15} />
                        </span>
                        <span className="font-bold text-[12.5px] text-gray-900">{w.name}</span>
                      </div>
                      <p className="text-[10.5px] text-gray-500 leading-snug">{w.blurb}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 flex-shrink-0">
          Widgets move, resize, colour and hide from the TV exactly like notes and boxes do.
        </div>
      </div>
    </>
  );
}
