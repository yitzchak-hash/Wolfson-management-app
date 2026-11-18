/**
 * THE PLAN, for someone outside the office (shared view, owner 2026-11-18): the apartment's plan with its layer
 * switches, full screen, print, download and share — and their own pins. No plan search, no plan picker, no Drive:
 * the one plan the office starred comes through the server by a sealed ref, and that is all this can open.
 *
 * Loaded lazily (pdf.js is heavy) and kept apart from the office's studio (PlanAnnotator), which saves to Drive,
 * stamps versions and browses folders — none of which may exist on this page.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '../components/plans/pdfCompat';   // must come before pdf.js
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Layers, Maximize2, Minimize2, Printer, Download, Share2, MapPin, Plus, Minus, X, Trash2, Loader2, ChevronLeft, ChevronRight, Scan } from 'lucide-react';
import type { SharedApi, ViewerPin } from './sharedApi';
import { SharedError } from './sharedApi';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; optionalContentConfigPromise?: Promise<unknown> }): { promise: Promise<void>; cancel(): void };
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; getOptionalContentConfig?(): Promise<OcConfig>; destroy?(): void }
interface OcConfig {
  getOrder?(): unknown[];
  getGroups?(): Record<string, { name?: string }> | undefined;
  getGroup?(id: string): { name?: string } | undefined;
  setVisibility?(id: string, on: boolean): void;
}
/** The layer order is a tree (grouped layers nest) — every id in it. */
function flattenOrder(order: unknown[]): string[] {
  const out: string[] = [];
  const walk = (rows: unknown[]) => {
    for (const row of rows) {
      if (typeof row === 'string') { out.push(row); continue; }
      const nested = (row as { order?: unknown[] } | null)?.order;
      if (Array.isArray(nested)) walk(nested);
    }
  };
  walk(order);
  return out;
}

/** A picture wearing a one-page document's clothes, so the same drawing code serves both. */
function imageAsDoc(bmp: ImageBitmap): PdfDoc {
  const page: PdfPage = {
    getViewport: ({ scale }) => ({ width: bmp.width * scale, height: bmp.height * scale }),
    render(o) {
      const { canvasContext, viewport } = o as { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } };
      return { promise: Promise.resolve().then(() => canvasContext.drawImage(bmp, 0, 0, viewport.width, viewport.height)), cancel() { /* instant */ } };
    },
  };
  return { numPages: 1, getPage: async () => page };
}

export interface PlanWords {
  layers: string; allOn: string; allOff: string; fullScreen: string; exitFullScreen: string; print: string; download: string;
  share: string; addPin: string; tapPlan: string; pinPlaceholder: string; save: string; cancel: string; remove: string;
  reallyRemove: string; loading: string; failed: string; page: string; fit: string; shareFallback: string; pinFailed: string;
  noLayers: string; yourPins: string;
}

export default function SharedPlanViewer({ api, planRef, apartmentId, label, pins, onPinsChange, words: w, rtl }: {
  api: SharedApi;
  planRef: string;
  apartmentId: string;
  /** "Apt 12 — Cohen", for file names and the printed sheet. */
  label: string;
  /** This link's pins on this apartment's plan. */
  pins: ViewerPin[];
  onPinsChange: (next: ViewerPin[]) => void;
  words: PlanWords;
  rtl: boolean;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [err, setErr] = useState('');
  const [got, setGot] = useState<{ n: number; total: number | null }>({ n: 0, total: null });
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(true);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [layers, setLayers] = useState<{ id: string; name: string; on: boolean }[]>([]);
  const [showLayers, setShowLayers] = useState(false);
  const [full, setFull] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<{ xPct: number; yPct: number; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [armDelete, setArmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ocRef = useRef<OcConfig | null>(null);
  const [drawTick, setDrawTick] = useState(0);
  const isImage = !!blob && blob.type.startsWith('image/');

  // ── load ──
  useEffect(() => {
    let dead = false;
    setErr(''); setDoc(null); setBlob(null); setPage(0); setFit(true);
    api.fileBytes(planRef, (n, total) => { if (!dead) setGot({ n, total }); })
      .then(async b => {
        if (dead) return;
        setBlob(b);
        const d: PdfDoc = b.type.startsWith('image/')
          ? imageAsDoc(await createImageBitmap(b))
          // pdf.js takes its input away to its worker — it gets its own copy, the Blob stays for download/share.
          : await (pdfjs.getDocument({ data: new Uint8Array(await b.arrayBuffer()) }).promise as unknown as Promise<PdfDoc>);
        if (!dead) setDoc(d);
      })
      .catch(e => { if (!dead) setErr(e instanceof SharedError && e.kind === 'gone' ? w.failed : w.failed); });
    return () => { dead = true; };
  }, [api, planRef, w.failed]);
  useEffect(() => () => { try { doc?.destroy?.(); } catch { /* gone */ } }, [doc]);

  // ── the plan's own layers ──
  useEffect(() => {
    setLayers([]); ocRef.current = null;
    if (!doc?.getOptionalContentConfig) return;
    let dead = false;
    doc.getOptionalContentConfig().then(cfg => {
      if (dead) return;
      const ids = flattenOrder(cfg.getOrder?.() ?? []);
      const all = cfg.getGroups?.() ?? {};
      for (const id of Object.keys(all)) if (!ids.includes(id)) ids.push(id);
      ocRef.current = cfg;
      setLayers(ids.map(id => ({ id, name: cfg.getGroup?.(id)?.name ?? all[id]?.name ?? 'Layer', on: true })));
    }).catch(() => { /* no layers */ });
    return () => { dead = true; };
  }, [doc]);
  const setLayer = (id: string | null, on: boolean) => {
    const cfg = ocRef.current;
    if (!cfg) return;
    setLayers(prev => prev.map(l => {
      if (id && l.id !== id) return l;
      try { cfg.setVisibility?.(l.id, on); } catch { /* older build */ }
      return { ...l, on };
    }));
    setDrawTick(t => t + 1);
  };

  // ── the page's natural size, and the fit ──
  useEffect(() => {
    if (!doc) return;
    let dead = false;
    doc.getPage(page + 1).then(p => { if (!dead) { const v = p.getViewport({ scale: 1 }); setNat({ w: v.width, h: v.height }); } });
    return () => { dead = true; };
  }, [doc, page]);
  const fitScale = useCallback(() => {
    const el = stageRef.current;
    if (!el || !nat) return 1;
    return Math.max(0.05, Math.min((el.clientWidth - 16) / nat.w, (el.clientHeight - 16) / nat.h));
  }, [nat]);
  useLayoutEffect(() => {
    if (!fit) return;
    const el = stageRef.current;
    if (!el) return;
    const apply = () => setScale(fitScale());
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, fitScale, full]);

  // ── draw (a moment after the zoom stops) ──
  useEffect(() => {
    if (!doc || !nat) return;
    let dead = false;
    let task: { cancel(): void } | null = null;
    const t = setTimeout(async () => {
      const p = await doc.getPage(page + 1);
      if (dead) return;
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Big sheets are capped so a phone never builds a canvas it cannot hold.
      const want = scale * dpr;
      const cap = Math.sqrt(16_000_000 / (nat.w * nat.h));
      const s = Math.min(want, cap);
      const vp = p.getViewport({ scale: s });
      const off = document.createElement('canvas');
      off.width = Math.round(vp.width); off.height = Math.round(vp.height);
      const ctx = off.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, off.width, off.height);
      task = p.render({ canvasContext: ctx, viewport: vp, ...(ocRef.current ? { optionalContentConfigPromise: Promise.resolve(ocRef.current) } : {}) });
      try { await (task as unknown as { promise: Promise<void> }).promise; } catch { return; }
      if (dead) return;
      c.width = off.width; c.height = off.height;
      c.getContext('2d')?.drawImage(off, 0, 0);
    }, 120);
    return () => { dead = true; clearTimeout(t); try { task?.cancel(); } catch { /* done */ } };
  }, [doc, nat, page, scale, drawTick]);

  // ── full screen (the real one where the browser has it, else the page's own) ──
  const toggleFull = async () => {
    const el = rootRef.current;
    if (!full) {
      setFull(true);
      try { await el?.requestFullscreen?.(); } catch { /* the CSS one is enough */ }
    } else {
      setFull(false);
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* fine */ }
    }
    setFit(true);
  };
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const zoom = (f: number) => { setFit(false); setScale(s => Math.max(0.05, Math.min(8, s * f))); };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  const fileName = useMemo(() => {
    const base = `Plan — ${label}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
    return `${base}.${isImage ? (blob?.type.split('/')[1] || 'png') : 'pdf'}`;
  }, [label, isImage, blob]);

  const download = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  /** Share the FILE — never this page's address, which is the key to the whole view. */
  const share = async () => {
    if (!blob) return;
    const file = new File([blob], fileName, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: fileName }); } catch { /* cancelled */ }
      return;
    }
    download();
    setNote(w.shareFallback);
    setTimeout(() => setNote(''), 5000);
  };

  /** Print every page (capped), with this page's pins drawn on, and the pin list after. */
  const print = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const pages: string[] = [];
      const n = Math.min(doc.numPages, 30);
      for (let i = 0; i < n; i++) {
        const p = await doc.getPage(i + 1);
        const v1 = p.getViewport({ scale: 1 });
        const s = Math.min(2, 2200 / Math.max(v1.width, v1.height));
        const vp = p.getViewport({ scale: s });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await p.render({ canvasContext: ctx, viewport: vp, ...(ocRef.current ? { optionalContentConfigPromise: Promise.resolve(ocRef.current) } : {}) }).promise;
        const mine = pins.filter(x => x.page === i);
        mine.forEach((x, k) => {
          const px = (x.xPct / 100) * c.width, py = (x.yPct / 100) * c.height, r = Math.max(10, c.width / 120);
          ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.arc(px, py - r, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(pins.indexOf(x) + 1 || k + 1), px, py - r);
        });
        pages.push(c.toDataURL('image/png'));
      }
      const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
      const list = pins.length
        ? `<h2>${esc(w.yourPins)}</h2><ol>${pins.map(p => `<li>${esc(p.text)}${p.page ? ` <small>(${esc(w.page)} ${p.page + 1})</small>` : ''}</li>`).join('')}</ol>`
        : '';
      const html = `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(fileName)}</title>
        <style>body{margin:0;font:13px system-ui,sans-serif}img{display:block;width:100%;page-break-after:always}h1{font-size:15px;margin:8px}h2{font-size:14px;margin:12px 8px 4px}ol{margin:0 8px 0 28px}</style>
        </head><body><h1>${esc(label)}</h1>${pages.map(src => `<img src="${src}">`).join('')}${list}</body></html>`;
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(frame);
      const fd = frame.contentDocument!;
      fd.open(); fd.write(html); fd.close();
      await new Promise(r => setTimeout(r, 300));
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    } finally {
      setBusy(false);
    }
  };

  // ── pins ──
  const pagePins = pins.filter(p => p.page === page);
  const placeAt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placing) { setOpen(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    setDraft({ xPct, yPct, text: '' });
    setPlacing(false);
  };
  const saveDraft = async () => {
    if (!draft || !draft.text.trim() || busy) return;
    setBusy(true);
    try {
      const pin = await api.addPin({ apartmentId, planRef, page, xPct: draft.xPct, yPct: draft.yPct, text: draft.text.trim().slice(0, 500) });
      onPinsChange([...pins, pin]);
      setDraft(null);
    } catch {
      setNote(w.pinFailed); setTimeout(() => setNote(''), 5000);
    } finally { setBusy(false); }
  };
  const removePin = async (id: string) => {
    if (!armDelete) { setArmDelete(true); return; }
    setBusy(true);
    try {
      await api.deletePin(id);
      onPinsChange(pins.filter(p => p.id !== id));
      setOpen(null); setArmDelete(false);
    } catch {
      setNote(w.pinFailed); setTimeout(() => setNote(''), 5000);
    } finally { setBusy(false); }
  };

  const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold bg-white/10 hover:bg-white/20 text-white disabled:opacity-40';
  const sheetW = nat ? nat.w * scale : 0, sheetH = nat ? nat.h * scale : 0;

  return (
    <div ref={rootRef} data-shared-plan className={`${full ? 'fixed inset-0 z-[400]' : 'relative h-full'} flex flex-col bg-gray-200`} dir={rtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-[#1e3a5f] flex-shrink-0">
        <button type="button" className={btn} data-plan-pin-add disabled={!doc}
          onClick={() => { setPlacing(v => !v); setDraft(null); setOpen(null); }}
          style={placing ? { backgroundColor: '#2563eb' } : undefined}>
          {placing ? <MapPin size={14} /> : <Plus size={14} />} {placing ? w.tapPlan : w.addPin}
        </button>
        <div className="relative">
          <button type="button" className={btn} data-plan-layers disabled={!doc || isImage} onClick={() => setShowLayers(v => !v)}>
            <Layers size={14} /> {w.layers}{layers.length ? ` (${layers.filter(l => l.on).length}/${layers.length})` : ''}
          </button>
          {showLayers && (
            <div className="absolute z-30 mt-1 w-64 max-h-[60vh] overflow-auto bg-white rounded-xl shadow-xl border border-gray-200 p-2" style={{ insetInlineStart: 0 }}>
              {layers.length === 0 ? <div className="text-xs text-gray-500 p-1">{w.noLayers}</div> : (
                <>
                  <div className="flex gap-1.5 mb-1.5">
                    <button type="button" className="text-[11px] font-semibold px-2 py-1 rounded-md bg-gray-100" onClick={() => setLayer(null, true)}>{w.allOn}</button>
                    <button type="button" className="text-[11px] font-semibold px-2 py-1 rounded-md bg-gray-100" onClick={() => setLayer(null, false)}>{w.allOff}</button>
                  </div>
                  {layers.map(l => (
                    <label key={l.id} className="flex items-center gap-2 px-1 py-1 text-[12.5px] text-gray-800 cursor-pointer">
                      <input type="checkbox" checked={l.on} onChange={e => setLayer(l.id, e.target.checked)} />
                      <span className="truncate">{l.name}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        <span className="flex-1" />
        {doc && doc.numPages > 1 && (
          <span className="inline-flex items-center gap-1 text-white text-[12px]">
            <button type="button" className={btn} disabled={page <= 0} onClick={() => { setPage(p => p - 1); setFit(true); }} aria-label="previous page"><ChevronLeft size={14} className="rtl:rotate-180" /></button>
            {w.page} {page + 1}/{doc.numPages}
            <button type="button" className={btn} disabled={page >= doc.numPages - 1} onClick={() => { setPage(p => p + 1); setFit(true); }} aria-label="next page"><ChevronRight size={14} className="rtl:rotate-180" /></button>
          </span>
        )}
        <button type="button" className={btn} disabled={!doc} onClick={() => zoom(1 / 1.25)} aria-label="zoom out"><Minus size={14} /></button>
        <button type="button" className={btn} disabled={!doc} onClick={() => setFit(true)} title={w.fit}><Scan size={14} /></button>
        <button type="button" className={btn} disabled={!doc} onClick={() => zoom(1.25)} aria-label="zoom in"><Plus size={14} /></button>
        <button type="button" className={btn} onClick={() => void toggleFull()} title={full ? w.exitFullScreen : w.fullScreen}>
          {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button type="button" className={btn} disabled={!doc || busy} onClick={() => void print()} title={w.print}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}<span className="hidden sm:inline">{w.print}</span>
        </button>
        <button type="button" className={btn} disabled={!blob} onClick={download} title={w.download}><Download size={14} /><span className="hidden sm:inline">{w.download}</span></button>
        <button type="button" className={btn} disabled={!blob} onClick={() => void share()} title={w.share}><Share2 size={14} /><span className="hidden sm:inline">{w.share}</span></button>
      </div>

      <div ref={stageRef} className="flex-1 min-h-0 overflow-auto" onWheel={onWheel} onClick={() => setShowLayers(false)}>
        {err ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-600 p-6 text-center">{err}</div>
        ) : !doc || !nat ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            {w.loading}{got.n ? ` ${got.total ? Math.round((got.n / got.total) * 100) + '%' : Math.round(got.n / 1024) + ' KB'}` : ''}
          </div>
        ) : (
          <div className="p-2 flex" style={{ minWidth: sheetW + 16, minHeight: sheetH + 16 }}>
            <div className="relative m-auto bg-white shadow-md" style={{ width: sheetW, height: sheetH }}>
              <canvas ref={canvasRef} style={{ width: sheetW, height: sheetH, display: 'block' }} />
              <div className="absolute inset-0" onClick={placeAt} style={{ cursor: placing ? 'crosshair' : undefined }} data-plan-sheet>
                {pagePins.map(p => (
                  <button key={p.id} type="button" data-viewer-pin={p.id}
                    onClick={e => { e.stopPropagation(); setOpen(open === p.id ? null : p.id); setArmDelete(false); setDraft(null); }}
                    className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center" style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}>
                    <span className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black text-white shadow-md" style={{ backgroundColor: '#2563eb' }}>
                      {pins.indexOf(p) + 1}
                    </span>
                    <span className="w-px h-2" style={{ backgroundColor: '#2563eb' }} />
                  </button>
                ))}
                {open && (() => {
                  const p = pagePins.find(x => x.id === open);
                  if (!p) return null;
                  return (
                    <div onClick={e => e.stopPropagation()} className="absolute z-20 bg-white rounded-xl shadow-2xl border border-gray-200 p-2.5"
                      style={{ left: `min(${p.xPct}%, calc(100% - 252px))`, top: `calc(${p.yPct}% + 8px)`, width: 244 }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-black text-blue-700 flex-1">#{pins.indexOf(p) + 1} · {new Date(p.createdAt).toLocaleDateString()}</span>
                        <button type="button" onClick={() => setOpen(null)} className="p-1 text-gray-400" aria-label={w.cancel}><X size={13} /></button>
                      </div>
                      <p className="text-[12.5px] text-gray-800 whitespace-pre-wrap m-0">{p.text}</p>
                      <div className="flex justify-end mt-1.5">
                        <button type="button" disabled={busy} onClick={() => void removePin(p.id)}
                          className={armDelete ? 'px-2 py-1 rounded-lg text-[11px] font-bold bg-red-600 text-white' : 'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-gray-500 hover:text-red-600'}>
                          {armDelete ? w.reallyRemove : <><Trash2 size={12} /> {w.remove}</>}
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {draft && (
                  <div onClick={e => e.stopPropagation()} className="absolute z-20 bg-white rounded-xl shadow-2xl border border-blue-200 p-2.5"
                    style={{ left: `min(${draft.xPct}%, calc(100% - 260px))`, top: `calc(${draft.yPct}% + 4px)`, width: 252 }}>
                    <span className="absolute w-3 h-3 rounded-full" style={{ backgroundColor: '#2563eb', left: -6, top: -10 }} />
                    <textarea autoFocus rows={3} maxLength={500} value={draft.text} data-viewer-pin-text
                      onChange={e => setDraft({ ...draft, text: e.target.value })}
                      placeholder={w.pinPlaceholder}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    <div className="flex justify-end gap-1.5 mt-1.5">
                      <button type="button" onClick={() => setDraft(null)} className="px-2.5 py-1 rounded-lg text-[12px] text-gray-500">{w.cancel}</button>
                      <button type="button" disabled={!draft.text.trim() || busy} onClick={() => void saveDraft()} data-viewer-pin-save
                        className="px-3 py-1 rounded-lg text-[12px] font-bold text-white bg-blue-600 disabled:opacity-40">
                        {busy ? <Loader2 size={12} className="animate-spin" /> : w.save}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {note && <div className="absolute bottom-3 inset-x-3 mx-auto max-w-md text-center text-[12.5px] bg-gray-900 text-white rounded-lg px-3 py-2 shadow-lg">{note}</div>}
    </div>
  );
}
