import React, { useMemo, useState } from 'react';
import { GripVertical, Eye, EyeOff, X, Plus, RotateCcw, Search } from 'lucide-react';
import { useStore } from '../../data/store';
import { ToolbarSetup } from '../../types';
import { TOOL_LABELS } from '../board/BoardToolbar';
import { WIDGETS } from '../../data/widgets';

/**
 * What sits on the board's toolbar.
 *
 * The rail was a fixed list in code, which is fine until you look at who is
 * using it: an office that never draws still gave up two slots to a pen and a
 * highlighter, and the widget somebody places twenty times a day was three
 * clicks away inside the store. Order, hiding and promoting a widget onto the
 * rail are all decisions the office should be making, not the code.
 *
 * Per workspace, because a job board and a building project want different
 * things to hand.
 */
const ALL_TOOLS = ['select', 'pan', 'job', 'note', 'box', 'title', 'pen', 'highlighter', 'voice', 'export'];

export function ToolbarEditor({ onToast }: { onToast: (m: string, t?: 'success' | 'error') => void }) {
  const { boardSettings, setBoardSetting, currentProjectId, projects } = useStore();
  const setup: ToolbarSetup = boardSettings[currentProjectId]?.toolbar ?? {};
  const workspace = projects.find(p => p.id === currentProjectId)?.name ?? 'this workspace';

  const [dragId, setDragId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const order = useMemo(() => {
    const chosen = setup.tools?.filter(t => ALL_TOOLS.includes(t)) ?? [];
    return [...chosen, ...ALL_TOOLS.filter(t => !chosen.includes(t))];
  }, [setup.tools]);

  const hidden = new Set(setup.hidden ?? []);
  const railWidgets = setup.widgets ?? [];

  function write(next: Partial<ToolbarSetup>) {
    setBoardSetting('toolbar', { ...setup, ...next });
  }

  function move(from: string, to: string) {
    if (from === to) return;
    const next = order.filter(t => t !== from);
    next.splice(next.indexOf(to), 0, from);
    write({ tools: next });
  }

  const storeMatches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return WIDGETS
      .filter(w => !railWidgets.includes(w.id))
      .filter(w => !needle || w.name.toLowerCase().includes(needle) || w.blurb.toLowerCase().includes(needle))
      .slice(0, needle ? 12 : 6);
  }, [q, railWidgets]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-sm font-semibold text-gray-700">Board toolbar — {workspace}</h3>
        <span className="flex-1" />
        {(setup.tools || setup.hidden?.length || setup.widgets?.length) && (
          <button
            onClick={() => { write({ tools: undefined, hidden: [], widgets: [] }); onToast('Toolbar back to how it ships'); }}
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-700">
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Drag to reorder. The eye hides a tool without losing your order. Anything
        from the widget store can be promoted onto the rail so it is one click
        instead of three.
      </p>

      {/* One column on a phone. Two 1fr columns of a 390px screen give each
          side ~148px, which is narrower than the widget names that go in it —
          every description in the store list was cut to three words. */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {/* ── the rail ── */}
        <div>
          <div className="text-[10px] font-extrabold tracking-wide text-gray-400 mb-1.5">ON THE RAIL</div>
          <div className="space-y-1">
            {order.map(id => {
              const off = hidden.has(id);
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDragId(id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (dragId) move(dragId, id); setDragId(null); }}
                  onDragEnd={() => setDragId(null)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors"
                  style={{
                    borderColor: dragId === id ? '#4aa8d8' : '#e2e8f0',
                    backgroundColor: off ? '#f8fafc' : '#fff',
                    opacity: off ? 0.55 : 1,
                    cursor: 'grab',
                  }}
                >
                  <GripVertical size={13} className="text-gray-300 flex-shrink-0" />
                  <span className="text-[12.5px] font-medium text-gray-700 flex-1 truncate">
                    {TOOL_LABELS[id] ?? id}
                  </span>
                  <button
                    onClick={() => write({
                      hidden: off ? (setup.hidden ?? []).filter(h => h !== id) : [...(setup.hidden ?? []), id],
                    })}
                    title={off ? 'Show it' : 'Hide it'}
                    className="p-2.5 sm:p-1 rounded text-gray-400 hover:text-gray-700"
                  >
                    {off ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              );
            })}

            {railWidgets.map(wid => {
              const w = WIDGETS.find(x => x.id === wid);
              if (!w) return null;
              const WIcon = w.icon;
              return (
                <div key={wid}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg border"
                  style={{ borderColor: '#dbeafe', backgroundColor: '#f8fbfe' }}>
                  <WIcon size={13} />
                  <span className="text-[12.5px] font-medium text-gray-700 flex-1 truncate">{w.name}</span>
                  <span className="text-[9px] font-bold px-1.5 rounded-full"
                    style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>widget</span>
                  <button
                    onClick={() => write({ widgets: railWidgets.filter(x => x !== wid) })}
                    title="Take it off the rail"
                    className="p-1 rounded text-gray-400 hover:text-red-500"><X size={12} /></button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── the store ── */}
        <div>
          <div className="text-[10px] font-extrabold tracking-wide text-gray-400 mb-1.5">ADD FROM THE STORE</div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-200 mb-1.5">
            <Search size={12} className="text-gray-400" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search widgets…"
              className="flex-1 min-w-0 text-[12px] outline-none bg-transparent"
            />
          </div>
          <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
            {storeMatches.map(w => {
              const WIcon = w.icon;
              return (
                <button
                  key={w.id}
                  onClick={() => {
                    write({ widgets: [...railWidgets, w.id] });
                    onToast(`${w.name} added to the toolbar`);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 hover:border-[#4aa8d8] text-left transition-colors"
                >
                  <WIcon size={13} className="text-[#1e3a5f] flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-gray-700 truncate">{w.name}</span>
                    <span className="block text-[10px] text-gray-400 truncate">{w.blurb}</span>
                  </span>
                  <Plus size={12} className="text-gray-300 flex-shrink-0" />
                </button>
              );
            })}
            {storeMatches.length === 0 && (
              <p className="text-[11.5px] text-gray-400 px-1 py-2">
                {q.trim() ? 'Nothing matches that.' : 'Everything is already on the rail.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
