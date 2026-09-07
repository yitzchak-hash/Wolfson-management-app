/**
 * The settings windows for what B8 draws (pick 52 — double-click anything):
 * a lowered ceiling's drop (any number) and colour (any colour, pick 58),
 * its name, its numbers, Remove; a run's kind, its two ends, its length in
 * metres (pick 55), a duct's width, Remove.
 */
import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { DROPS, boxNumbers, dropLabel, type SketchShape } from '../../data/gvs';
import { PIPE_KINDS, pipeLength, type SketchPipe, type PipeKind } from '../../data/pipes';
import type { SketchItem } from '../../data/sketchItems';
import { useT } from '../../data/strings';

const NAVY = '#1e3a5f';

function Frame({ title, onClose, isRtl, children, onDelete, deleteWord, hook }: { title: string; onClose: () => void; isRtl: boolean; children: React.ReactNode; onDelete: () => void; deleteWord: string; hook: string }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[185] flex items-center justify-center p-3" style={{ backgroundColor: 'rgba(9,14,22,.5)' }} onClick={onClose} onPointerDown={e => e.stopPropagation()}>
      <div {...{ [hook]: '' }} className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto p-4" dir={isRtl ? 'rtl' : 'ltr'} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2"><h3 className="text-[14px] font-extrabold">{title}</h3><button onClick={onClose} aria-label={t.cancel} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X size={16} /></button></div>
        {children}
        <div className="flex justify-between items-center mt-3">
          <button data-settings-delete onClick={() => { onDelete(); onClose(); }} className="h-9 px-3 rounded-xl border border-red-200 text-red-600 text-[12.5px] font-bold flex items-center gap-1.5 hover:bg-red-50"><Trash2 size={14} /> {deleteWord}</button>
          <button onClick={onClose} className="h-9 px-4 rounded-xl text-white text-[12.5px] font-bold" style={{ backgroundColor: NAVY }}>{t.done}</button>
        </div>
      </div>
    </div>
  );
}
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0 text-[12.5px]"><span className="text-gray-500 min-w-[84px] shrink-0">{label}</span><span className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">{children}</span></div>
);

export function GvsSettings({ shape, mPerW, onChange, onDelete, onClose, isRtl }: { shape: SketchShape; mPerW: number; onChange: (patch: Partial<SketchShape>) => void; onDelete: () => void; onClose: () => void; isRtl: boolean }) {
  const t = useT();
  const [drop, setDrop] = useState(String(shape.drop));
  const n = boxNumbers(shape.pts, mPerW);
  const commitDrop = () => { const v = Number(drop); if (v > 0 && v !== shape.drop) onChange({ drop: v, color: DROPS.find(d => d.drop === v)?.color ?? shape.color }); };
  return (
    <Frame title={t.gvsSettings} onClose={onClose} isRtl={isRtl} onDelete={onDelete} deleteWord={t.deleteGvs} hook="data-gvs-settings">
      <div className="text-[12px] text-gray-500 mb-1" data-gvs-settings-numbers>{dropLabel(shape.drop)} · {t.gvsNumbers(n.m2.toFixed(2), n.runM.toFixed(2))}</div>
      <Row label={t.fieldDrop}>
        <input data-gvs-drop-input type="number" min={1} step={1} value={drop} onChange={e => setDrop(e.target.value)} onBlur={commitDrop} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="border rounded-md h-8 w-[76px] px-2 text-[12.5px] tabular-nums" />
        {DROPS.map(d => <button key={d.drop} data-gvs-drop-preset={d.drop} onClick={() => { setDrop(String(d.drop)); onChange({ drop: d.drop, color: d.color }); }} className="h-7 px-2 rounded-md text-[11px] font-extrabold text-white" style={{ backgroundColor: d.color, outline: shape.drop === d.drop ? `2px solid ${NAVY}` : 'none' }}>{dropLabel(d.drop)}</button>)}
      </Row>
      <Row label={t.fieldColor}>
        <input data-gvs-color type="color" value={shape.color} onChange={e => onChange({ color: e.target.value })} className="h-8 w-12 rounded-md border p-0.5" />
        <span className="text-[11px] text-gray-500 tabular-nums">{shape.color}</span>
      </Row>
      <Row label={t.fieldName}>
        <input data-gvs-name defaultValue={shape.name ?? ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (shape.name ?? '')) onChange({ name: v || undefined }); }} className="border rounded-md h-8 px-2 text-[12.5px] w-full" />
      </Row>
    </Frame>
  );
}

export function PipeSettings({ pipe, items, tags, mPerW, onChange, onDelete, onClose, isRtl }: { pipe: SketchPipe; items: SketchItem[]; tags: Map<string, string>; mPerW: number; onChange: (patch: Partial<SketchPipe>) => void; onDelete: () => void; onClose: () => void; isRtl: boolean }) {
  const t = useT();
  const endName = (id?: string) => { if (!id) return t.noEnd; const it = items.find(i => i.id === id); return it ? `${tags.get(it.id) ? tags.get(it.id) + ' · ' : ''}${it.model || it.name}` : t.noEnd; };
  return (
    <Frame title={t.pipeSettings} onClose={onClose} isRtl={isRtl} onDelete={onDelete} deleteWord={t.deletePipe} hook="data-pipe-settings">
      <Row label={t.fieldKind}>
        <select data-pipe-kind-select value={pipe.kind} onChange={e => onChange({ kind: e.target.value as PipeKind })} className="border rounded-md h-8 px-1 text-[12.5px]">
          {PIPE_KINDS.map(k => <option key={k} value={k}>{t.pipeKind[k]}</option>)}
        </select>
      </Row>
      <Row label={t.fieldEnds}><span data-pipe-ends>{endName(pipe.fromId)} → {endName(pipe.toId)}</span></Row>
      <Row label={t.fieldLength}><span data-pipe-len className="font-bold tabular-nums">{pipeLength(pipe.pts, mPerW).toFixed(2)} m</span><span className="text-[11px] text-gray-500">· {pipe.pts.length - 1} {pipe.pts.length === 2 ? 'stretch' : 'stretches'}</span></Row>
      {pipe.kind === 'duct' && (
        <Row label={t.fieldWidth}>
          <input data-pipe-width type="number" min={5} step={5} defaultValue={pipe.widthCm ?? 20} onBlur={e => { const v = Number(e.target.value); if (v > 0) onChange({ widthCm: v }); }} className="border rounded-md h-8 w-[76px] px-2 text-[12.5px] tabular-nums" />
        </Row>
      )}
    </Frame>
  );
}
