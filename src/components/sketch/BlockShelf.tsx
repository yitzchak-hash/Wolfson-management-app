/**
 * The shelf (B7, picks 17 · 41 · 47): the catalog down one side of the studio,
 * always open, about 120px wide — you learn where each block sits.
 *
 * Shelves by TYPE or by BRAND, a search box, a SYSTEM row (pick 45: the lit
 * letter letters the next unit), the two-tap scale, the count of what stands on
 * the sheet (pick 22), and the PNG door (pick 21). A press on a block STAMPS it
 * (pick 46 — the block rides the cursor until Escape); a press that moves is a
 * drag and places ONE (pick 18): the shelf reports the drag's travel to the
 * host, which owns the sheet and knows where it landed.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ImagePlus, Plus, Ruler, Search, Trash2, X } from 'lucide-react';
import { brandsOf, searchBlocks, sizeLabel, shrinkPng, pngBlock, SHELF_CATS, type BlockCat, type CatalogBlock } from '../../data/catalog';
import { countByModel, type SketchItem } from '../../data/sketchItems';
import { useT } from '../../data/strings';

const NAVY = '#1e3a5f';
const ACCENT = '#4aa8d8';

/** A block drawn small, for the shelf and the settings window. */
export function BlockThumb({ b, size = 92, className }: { b: CatalogBlock; size?: number; className?: string }) {
  const [, , vw, vh] = b.vb.split(/\s+/).map(Number);
  const k = Math.min(size / (vw || 1), (size * 0.62) / (vh || 1));
  const w = Math.max(8, (vw || 1) * k), h = Math.max(8, (vh || 1) * k);
  if (b.png) return <img src={b.png} alt="" className={className} style={{ width: w, height: h, objectFit: 'fill' }} draggable={false} />;
  return (
    <svg viewBox={b.vb} width={w} height={h} className={className} style={{ overflow: 'visible' }} aria-hidden>
      <style>{`.thumb * { vector-effect: non-scaling-stroke; }`}</style>
      <g className="thumb" dangerouslySetInnerHTML={{ __html: b.body ?? '' }} />
    </svg>
  );
}

export interface BlockShelfProps {
  blocks: CatalogBlock[];
  items: SketchItem[];
  systems: string[];
  system: string;
  onSystem: (letter: string) => void;
  onAddSystem: () => void;
  stamp: CatalogBlock | null;
  onStamp: (b: CatalogBlock | null) => void;
  /** A drag from the shelf: its travel, then where it let go. */
  onDragMove: (b: CatalogBlock, clientX: number, clientY: number) => void;
  onDragEnd: (b: CatalogBlock, clientX: number, clientY: number) => void;
  /** The scale line and the two-tap door. */
  scaleWords: string;
  scaleKnown: boolean;
  measuring: boolean;
  onMeasure: () => void;
  onAddPng: (b: CatalogBlock) => void;
  onDeletePng?: (id: string) => void;
  width: number;
  isRtl: boolean;
  /** B8: the drawing tools and the options row, at the top. */
  top?: React.ReactNode;
  /** Room kept clear under the footer — the phone's floating Done button sits there. */
  padBottom?: number;
}

export function BlockShelf(props: BlockShelfProps) {
  const { blocks, items, systems, system, onSystem, onAddSystem, stamp, onStamp, onDragMove, onDragEnd, scaleWords, scaleKnown, measuring, onMeasure, onAddPng, onDeletePng, width, isRtl, top, padBottom = 0 } = props;
  const t = useT();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'type' | 'brand'>('type');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [png, setPng] = useState(false);
  const shown = useMemo(() => searchBlocks(blocks.filter(b => b.cat !== 'cards'), q), [blocks, q]);
  const groups = useMemo(() => {
    if (mode === 'brand') return brandsOf(shown).map(br => ({ key: `b:${br}`, title: br || t.noBrand, list: shown.filter(b => b.brand === br) }));
    return SHELF_CATS.map(c => ({ key: `c:${c}`, title: t.catName[c], list: shown.filter(b => b.cat === c) })).filter(g => g.list.length);
  }, [shown, mode, t]);
  const counts = useMemo(() => countByModel(items), [items]);

  // press = stamp; press that travels = drag one
  const press = useRef<{ b: CatalogBlock; x: number; y: number; dragging: boolean; id: number } | null>(null);
  const onDown = (e: React.PointerEvent, b: CatalogBlock) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    press.current = { b, x: e.clientX, y: e.clientY, dragging: false, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const p = press.current; if (!p) return;
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.dragging = true;
    if (p.dragging) onDragMove(p.b, e.clientX, e.clientY);
  };
  const onUp = (e: React.PointerEvent) => {
    const p = press.current; press.current = null; if (!p) return;
    if (p.dragging) onDragEnd(p.b, e.clientX, e.clientY);
    else onStamp(stamp?.id === p.b.id ? null : p.b);
  };

  return (
    <aside data-block-shelf className="flex-shrink-0 flex flex-col min-h-0 text-white" style={{ width, backgroundColor: NAVY, borderInlineStart: '1px solid rgba(255,255,255,.12)' }} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="p-1.5 flex flex-col gap-1.5 border-b border-white/10">
        <label className="flex items-center gap-1 rounded-md px-1.5 h-7 bg-white/10">
          <Search size={12} className="opacity-70 shrink-0" />
          <input data-shelf-search value={q} onChange={e => setQ(e.target.value)} placeholder={t.shelfSearch} className="bg-transparent outline-none text-[11px] w-full placeholder:text-white/40" />
          {q && <button onClick={() => setQ('')} aria-label={t.cancel}><X size={11} /></button>}
        </label>
        <div className="flex rounded-md overflow-hidden text-[10px] font-bold">
          <button data-shelf-mode="type" onClick={() => setMode('type')} className="flex-1 h-6" style={{ backgroundColor: mode === 'type' ? ACCENT : 'rgba(255,255,255,.1)' }}>{t.byType}</button>
          <button data-shelf-mode="brand" onClick={() => setMode('brand')} className="flex-1 h-6" style={{ backgroundColor: mode === 'brand' ? ACCENT : 'rgba(255,255,255,.1)' }}>{t.byBrand}</button>
        </div>
        {/* the SYSTEM row (pick 45 · 53): the lit letter letters the next unit */}
        <div className="flex items-center gap-1 flex-wrap" data-systems>
          <span className="text-[9.5px] text-white/60 me-0.5">{t.systemsLabel}</span>
          {systems.map(s => (
            <button key={s} data-system={s} aria-pressed={system === s} onClick={() => onSystem(s)} className="h-6 min-w-[24px] px-1 rounded-md text-[11px] font-extrabold" style={{ backgroundColor: system === s ? ACCENT : 'rgba(255,255,255,.12)' }}>{s}</button>
          ))}
          <button data-add-system onClick={onAddSystem} title={t.addSystem} className="h-6 w-6 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center"><Plus size={12} /></button>
        </div>
        {/* the scale (pick 14's number, needed here to draw a block true size) */}
        <button data-shelf-scale data-scale-known={scaleKnown ? '1' : '0'} onClick={onMeasure} aria-pressed={measuring} className="text-start text-[9.5px] leading-tight rounded-md px-1.5 py-1 flex items-start gap-1 hover:bg-white/10" style={{ backgroundColor: measuring ? 'rgba(220,38,38,.35)' : scaleKnown ? 'transparent' : 'rgba(245,158,11,.25)' }}>
          <Ruler size={11} className="shrink-0 mt-px" /><span>{measuring ? t.measureTwo : scaleWords}</span>
        </button>
        {top}
        {stamp && <div data-stamp-hint className="text-[9.5px] leading-tight rounded-md px-1.5 py-1" style={{ backgroundColor: 'rgba(74,168,216,.3)' }}>{t.stampHint}</div>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto board-rail p-1" data-shelf-list>
        {groups.length === 0 && <p className="text-[10.5px] text-white/60 p-2">{t.nothingFound}</p>}
        {groups.map(g => {
          const isClosed = !!closed[g.key];
          return (
            <section key={g.key} data-shelf-group={g.key} className="mb-1">
              <button onClick={() => setClosed(c => ({ ...c, [g.key]: !isClosed }))} className="w-full flex items-center gap-1 px-1 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white/80 hover:text-white">
                {isClosed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}<span className="truncate">{g.title}</span><span className="ms-auto text-white/40 font-semibold">{g.list.length}</span>
              </button>
              {!isClosed && g.list.map(b => (
                <button key={b.id} data-shelf-block={b.id} title={`${b.name}${b.model ? ` · ${b.model}` : ''}${b.brand ? ` · ${b.brand}` : ''} · ${sizeLabel(b.wCm, b.hCm)}${b.lengths ? ` · L=${b.lengths.join('/')}` : ''}\n${t.dragHint}`}
                  onPointerDown={e => onDown(e, b)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { press.current = null; }}
                  className="w-full rounded-lg p-1 mb-0.5 flex flex-col items-center gap-0.5 select-none"
                  style={{ backgroundColor: stamp?.id === b.id ? ACCENT : 'rgba(255,255,255,.92)', color: stamp?.id === b.id ? '#fff' : NAVY, touchAction: 'none' }}>
                  <div className="h-[58px] w-full flex items-center justify-center overflow-hidden"><BlockThumb b={b} size={width - 22} /></div>
                  <span className="text-[9.5px] font-bold leading-tight text-center w-full line-clamp-2" style={{ direction: /[֐-׿]/.test(b.name) ? 'rtl' : 'ltr' }}>{b.name}</span>
                  <span className="text-[8.5px] leading-none opacity-70" dir="ltr">{sizeLabel(b.wCm, b.hCm)}</span>
                  {b.custom && onDeletePng && (
                    <span role="button" data-delete-png={b.id} onPointerDown={e => { e.stopPropagation(); }} onClick={e => { e.stopPropagation(); if (window.confirm(t.pngDeleteAsk)) onDeletePng(b.id); }} className="text-[8.5px] flex items-center gap-0.5 opacity-70 hover:opacity-100"><Trash2 size={9} />{t.pngDelete}</span>
                  )}
                </button>
              ))}
            </section>
          );
        })}
      </div>

      {/* the count (pick 22) and the PNG door (pick 21) */}
      <div className="border-t border-white/10 p-1.5 text-[9.5px]" data-shelf-count style={{ paddingBottom: 6 + padBottom }}>
        <div className="font-extrabold uppercase tracking-wide text-white/70 mb-0.5">{t.countTitle}</div>
        {counts.length === 0 && <div className="text-white/50">{t.countNone}</div>}
        <ul className="max-h-[92px] overflow-y-auto board-rail">
          {counts.map(c => <li key={c.key} data-count-row className="flex gap-1 leading-tight"><b className="tabular-nums shrink-0">{c.n}×</b><span className="truncate">{c.model || c.name}</span></li>)}
        </ul>
        <button data-add-png onClick={() => setPng(true)} className="mt-1.5 w-full h-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center gap-1 text-[10px] font-bold"><ImagePlus size={12} /> {t.addPng}</button>
      </div>
      {png && <PngDoor onClose={() => setPng(false)} onAdd={b => { onAddPng(b); setPng(false); }} />}
    </aside>
  );
}

/** Pick 21: anyone adds a PNG into a category — name required, real cm required (a picture carries no scale). */
function PngDoor({ onClose, onAdd }: { onClose: () => void; onAdd: (b: CatalogBlock) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [brand, setBrand] = useState('');
  const [cat, setCat] = useState<BlockCat>('custom');
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  const [unit, setUnit] = useState(false);
  const [png, setPngData] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const canSave = !!png && name.trim() && Number(w) > 0 && Number(h) > 0;
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try { setPngData(await shrinkPng(f)); setErr(''); if (!name) setName(f.name.replace(/\.[^.]+$/, '')); }
    catch (e) { setErr((e as Error).message === 'too big' ? t.pngTooBig : t.uploadFailed); }
  };
  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(9,14,22,.55)' }} onClick={onClose}>
      <div data-png-door className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-4 flex flex-col gap-2.5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="font-extrabold text-[14px]">{t.addPng}</h3><button onClick={onClose} aria-label={t.cancel}><X size={16} /></button></div>
        <label className="block border-2 border-dashed rounded-xl p-3 text-center text-[12px] text-gray-500 cursor-pointer hover:bg-gray-50">
          {png ? <img src={png} alt="" className="max-h-24 mx-auto" /> : t.pngPick}
          <input data-png-file type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => pickFile(e.target.files?.[0])} />
        </label>
        <input data-png-name value={name} onChange={e => setName(e.target.value)} placeholder={t.pngName} className="border rounded-lg px-2 h-9 text-[13px]" />
        <div className="flex gap-2">
          <input data-png-model value={model} onChange={e => setModel(e.target.value)} placeholder={t.fieldModel} className="border rounded-lg px-2 h-9 text-[13px] flex-1 min-w-0" />
          <input data-png-brand value={brand} onChange={e => setBrand(e.target.value)} placeholder={t.fieldBrand} className="border rounded-lg px-2 h-9 text-[13px] flex-1 min-w-0" />
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-gray-500 shrink-0">{t.pngSize}</span>
          <input data-png-w type="number" min={1} value={w} onChange={e => setW(e.target.value)} placeholder="W" className="border rounded-lg px-2 h-9 w-20 tabular-nums" />
          <span>×</span>
          <input data-png-h type="number" min={1} value={h} onChange={e => setH(e.target.value)} placeholder="H" className="border rounded-lg px-2 h-9 w-20 tabular-nums" />
          <span className="text-gray-500">cm</span>
        </div>
        <p className="text-[11px] text-gray-500 -mt-1">{t.pngNeedSize}</p>
        <label className="flex items-center gap-2 text-[12px]"><span className="text-gray-500 shrink-0">{t.pngCat}</span>
          <select data-png-cat value={cat} onChange={e => setCat(e.target.value as BlockCat)} className="border rounded-lg px-2 h-9 text-[13px] flex-1">
            {SHELF_CATS.map(c => <option key={c} value={c}>{t.catName[c]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={unit} onChange={e => setUnit(e.target.checked)} data-png-unit /> {t.pngUnit}</label>
        {err && <p className="text-[12px] text-red-600">{err}</p>}
        <button data-png-save disabled={!canSave} onClick={() => onAdd(pngBlock({ id: `png-${Date.now().toString(36)}`, name: name.trim(), model: model.trim(), brand: brand.trim(), cat, wCm: Number(w), hCm: Number(h), png: png!, unit }))}
          className="h-10 rounded-xl text-white font-bold text-[13px] disabled:opacity-40" style={{ backgroundColor: NAVY }}>{t.pngSave}</button>
      </div>
    </div>
  );
}
