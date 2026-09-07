/**
 * Export… (B9, picks 31 · 66 · 68–70 · 72): one window asking the same three
 * things every time and remembering nothing (68): which options (66), one
 * PDF or separate, the Excel too (30); where to — Drive, download, or both
 * (31); the file name by the rule `Family – Floor – Option – vN` or a typed
 * name in its place (70); and the title block's fields, prefilled from the
 * job record and the plan's own reading, empty for the hand otherwise (72).
 * A preview of the first chosen option is drawn before anything is made.
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { CatalogBlock } from '../../data/catalog';
import type { SketchShape } from '../../data/gvs';
import type { PipeRules, SketchPipe } from '../../data/pipes';
import { unitTags, type SketchItem } from '../../data/sketchItems';
import { boqSheets, buildSheetSvg, exportNames, optionMarkup, optionTotals, todayDDMMYYYY, type SheetTitle } from '../../data/sheetExport';
import { planImageOf, sheetsToPdf, sketcherFolderOf, svgToPng, uploadToFolder } from '../../data/sheetRaster';
import { saveBytes } from '../../data/planExport';
import { makeXlsx } from '../../data/xlsx';
import { useT } from '../../data/strings';

const NAVY = '#1e3a5f';

type TitleKey = 'family' | 'phone' | 'address' | 'floor' | 'project' | 'drawnBy' | 'planType';
/** Module-level on purpose: a component declared in a render body is a new type every render, and the field would lose focus on every keystroke. */
function Field({ k, label, rtl, value, onChange }: { k: TitleKey; label: string; rtl?: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] text-gray-500 min-w-0">{label}
      <input data-tb={k} value={value ?? ''} onChange={e => onChange(e.target.value)} dir={rtl ? 'rtl' : undefined} className="border rounded-md h-8 px-2 text-[12.5px] text-gray-900" />
    </label>
  );
}
function Radio({ on, onPick, label, hook, disabled }: { on: boolean; onPick: () => void; label: string; hook: string; disabled?: boolean }) {
  return <button {...{ [hook]: '' }} aria-pressed={on} disabled={disabled} onClick={onPick} className="min-h-[32px] py-1 leading-tight px-3 rounded-lg border text-[12px] font-semibold aria-pressed:bg-brand-navy aria-pressed:text-white aria-pressed:border-brand-navy disabled:opacity-40">{label}</button>;
}

export interface ExportDialogProps {
  options: { id: string; name: string }[];
  activeOpt: string;
  recordsFor: (optId: string) => { items: SketchItem[]; shapes: SketchShape[]; pipes: SketchPipe[] };
  blocks: Map<string, CatalogBlock>;
  mPerW: number;
  pipeRules: PipeRules;
  aspect: number;
  canvases: () => { pdf: HTMLCanvasElement | null; ink: HTMLCanvasElement | null };
  titleDefaults: Omit<SheetTitle, 'version' | 'optionName' | 'date'>;
  version: number;
  jobFolderId?: string;
  driveConfigured: boolean;
  onDone: (out: { options: string[]; files: { name: string; fileId?: string; url?: string }[] }) => void;
  onClose: () => void;
  isRtl: boolean;
}

export function ExportDialog(p: ExportDialogProps) {
  const t = useT();
  const [chosen, setChosen] = useState<string[]>(p.options.map(o => o.id));
  const [onePdf, setOnePdf] = useState(true);
  const [excel, setExcel] = useState(true);
  const canDrive = p.driveConfigured && !!p.jobFolderId;
  const [where, setWhere] = useState<'drive' | 'download' | 'both'>(canDrive ? 'drive' : 'download');
  const [typed, setTyped] = useState('');
  const [title, setTitle] = useState(p.titleDefaults);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const date = todayDDMMYYYY();
  const chosenOpts = p.options.filter(o => chosen.includes(o.id));
  const names = useMemo(() => exportNames({ family: title.family, floor: title.floor, version: p.version, typed, optionNames: chosenOpts.map(o => o.name), onePdf }), [title.family, title.floor, p.version, typed, chosenOpts, onePdf]);

  const sheetFor = (opt: { id: string; name: string }, i: number, n: number, planImage: string) => {
    const r = p.recordsFor(opt.id);
    const tags = unitTags(r.items);
    const totals = optionTotals(r.items, r.shapes, r.pipes, p.blocks, p.mPerW, tags);
    // type and hairlines sized as on a screen where the plan is ~1200px wide
    const markup = optionMarkup(r.items, r.shapes, r.pipes, p.blocks, p.mPerW, tags, p.pipeRules, 1000 / 1200);
    const svg = buildSheetSvg({ title: { ...title, date, version: p.version, optionName: opt.name, sheetNo: { i, n } }, planImage, planAspect: p.aspect, markup, totals, words: { indoorUnit: t.indoorUnit, outdoorUnit: t.outdoorUnit, number: t.numberWord } });
    return { svg, totals };
  };
  const planImage = () => { const c = p.canvases(); return c.pdf ? planImageOf(c.pdf, c.ink) : ''; };

  // the preview: the first chosen option, redrawn when the title changes
  useEffect(() => {
    const first = chosenOpts[0]; if (!first) { setPreview(null); return; }
    let live = true;
    const img = planImage();
    const { svg } = sheetFor(first, 1, chosenOpts.length, img);
    (window as unknown as { __sheetSvg?: string }).__sheetSvg = svg;   // the harness reads the sheet as drawn
    svgToPng(svg, 1620).then(b => { if (!live) return; const u = URL.createObjectURL(b); setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return u; }); }).catch(e => { console.warn('[sketcher] preview failed', e); if (live) setPreview(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen.join(), title.family, title.phone, title.address, title.floor, title.project, title.drawnBy, title.planType]);

  async function make() {
    if (!chosenOpts.length) { setErr(t.exportNothing); return; }
    setErr(''); setBusy(t.exportMaking(1, chosenOpts.length));
    try {
      const img = planImage();
      const pngs: Blob[] = []; const totalsList: { name: string; totals: ReturnType<typeof optionTotals> }[] = [];
      for (let i = 0; i < chosenOpts.length; i++) {
        setBusy(t.exportMaking(i + 1, chosenOpts.length));
        const { svg, totals } = sheetFor(chosenOpts[i], i + 1, chosenOpts.length, img);
        pngs.push(await svgToPng(svg));
        totalsList.push({ name: chosenOpts[i].name, totals });
      }
      const files: { name: string; blob: Blob }[] = [];
      if (onePdf) files.push({ name: names.pdfs[0], blob: new Blob([new Uint8Array(await sheetsToPdf(pngs))], { type: 'application/pdf' }) });
      else for (let i = 0; i < pngs.length; i++) files.push({ name: names.pdfs[i], blob: new Blob([new Uint8Array(await sheetsToPdf([pngs[i]]))], { type: 'application/pdf' }) });
      if (excel) files.push({ name: names.xlsx, blob: makeXlsx(boqSheets(totalsList, { family: title.family, floor: title.floor, date, version: p.version })) });
      const made: { name: string; fileId?: string; url?: string }[] = [];
      let driveFailed = false;
      if ((where === 'drive' || where === 'both') && canDrive) {
        setBusy(t.exportUploading);
        let folder: string | null = null;
        try { folder = await sketcherFolderOf(p.jobFolderId!); } catch { driveFailed = true; }
        for (const f of files) {
          if (!folder) { made.push({ name: f.name }); continue; }
          try { const up = await uploadToFolder(folder, new File([f.blob], f.name, { type: f.blob.type })); made.push({ name: f.name, fileId: up.fileId, url: up.webViewLink }); }
          catch { driveFailed = true; made.push({ name: f.name }); }
        }
      } else made.push(...files.map(f => ({ name: f.name })));
      if (where === 'download' || where === 'both' || driveFailed) {
        for (let i = 0; i < files.length; i++) { saveBytes(files[i].blob, files[i].name, files[i].blob.type); if (i < files.length - 1) await new Promise(r => setTimeout(r, 350)); }
      }
      if (driveFailed) setErr(t.exportDriveFailed);
      p.onDone({ options: chosenOpts.map(o => o.name), files: made });
      setBusy(null);
      if (!driveFailed) p.onClose();
    } catch (e) { setBusy(null); setErr((e as Error).message); }
  }

  return (
    <div className="fixed inset-0 z-[186] flex items-center justify-center p-3" style={{ backgroundColor: 'rgba(9,14,22,.55)' }} onClick={() => { if (!busy) p.onClose(); }} onPointerDown={e => e.stopPropagation()}>
      <div data-export-dialog className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto p-4 grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)' }} dir={p.isRtl ? 'rtl' : 'ltr'} onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between"><h3 className="text-[15px] font-extrabold">{t.exportWindowTitle}</h3><button onClick={p.onClose} aria-label={t.cancel} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X size={16} /></button></div>
          <section>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">{t.exportWhich}</div>
            <div className="flex flex-wrap gap-1.5">
              {p.options.map(o => <label key={o.id} className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12px] font-semibold cursor-pointer"><input data-export-opt={o.id} type="checkbox" checked={chosen.includes(o.id)} onChange={e => setChosen(c => (e.target.checked ? [...c, o.id] : c.filter(x => x !== o.id)))} />{o.name}</label>)}
            </div>
          </section>
          <section>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">{t.exportHow}</div>
            <div className="flex flex-wrap gap-1.5">
              <Radio hook="data-export-onepdf" on={onePdf} onPick={() => setOnePdf(true)} label={t.exportOnePdf} />
              <Radio hook="data-export-separate" on={!onePdf} onPick={() => setOnePdf(false)} label={t.exportSeparate} />
            </div>
            <label className="flex items-center gap-2 mt-2 text-[12.5px]"><input data-export-excel type="checkbox" checked={excel} onChange={e => setExcel(e.target.checked)} />{t.exportExcel}</label>
          </section>
          <section>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">{t.exportWhere}</div>
            <div className="flex flex-wrap gap-1.5">
              <Radio hook="data-export-drive" on={where === 'drive'} onPick={() => setWhere('drive')} label={t.exportDrive} disabled={!canDrive} />
              <Radio hook="data-export-download" on={where === 'download'} onPick={() => setWhere('download')} label={t.exportDownload} />
              <Radio hook="data-export-both" on={where === 'both'} onPick={() => setWhere('both')} label={t.exportBoth} disabled={!canDrive} />
            </div>
            <div className="text-[11px] text-gray-500 mt-1">{canDrive ? t.exportDriveWhere : t.exportNoDrive}</div>
          </section>
          <section>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">{t.exportName}</div>
            <div className="text-[12px]" data-export-names>{names.pdfs.map(n => <div key={n} className="truncate">{typed.trim() ? n : t.exportNameRule(n)}</div>)}{excel && <div className="truncate text-gray-500">{names.xlsx}</div>}</div>
            <input data-export-typed value={typed} onChange={e => setTyped(e.target.value)} placeholder={t.exportNameTyped} className="border rounded-md h-8 px-2 text-[12.5px] w-full mt-1" />
          </section>
          <section>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">{t.exportTitleBlock}</div>
            <div className="grid grid-cols-2 gap-2">
              <Field k="family" label={t.tbFamily} value={title.family} onChange={v => setTitle(st => ({ ...st, family: v }))} /><Field k="phone" label={t.tbPhone} value={title.phone} onChange={v => setTitle(st => ({ ...st, phone: v }))} />
              <Field k="address" label={t.tbAddress} rtl value={title.address} onChange={v => setTitle(st => ({ ...st, address: v }))} /><Field k="floor" label={t.tbFloor} value={title.floor} onChange={v => setTitle(st => ({ ...st, floor: v }))} />
              <Field k="project" label={t.tbProject} value={title.project} onChange={v => setTitle(st => ({ ...st, project: v }))} /><Field k="drawnBy" label={t.tbDrawnBy} value={title.drawnBy} onChange={v => setTitle(st => ({ ...st, drawnBy: v }))} />
              <Field k="planType" label={t.tbPlanType} rtl value={title.planType} onChange={v => setTitle(st => ({ ...st, planType: v }))} />
            </div>
            <div className="text-[11px] text-gray-500 mt-1">{t.tbEmptyHint}</div>
          </section>
          {err && <p data-export-error className="text-[12px] text-red-600">{err}</p>}
          <button data-export-make disabled={!!busy || !chosenOpts.length} onClick={() => { void make(); }} className="h-11 rounded-xl text-white font-bold text-[13.5px] disabled:opacity-50" style={{ backgroundColor: NAVY }}>{busy ?? t.exportMake}</button>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">{t.exportPreview}</div>
          <div data-export-preview className="border rounded-lg bg-gray-50 overflow-hidden" style={{ aspectRatio: '1620 / 1120' }}>
            {preview ? <img src={preview} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-[12px] text-gray-400">…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
