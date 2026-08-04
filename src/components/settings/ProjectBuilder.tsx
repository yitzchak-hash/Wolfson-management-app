import React, { useMemo, useState } from 'react';
import { Copy, Check, Wand2, Plus, Trash2, ArrowLeftRight } from 'lucide-react';
import {
  LayoutBuilding, LayoutSlot, ProjectLayout, SlotKind,
  applyNumbering, proposeNumbering, findDuplicateNumbers, countUnits, generateGrid,
} from '../../data/projectLayout';
import { buildImportPrompt, parseLayoutJson, ParseResult } from '../../data/layoutImport';

type Tool = 'select' | 'apartment' | 'gap' | 'stairwell' | 'duplex' | 'erase';

const TOOL_LABEL: Record<Tool, string> = {
  select: 'Select', apartment: 'Apartment', gap: 'Gap',
  stairwell: 'Stairwell', duplex: 'Duplex', erase: 'Erase',
};

/**
 * Visual builder for a project's buildings.
 *
 * Everything here edits a LAYOUT, never apartment records directly. Records are
 * regenerated from the layout on save, matching by building + number, so stages,
 * tasks, photos and Drive links survive an edit — the identity is the record,
 * not the number printed on the tile.
 */
export function ProjectBuilder({
  initial, onSave, onToast,
}: {
  initial: ProjectLayout;
  onSave: (layout: ProjectLayout) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [layout, setLayout] = useState<ProjectLayout>(initial);
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<{ b: number; f: number; s: number } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [numberPreview, setNumberPreview] = useState<ReturnType<typeof proposeNumbering> | null>(null);
  const [numberTarget, setNumberTarget] = useState(0);

  const units = useMemo(() => countUnits(layout), [layout]);

  function edit(fn: (l: ProjectLayout) => ProjectLayout) { setLayout(l => fn(structuredClone(l))); }

  function applyTool(b: number, f: number, s: number) {
    if (tool === 'select') { setSel({ b, f, s }); return; }
    edit(l => {
      const slot = l.buildings[b].floors[f].slots[s];
      if (tool === 'erase') { l.buildings[b].floors[f].slots.splice(s, 1); return l; }
      if (tool === 'duplex') { slot.duplex = !slot.duplex; slot.kind = 'apartment'; return l; }
      slot.kind = tool as SlotKind;
      if (slot.kind !== 'apartment') { delete slot.number; delete slot.duplex; }
      return l;
    });
  }

  /** Move a slot within its floor, or to the floor above/below. */
  function moveSlot(b: number, f: number, s: number, dir: 'left' | 'right' | 'up' | 'down') {
    edit(l => {
      const floors = l.buildings[b].floors;
      const slots = floors[f].slots;
      if (dir === 'left' && s > 0) { [slots[s - 1], slots[s]] = [slots[s], slots[s - 1]]; setSel({ b, f, s: s - 1 }); }
      else if (dir === 'right' && s < slots.length - 1) { [slots[s + 1], slots[s]] = [slots[s], slots[s + 1]]; setSel({ b, f, s: s + 1 }); }
      else if (dir === 'up' && f > 0) {
        const [moved] = slots.splice(s, 1);
        floors[f - 1].slots.push(moved); setSel({ b, f: f - 1, s: floors[f - 1].slots.length - 1 });
      } else if (dir === 'down' && f < floors.length - 1) {
        const [moved] = slots.splice(s, 1);
        floors[f + 1].slots.push(moved); setSel({ b, f: f + 1, s: floors[f + 1].slots.length - 1 });
      }
      return l;
    });
  }

  const selSlot: LayoutSlot | null = sel
    ? layout.buildings[sel.b]?.floors[sel.f]?.slots[sel.s] ?? null : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 flex-wrap">
        {(Object.keys(TOOL_LABEL) as Tool[]).map(tk => (
          <button key={tk} onClick={() => setTool(tk)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors"
            style={tool === tk ? { backgroundColor: '#1e3a5f', color: '#fff' } : { color: '#64748b' }}>
            {TOOL_LABEL[tk]}
          </button>
        ))}
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#1e3a5f] border border-gray-200">
          <Wand2 size={12} /> AI import
        </button>
        <button
          onClick={() => edit(l => {
            l.buildings.push(generateGrid({
              id: `N${l.buildings.length + 1}`, name: `Building ${l.buildings.length + 1}`,
              displayOrder: l.buildings.length + 1, floors: 8, perFloor: 4,
            }));
            return l;
          })}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-gray-600 border border-gray-200">
          <Plus size={12} /> Building
        </button>
        <span className="ml-auto text-[11px] text-gray-400">{units} units</span>
        <button onClick={() => { onSave(layout); onToast('Layout saved'); }}
          className="px-3 py-1 rounded-lg bg-green-600 text-white text-[11px] font-bold">Save</button>
      </div>

      {/* Buildings — scrolls sideways once there are more than fit */}
      <div className="flex gap-3 overflow-x-auto p-3">
        {layout.buildings.map((b, bi) => {
          const dupes = findDuplicateNumbers(b);
          return (
            <div key={b.id} className="flex-none" style={{ width: 210 }}>
              <div className="flex items-center gap-1 mb-1">
                <input
                  value={b.name}
                  onChange={e => edit(l => { l.buildings[bi].name = e.target.value; return l; })}
                  className="flex-1 min-w-0 bg-[#1e3a5f] text-white text-center font-bold text-[11px] py-1.5 rounded-t-lg outline-none"
                />
                <button onClick={() => edit(l => { l.buildings.splice(bi, 1); return l; })}
                  className="p-1 text-gray-300 hover:text-red-500" title="Remove building">
                  <Trash2 size={12} />
                </button>
              </div>

              {dupes.length > 0 && (
                <div className="text-[9px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 mb-1">
                  Duplicate: {dupes.join(', ')}
                </div>
              )}

              <div className="border border-gray-200 rounded-b-lg p-1 bg-gray-50">
                {b.floors.map((floor, fi) => (
                  <div key={fi} className="flex gap-1 mb-1 items-stretch">
                    <input
                      value={floor.label}
                      onChange={e => edit(l => { l.buildings[bi].floors[fi].label = e.target.value; return l; })}
                      className="w-8 flex-none text-[9px] font-bold text-center text-gray-500 bg-white border border-gray-200 rounded outline-none"
                      title="Floor label"
                    />
                    <div className="flex-1 flex gap-1 min-w-0">
                      {floor.slots.map((slot, si) => {
                        const on = sel && sel.b === bi && sel.f === fi && sel.s === si;
                        const isApt = slot.kind === 'apartment';
                        return (
                          <button key={si} onClick={() => applyTool(bi, fi, si)}
                            className="flex-1 min-w-0 rounded text-[9.5px] font-bold transition-all"
                            style={{
                              height: slot.duplex ? 46 : 24,
                              backgroundColor: slot.kind === 'stairwell' ? '#e2e8f0' : slot.duplex ? '#dbeafe' : '#fff',
                              border: `1.5px ${isApt ? 'solid' : 'dashed'} ${on ? '#4aa8d8' : slot.duplex ? '#60a5fa' : '#e2e8f0'}`,
                              boxShadow: on ? '0 0 0 2px rgba(74,168,216,.25)' : undefined,
                              color: slot.duplex ? '#1e3a8a' : '#334155',
                            }}
                            title={slot.kind}
                          >
                            {slot.kind === 'stairwell' ? '⌷' : isApt ? (slot.number ?? '–') : ''}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => edit(l => { l.buildings[bi].floors[fi].slots.push({ kind: 'apartment' }); return l; })}
                        className="w-5 flex-none rounded text-gray-300 hover:text-gray-500 text-[11px]"
                        title="Add slot">+</button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => edit(l => { l.buildings[bi].floors.unshift({ label: '', slots: [{ kind: 'apartment' }] }); return l; })}
                    className="flex-1 text-[9px] font-bold text-gray-500 border border-dashed border-gray-300 rounded py-1">
                    + floor above
                  </button>
                  <button
                    onClick={() => edit(l => { l.buildings[bi].floors.push({ label: '', slots: [{ kind: 'apartment' }] }); return l; })}
                    className="flex-1 text-[9px] font-bold text-gray-500 border border-dashed border-gray-300 rounded py-1">
                    + below
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inspector */}
      {sel && selSlot && (
        <div className="border-t border-gray-100 p-3 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">Number</div>
            <input
              value={selSlot.number ?? ''}
              onChange={e => edit(l => {
                const s = l.buildings[sel.b].floors[sel.f].slots[sel.s];
                s.number = e.target.value || undefined;
                s.pinned = !!e.target.value;   // typed by hand = pinned
                return l;
              })}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm"
            />
          </div>
          <div>
            <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">Move</div>
            <div className="flex gap-1">
              {(['left', 'right', 'up', 'down'] as const).map(d => (
                <button key={d} onClick={() => moveSlot(sel.b, sel.f, sel.s, d)}
                  className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 text-xs font-bold">
                  {d === 'left' ? '←' : d === 'right' ? '→' : d === 'up' ? '↑' : '↓'}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 pb-1.5">
            <input type="checkbox" checked={!!selSlot.duplex}
              onChange={() => applyTool(sel.b, sel.f, sel.s)} className="rounded" />
            Duplex (spans the floor above)
          </label>
          {selSlot.pinned && (
            <span className="text-[10px] text-amber-600 font-bold pb-1.5">pinned — auto-numbering skips it</span>
          )}
        </div>
      )}

      {/* Auto-number, preview first */}
      <div className="border-t border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <select value={numberTarget} onChange={e => setNumberTarget(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs">
          {layout.buildings.map((b, i) => <option key={b.id} value={i}>{b.name}</option>)}
        </select>
        <button
          onClick={() => setNumberPreview(proposeNumbering(layout.buildings[numberTarget],
            { start: 1, direction: 'ltr', continueAcrossFloors: true }))}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#1e3a5f] border border-gray-200">
          <ArrowLeftRight size={12} /> Preview auto-numbering
        </button>
        {numberPreview && (
          <>
            <span className="text-[11px] text-gray-500">
              {numberPreview.length === 0 ? 'Nothing would change' : `${numberPreview.length} slots change`}
              {numberPreview.length > 0 && ` · ${numberPreview.slice(0, 4).map(c => `${c.from ?? '–'}→${c.to}`).join(', ')}${numberPreview.length > 4 ? '…' : ''}`}
            </span>
            {numberPreview.length > 0 && (
              <button
                onClick={() => {
                  edit(l => {
                    l.buildings[numberTarget] = applyNumbering(l.buildings[numberTarget],
                      { start: 1, direction: 'ltr', continueAcrossFloors: true });
                    return l;
                  });
                  setNumberPreview(null);
                  onToast('Numbering applied');
                }}
                className="px-2.5 py-1 rounded-lg bg-[#1e3a5f] text-white text-[11px] font-bold">Apply</button>
            )}
          </>
        )}
      </div>

      {/* AI import */}
      {showImport && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[80]" onClick={() => setShowImport(false)} />
          <div className="fixed z-[90] bg-white rounded-2xl shadow-2xl p-5 flex flex-col"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(620px,92vw)', maxHeight: '86vh' }}>
            <h3 className="font-bold text-gray-900 mb-1">Build from plans with AI</h3>
            <p className="text-xs text-gray-500 mb-3">
              Copy the prompt, paste it into ChatGPT or Claude together with your floor plans, then paste
              the JSON it returns back here.
            </p>

            <button
              onClick={() => {
                navigator.clipboard?.writeText(buildImportPrompt('this project'));
                setPromptCopied(true); setTimeout(() => setPromptCopied(false), 2000);
              }}
              className="flex items-center justify-center gap-2 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-bold mb-3">
              {promptCopied ? <Check size={14} /> : <Copy size={14} />} Copy the prompt
            </button>

            <textarea
              value={importText}
              onChange={e => { setImportText(e.target.value); setImportResult(null); }}
              placeholder="Paste the JSON here…"
              className="flex-1 min-h-[140px] border border-gray-200 rounded-lg p-2 text-xs font-mono resize-none"
            />

            {importResult && (
              <div className="mt-2 text-xs">
                {importResult.ok && importResult.summary && (
                  <div className="text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    {importResult.summary.buildings} buildings · {importResult.summary.floors} floors ·{' '}
                    {importResult.summary.units} units · {importResult.summary.duplexes} duplexes
                  </div>
                )}
                {importResult.errors.map((e, i) => (
                  <div key={i} className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-1">{e}</div>
                ))}
                {importResult.warnings.slice(0, 4).map((w, i) => (
                  <div key={i} className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-1">{w}</div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button onClick={() => setShowImport(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">Cancel</button>
              <button onClick={() => setImportResult(parseLayoutJson(importText))}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-bold text-[#1e3a5f]">Check it</button>
              {importResult?.ok && importResult.layout && (
                <button
                  onClick={() => {
                    setLayout(importResult.layout!);
                    setShowImport(false);
                    onToast('Imported into the builder — review and Save');
                  }}
                  className="ml-auto px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-bold">
                  Import into builder
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
