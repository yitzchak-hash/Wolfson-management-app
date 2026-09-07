/**
 * The drawing tools at the top of the shelf (B8): Gvs · Trace · Pipe (with
 * its kinds, pick 57) · Metal duct (waiting for its pieces, follow-up 5); the
 * lit DROP chip for the next box (pick 58's toolbar half — the box's own
 * chips float beside it once drawn); and the floor's OPTIONS row (picks 27 ·
 * 63–67): tabs, + option, double-click to rename, Compare, Clear.
 */
import React, { useState } from 'react';
import { Copy, GitCompare, Plus, Trash2, X } from 'lucide-react';
import { DROPS, dropLabel } from '../../data/gvs';
import { PIPE_KINDS, pipeLook, type PipeKind, type PipeRules } from '../../data/pipes';
import { useT } from '../../data/strings';
import type { SketchTool } from './GvsLayer';

const ACCENT = '#4aa8d8';

export interface SketchToolsProps {
  tool: SketchTool;
  onTool: (t: SketchTool) => void;
  pipeKind: PipeKind;
  onPipeKind: (k: PipeKind) => void;
  pipeRules: PipeRules;
  drop: number;
  onDrop: (drop: number) => void;
  options: { id: string; name: string }[];
  active: string;
  onPick: (id: string) => void;
  onAdd: (copy: boolean) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  compare: boolean;
  onCompare: (on: boolean) => void;
}

export function SketchTools(p: SketchToolsProps) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; v: string } | null>(null);
  const btn = (id: SketchTool, label: string, hint: string, disabled = false) => (
    <button key={id ?? 'none'} data-sketch-tool={id ?? ''} disabled={disabled} title={hint} aria-pressed={p.tool === id} onClick={() => p.onTool(p.tool === id ? null : id)}
      className="h-7 flex-1 rounded-md text-[10px] font-bold disabled:opacity-35" style={{ backgroundColor: p.tool === id ? ACCENT : 'rgba(255,255,255,.1)' }}>{label}</button>
  );
  return (
    <div className="flex flex-col gap-1.5" data-sketch-tools>
      <div className="text-[9.5px] text-white/60 -mb-1">{t.sketchTools}</div>
      <div className="flex gap-1">{btn('gvs', t.toolGvs, t.toolGvsHint)}{btn('trace', t.toolTrace, t.toolTraceHint)}{btn('pipe', t.toolPipe, t.toolPipeHint)}</div>
      <button data-sketch-tool="metal" disabled title={t.toolMetalHint} className="h-6 rounded-md text-[9.5px] font-bold opacity-35" style={{ backgroundColor: 'rgba(255,255,255,.1)' }}>{t.toolMetal} · …</button>
      {p.tool === 'pipe' && (
        <div className="flex flex-wrap gap-1" data-pipe-kinds>
          {PIPE_KINDS.map(k => { const look = pipeLook(k, p.pipeRules); return (
            <button key={k} data-pipe-kind={k} aria-pressed={p.pipeKind === k} onClick={() => p.onPipeKind(k)} className="h-6 px-1.5 rounded-md text-[9.5px] font-bold flex items-center gap-1" style={{ backgroundColor: p.pipeKind === k ? ACCENT : 'rgba(255,255,255,.1)' }}>
              <span className="inline-block w-3 h-[3px] rounded" style={{ backgroundColor: look.color }} />{t.pipeKind[k]}
            </button>
          ); })}
        </div>
      )}
      {(p.tool === 'gvs' || p.tool === 'trace') && (
        <div className="flex items-center gap-1" data-drop-row>
          <span className="text-[9.5px] text-white/60">{t.dropChips}</span>
          {DROPS.map(d => <button key={d.drop} data-drop-pick={d.drop} aria-pressed={p.drop === d.drop} onClick={() => p.onDrop(d.drop)} className="h-6 flex-1 rounded-md text-[10px] font-extrabold text-white" style={{ backgroundColor: d.color, outline: p.drop === d.drop ? '2px solid #fff' : 'none' }}>{dropLabel(d.drop)}</button>)}
        </div>
      )}
      {/* the floor's options (pick 27) */}
      <div className="text-[9.5px] text-white/60 -mb-1 mt-0.5">{t.optionsWord}</div>
      <div className="flex flex-wrap gap-1" data-options>
        {p.options.map(o => (
          renaming?.id === o.id
            ? <input key={o.id} data-option-rename autoFocus value={renaming.v} onChange={e => setRenaming({ id: o.id, v: e.target.value })}
              onBlur={() => { if (renaming.v.trim()) p.onRename(o.id, renaming.v.trim()); setRenaming(null); }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }}
              className="h-6 px-1.5 rounded-md text-[10px] font-bold text-gray-900 w-[84px]" />
            : <button key={o.id} data-option={o.id} aria-pressed={p.active === o.id} title={t.renameOption} onClick={() => p.onPick(o.id)} onDoubleClick={() => setRenaming({ id: o.id, v: o.name })}
              className="h-6 px-1.5 rounded-md text-[10px] font-bold max-w-[110px] truncate" style={{ backgroundColor: p.active === o.id ? ACCENT : 'rgba(255,255,255,.12)' }}>{o.name}</button>
        ))}
        <button data-option-add onClick={() => setAsking(true)} className="h-6 px-1.5 rounded-md text-[10px] font-bold bg-white/10 hover:bg-white/20 flex items-center gap-0.5"><Plus size={10} />{t.addOption.replace(/^\+\s*/, '')}</button>
      </div>
      <div className="flex gap-1">
        <button data-option-compare aria-pressed={p.compare} disabled={p.options.length < 2} title={t.compareHint} onClick={() => p.onCompare(!p.compare)} className="h-6 flex-1 rounded-md text-[9.5px] font-bold flex items-center justify-center gap-1 disabled:opacity-35" style={{ backgroundColor: p.compare ? ACCENT : 'rgba(255,255,255,.1)' }}><GitCompare size={10} />{t.compare}</button>
        <button data-option-clear title={t.clearOption} onClick={() => { if (window.confirm(t.clearOptionAsk)) p.onClear(); }} className="h-6 w-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center"><Trash2 size={11} /></button>
        <button data-option-delete disabled={p.options.length < 2} title={t.deleteOption} onClick={() => { if (window.confirm(t.deleteOptionAsk)) p.onDelete(p.active); }} className="h-6 w-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-35"><X size={11} /></button>
      </div>
      {/* a new option ASKS: a copy, or blank (pick 63) */}
      {asking && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(9,14,22,.5)' }} onClick={() => setAsking(false)}>
          <div data-option-ask className="bg-white text-gray-900 rounded-2xl shadow-2xl p-4 w-full max-w-xs flex flex-col gap-2" onClick={e => e.stopPropagation()}>
            <div className="text-[13.5px] font-extrabold">{t.optionAsk}</div>
            <button data-option-copy onClick={() => { setAsking(false); p.onAdd(true); }} className="h-10 rounded-xl text-white font-bold text-[13px] flex items-center justify-center gap-2" style={{ backgroundColor: '#1e3a5f' }}><Copy size={14} />{t.optionCopy}</button>
            <button data-option-blank onClick={() => { setAsking(false); p.onAdd(false); }} className="h-10 rounded-xl font-bold text-[13px]" style={{ backgroundColor: '#f1f5f9' }}>{t.optionBlank}</button>
          </div>
        </div>
      )}
    </div>
  );
}
