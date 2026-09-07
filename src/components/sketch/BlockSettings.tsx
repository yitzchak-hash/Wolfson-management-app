/**
 * A placed block's settings window (picks 22 · 45 · 48 · 52): opened by a
 * double-click / double-tap on anything on the plan. What it is (the card —
 * name, model, brand, true size, the block's own specs), its SYSTEM and number
 * (renumbering moves it in the placement order; the rest renumber themselves,
 * because numbers are derived, never stored), its capacity (a swap to another
 * model of the same family, which keeps its place), the padlock, its label,
 * a note, how many of this model stand on the sheet, and Remove.
 */
import { useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { sizeLabel, type CatalogBlock } from '../../data/catalog';
import { type SketchItem } from '../../data/sketchItems';
import { useT } from '../../data/strings';
import { BlockThumb } from './BlockShelf';

const NAVY = '#1e3a5f';

export function BlockSettings({ item, block, catalog, items, systems, tag, onChange, onRenumber, onSwapModel, onDelete, onClose, isRtl }: {
  item: SketchItem;
  block: CatalogBlock | undefined;
  catalog: CatalogBlock[];
  items: SketchItem[];
  systems: string[];
  tag?: string;
  onChange: (patch: Partial<SketchItem>) => void;
  /** Put this unit at position n (1-based) within its system. */
  onRenumber: (n: number) => void;
  onSwapModel: (b: CatalogBlock) => void;
  onDelete: () => void;
  onClose: () => void;
  isRtl: boolean;
}) {
  const t = useT();
  const [w, setW] = useState(String(item.wCm));
  const [h, setH] = useState(String(item.hCm));
  const family = useMemo(() => block ? catalog.filter(b => b.cat === block.cat && (b.sub === block.sub || !block.sub) && b.id !== block.id).sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)) : [], [catalog, block]);
  const sameModel = items.filter(i => i.model === item.model && i.brand === item.brand && (item.model || i.name === item.name)).length;
  const sys = item.system || 'A';
  const inSystem = items.filter(i => i.unit && (i.system || 'A') === sys).length;
  const myNo = tag ? Number(tag.replace(/^\D+/, '')) : 0;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0 text-[12.5px]"><span className="text-gray-500 min-w-[84px] shrink-0">{label}</span><span className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">{children}</span></div>
  );
  const commitSize = () => { const nw = Number(w), nh = Number(h); if (nw > 0 && nh > 0 && (nw !== item.wCm || nh !== item.hCm)) onChange({ wCm: nw, hCm: nh, locked: false }); };
  return (
    <div className="fixed inset-0 z-[185] flex items-center justify-center p-3" style={{ backgroundColor: 'rgba(9,14,22,.5)' }} onClick={onClose} onPointerDown={e => e.stopPropagation()}>
      <div data-block-settings className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-4" dir={isRtl ? 'rtl' : 'ltr'} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-[84px] h-[64px] rounded-lg border border-gray-200 flex items-center justify-center shrink-0 bg-white">{block ? <BlockThumb b={block} size={78} /> : <span className="text-[10px] text-gray-400">?</span>}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-extrabold leading-tight" data-settings-name>{tag ? <span className="text-brand-blue me-1">{tag}</span> : null}{item.name}</div>
            <div className="text-[11.5px] text-gray-500">{[item.model, item.brand].filter(Boolean).join(' · ')}</div>
            <div className="text-[11px] text-gray-500" data-settings-count>{t.countOfModel(sameModel)}</div>
          </div>
          <button onClick={onClose} aria-label={t.cancel} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center shrink-0"><X size={16} /></button>
        </div>
        {!!block?.specs.length && <p className="text-[11px] text-gray-500 mt-1.5 leading-snug" data-settings-specs>{block.specs.join(' · ')}</p>}

        <div className="mt-2">
          {item.unit && (<>
            <Row label={t.fieldSystem}>
              {systems.map(s => <button key={s} data-settings-system={s} aria-pressed={sys === s} onClick={() => onChange({ system: s })} className="h-7 min-w-[28px] px-1.5 rounded-md text-[12px] font-extrabold border aria-pressed:bg-brand-navy aria-pressed:text-white aria-pressed:border-brand-navy">{s}</button>)}
            </Row>
            <Row label={t.fieldNumber}>
              <select data-settings-number value={myNo} onChange={e => onRenumber(Number(e.target.value))} className="border rounded-md h-7 px-1 text-[12px]">
                {Array.from({ length: inSystem }, (_, i) => i + 1).map(n => <option key={n} value={n}>{sys}{n}</option>)}
              </select>
              <span className="text-[11px] text-gray-500">{t.renumberHint}</span>
            </Row>
          </>)}
          {family.length > 0 && (
            <Row label={t.changeModel}>
              <select data-settings-model value="" onChange={e => { const b = catalog.find(x => x.id === e.target.value); if (b) onSwapModel(b); }} className="border rounded-md h-7 px-1 text-[12px] max-w-full">
                <option value="">{item.model || item.name}</option>
                {family.map(b => <option key={b.id} value={b.id}>{b.brand ? `${b.brand} · ` : ''}{b.name}{b.model && !b.name.includes(b.model) ? ` (${b.model})` : ''}</option>)}
              </select>
            </Row>
          )}
          <Row label={t.fieldSize}>
            <input data-settings-w type="number" min={1} step={0.5} value={w} onChange={e => setW(e.target.value)} onBlur={commitSize} disabled={item.locked} className="border rounded-md h-7 w-[64px] px-1 text-[12px] tabular-nums disabled:bg-gray-50" />
            <span>×</span>
            <input data-settings-h type="number" min={1} step={0.5} value={h} onChange={e => setH(e.target.value)} onBlur={commitSize} disabled={item.locked} className="border rounded-md h-7 w-[64px] px-1 text-[12px] tabular-nums disabled:bg-gray-50" />
            <span className="text-gray-500">cm</span>
            <button data-settings-lock aria-pressed={item.locked} onClick={() => { if (!item.locked && block) { onChange({ locked: true, wCm: block.wCm, hCm: block.hCm }); setW(String(block.wCm)); setH(String(block.hCm)); } else onChange({ locked: !item.locked }); }}
              className="h-7 px-2 rounded-md border text-[11.5px] font-bold aria-pressed:bg-brand-navy aria-pressed:text-white aria-pressed:border-brand-navy">{item.locked ? `🔒 ${t.lockedTrueSize}` : `🔓 ${t.unlockedSize}`}</button>
            {block && <span className="text-[11px] text-gray-500">{t.catalogSize} {sizeLabel(block.wCm, block.hCm)}</span>}
          </Row>
          <Row label={t.fieldTurn}>
            <input data-settings-rot type="number" step={15} value={item.rot} onChange={e => onChange({ rot: ((Number(e.target.value) % 360) + 360) % 360 })} className="border rounded-md h-7 w-[64px] px-1 text-[12px] tabular-nums" /><span className="text-gray-500">°</span>
            <button onClick={() => onChange({ rot: (item.rot + 180) % 360 })} className="h-7 px-2 rounded-md border text-[11.5px] font-bold">{t.turnAround}</button>
          </Row>
          <Row label={t.fieldLabel}>
            <button data-settings-label aria-pressed={!item.labelHidden} onClick={() => onChange({ labelHidden: !item.labelHidden })} className="h-7 px-2 rounded-md border text-[11.5px] font-bold aria-pressed:bg-brand-navy aria-pressed:text-white aria-pressed:border-brand-navy">{item.labelHidden ? t.labelHiddenWord : t.labelShownWord}</button>
            <button onClick={() => onChange({ lx: -item.lx })} className="h-7 px-2 rounded-md border text-[11.5px] font-bold">{t.flipLabel}</button>
            <span className="text-[11px] text-gray-500">{t.labelWordsHint}</span>
          </Row>
          <Row label={t.fieldNote}>
            <input data-settings-note defaultValue={item.note ?? ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (item.note ?? '')) onChange({ note: v || undefined }); }} placeholder={t.notePlaceholder} className="border rounded-md h-7 px-2 text-[12px] w-full" />
          </Row>
        </div>
        <div className="flex justify-between items-center mt-3">
          <button data-settings-delete onClick={() => { onDelete(); onClose(); }} className="h-9 px-3 rounded-xl border border-red-200 text-red-600 text-[12.5px] font-bold flex items-center gap-1.5 hover:bg-red-50"><Trash2 size={14} /> {t.deleteBlock}</button>
          <button onClick={onClose} className="h-9 px-4 rounded-xl text-white text-[12.5px] font-bold" style={{ backgroundColor: NAVY }}>{t.done}</button>
        </div>
      </div>
    </div>
  );
}
