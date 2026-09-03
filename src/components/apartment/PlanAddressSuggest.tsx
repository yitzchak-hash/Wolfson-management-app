import React, { useEffect, useRef, useState } from 'react';
import { Eye, Loader2, Plus, SquareDashedMousePointer, X } from 'lucide-react';
import { readPlanAddress, openRegionReader, PlanAddressResult, RegionReader } from '../../data/planAddress';

type Frac = { x0: number; y0: number; x1: number; y1: number };

/**
 * "Pick it on the plan" — the human override for a reader that guessed wrong.
 *
 * The whole first page, with a box you DRAW over the exact spot the address
 * (or number) really is; the text under the box is read out through the same
 * Hebrew-order machinery the automatic read uses and shown the moment the
 * finger lifts — draw again to redraw, drag inside the box to move it, and
 * Use writes it to the field. Exists because an arbitrary title block will
 * always beat a heuristic some of the time, and the fix for a wrong guess is
 * a person pointing, not a smarter guess.
 */
function RegionPicker({ fileId, kind, onUse, onClose }: {
  fileId: string;
  kind: 'address' | 'phone';
  onUse: (v: string) => void;
  onClose: () => void;
}) {
  const [reader, setReader] = useState<RegionReader | null>(null);
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState<Frac | null>(null);
  const [readText, setReadText] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ mode: 'draw' | 'move'; sx: number; sy: number; at: Frac | null } | null>(null);
  const readerRef = useRef<RegionReader | null>(null);
  /** The live box, for the pointer-up that reads it — updaters stay pure. */
  const boxRef = useRef<Frac | null>(null);
  boxRef.current = box;

  useEffect(() => {
    let dead = false;
    void openRegionReader(fileId).then(r => {
      if (dead) { r?.close(); return; }
      if (!r) { setFailed(true); return; }
      readerRef.current = r;
      setReader(r);
    });
    return () => { dead = true; readerRef.current?.close(); readerRef.current = null; };
  }, [fileId]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation(); e.preventDefault(); onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  const frac = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const inside = (p: { x: number; y: number }, b: Frac) =>
    p.x >= Math.min(b.x0, b.x1) && p.x <= Math.max(b.x0, b.x1)
    && p.y >= Math.min(b.y0, b.y1) && p.y <= Math.max(b.y0, b.y1);

  function onDown(e: React.PointerEvent) {
    if (!reader) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = frac(e);
    // A press inside the drawn box MOVES it; anywhere else starts a fresh one.
    gesture.current = box && inside(p, box)
      ? { mode: 'move', sx: p.x, sy: p.y, at: box }
      : { mode: 'draw', sx: p.x, sy: p.y, at: null };
    if (gesture.current.mode === 'draw') setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    setReadText(null);
  }
  function onMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const p = frac(e);
    if (g.mode === 'draw') {
      setBox({ x0: g.sx, y0: g.sy, x1: p.x, y1: p.y });
    } else if (g.at) {
      const dx = p.x - g.sx, dy = p.y - g.sy;
      setBox({ x0: g.at.x0 + dx, y0: g.at.y0 + dy, x1: g.at.x1 + dx, y1: g.at.y1 + dy });
    }
  }
  function onUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !readerRef.current) return;
    // The pull, RIGHT AWAY — the box has barely been let go of.
    const b = boxRef.current;
    if (b && Math.abs(b.x1 - b.x0) > 0.005 && Math.abs(b.y1 - b.y0) > 0.005) {
      setReadText(readerRef.current.read(b));
    } else {
      setBox(null);   // a stray tap is not a box
      setReadText(null);
    }
  }

  const bx = box && {
    left: `${Math.min(box.x0, box.x1) * 100}%`,
    top: `${Math.min(box.y0, box.y1) * 100}%`,
    width: `${Math.abs(box.x1 - box.x0) * 100}%`,
    height: `${Math.abs(box.y1 - box.y0) * 100}%`,
  };

  return (
    <>
      <div className="fixed inset-0 z-[141]" style={{ backgroundColor: 'rgba(15,23,42,.6)' }} onClick={onClose} />
      <div data-addr-picker className="fixed z-[142] rounded-2xl bg-white overflow-hidden flex flex-col"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(1100px, 96vw)', maxHeight: '92vh',
          boxShadow: '0 24px 60px -16px rgba(15,23,42,.5)',
        }}
        onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
          <span className="text-[13px] font-extrabold text-slate-800 flex-1">
            {kind === 'address' ? 'Draw a box over the ADDRESS on the sheet' : 'Draw a box over the PHONE NUMBER on the sheet'}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-slate-100 p-2">
          {failed ? (
            <p className="text-[12px] text-gray-500 p-6 text-center">
              This sheet has no readable text — it is a scan, a picture of a plan. Type the {kind} in by hand.
            </p>
          ) : !reader ? (
            <p className="flex items-center justify-center gap-2 text-[12px] text-gray-500 p-8">
              <Loader2 size={14} className="animate-spin" /> Preparing the sheet…
            </p>
          ) : (
            <div ref={wrapRef} data-addr-pick-stage className="relative select-none mx-auto"
              style={{ touchAction: 'none', cursor: 'crosshair', maxWidth: '100%' }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <img src={reader.image} alt="The plan's first page" draggable={false}
                className="block w-full h-auto rounded-lg border border-gray-200 bg-white" />
              {bx && (
                <div data-addr-pick-box className="absolute rounded-sm"
                  style={{ ...bx, border: '2.5px solid #4aa8d8', backgroundColor: 'rgba(74,168,216,.14)',
                           boxShadow: '0 0 0 9999px rgba(15,23,42,.18)', cursor: 'move' }} />
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 flex-shrink-0 flex-wrap">
          {readText === null ? (
            <span className="text-[11.5px] text-gray-500 flex-1 min-w-0">
              Drag a box over the exact spot — it reads the moment you let go. Drag inside the box to move it.
            </span>
          ) : readText ? (
            <>
              <span data-addr-pick-read className="text-[12.5px] font-bold flex-1 min-w-0" dir="auto" style={{ color: '#15803d' }}>
                Reads: {readText}
              </span>
              <button data-addr-pick-use
                onClick={() => { onUse(readText); onClose(); }}
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-bold text-white flex-shrink-0"
                style={{ backgroundColor: '#4aa8d8' }}>
                {kind === 'address' ? 'Use this address' : 'Use this number'}
              </button>
            </>
          ) : (
            <span className="text-[11.5px] text-amber-600 flex-1 min-w-0">
              Nothing readable under the box — draw it a little wider around the words.
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * "On the plan: …" — one QUIET row under the drawer's Address and Phone
 * fields, the owner's exact drawing: the label, two dots, the value read off
 * the sheet, the eye that opens the cutout, and a small blue plus that
 * writes it into the field. No standing "read the address" button and no
 * failure sentences — a sheet that gave nothing shows nothing ("there's too
 * much text… I just want on the plan, two dots, and then the address, and
 * then the eyeball icon, and a little plus in the blue").
 *
 * The read runs by itself, once per plan (cached and de-duplicated in
 * `readPlanAddress`, so the address row and the phone row cost one read
 * between them). The suggestion is never written silently: the eye opens the
 * CUTOUT of the sheet — the exact part of the drawing the value was read
 * from, rendered big enough to read — and only the plus writes it. The
 * picture is the ground truth; the text is a convenience an odd title block
 * can get wrong, which is the whole reason the secretary confirms.
 */
export function PlanAddressSuggest({ fileId, kind, current, onUse }: {
  fileId: string | null;
  kind: 'address' | 'phone';
  current: string;
  onUse: (v: string) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'reading' | 'done'>('idle');
  const [result, setResult] = useState<PlanAddressResult | null>(null);
  const [peek, setPeek] = useState(false);
  const [pick, setPick] = useState(false);

  useEffect(() => {
    setStatus('idle'); setResult(null); setPeek(false); setPick(false);
    if (!fileId) return;
    let dead = false;
    setStatus('reading');
    readPlanAddress(fileId).then(r => {
      if (dead) return;
      setResult(r); setStatus('done');
    });
    return () => { dead = true; };
  }, [fileId]);

  if (!fileId) return null;

  const found = kind === 'address' ? result?.address : result?.phone;
  const cutout = kind === 'address' ? result?.cutout : result?.phoneCutout;
  const isNew = !!found && found.trim() !== current.trim();

  // Nothing found, nothing said — the field was going to be typed anyway.
  if (status === 'done' && !found) return null;

  return (
    <div className="mt-1" data-plan-address data-plan-read={kind}>
      {status === 'reading' && (
        <span className="flex items-center gap-1.5 text-[10.5px] text-gray-400">
          <Loader2 size={11} className="animate-spin" /> Reading the plan…
        </span>
      )}

      {status === 'done' && found && (
        <span className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="font-semibold" style={{ color: '#15803d' }}>
            On the plan: <span dir="auto">{found}</span>
          </span>
          {cutout && (
            <button
              type="button"
              data-plan-address-eye
              onClick={() => setPeek(true)}
              title="See this part of the plan"
              className="p-0.5 rounded text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100"
            >
              <Eye size={13} />
            </button>
          )}
          {isNew && (
            <button
              type="button"
              data-plan-address-use
              onClick={() => onUse(found)}
              title={kind === 'address' ? 'Use this address' : 'Use this phone number'}
              className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: '#4aa8d8' }}
            >
              <Plus size={12} strokeWidth={3} />
            </button>
          )}
        </span>
      )}

      {/* The cutout, big. Above the drawer (z-120), like everything it opens. */}
      {peek && cutout && (
        <>
          <div className="fixed inset-0 z-[139]" style={{ backgroundColor: 'rgba(15,23,42,.55)' }}
            onClick={() => setPeek(false)} />
          <div className="fixed z-[140] rounded-2xl bg-white overflow-hidden flex flex-col"
            style={{
              left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
              maxWidth: 'min(760px, 94vw)', maxHeight: '86vh',
              boxShadow: '0 24px 60px -16px rgba(15,23,42,.45)',
            }}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
              <span className="text-[13px] font-extrabold text-slate-800 flex-1">
                From the plan — check it against this
              </span>
              <button onClick={() => setPeek(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-auto p-3 bg-slate-50">
              <img src={cutout} alt="The part of the plan this was read from"
                className="max-w-full rounded-lg border border-gray-200 bg-white" />
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 flex-wrap">
              <span className="text-[11.5px] text-gray-500 flex-1 min-w-0 truncate" dir="auto">{found}</span>
              {/* The human override — when the reader guessed the WRONG spot,
                  the fix is pointing at the right one, not a smarter guess. */}
              <button
                data-addr-pick
                onClick={() => { setPeek(false); setPick(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold flex-shrink-0 hover:bg-gray-100"
                style={{ color: '#1e3a5f', border: '1px solid #c7d4e0' }}
              >
                <SquareDashedMousePointer size={13} /> Not right? Pick it on the plan
              </button>
              {isNew && (
                <button
                  onClick={() => { onUse(found!); setPeek(false); }}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: '#4aa8d8' }}
                >
                  {kind === 'address' ? 'Use this address' : 'Use this number'}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* The draw-a-box override, full sheet. */}
      {pick && (
        <RegionPicker
          fileId={fileId}
          kind={kind}
          onUse={onUse}
          onClose={() => setPick(false)}
        />
      )}
    </div>
  );
}
