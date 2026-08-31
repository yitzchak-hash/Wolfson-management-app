import React, { useEffect, useState } from 'react';
import { Eye, Loader2, Plus, X } from 'lucide-react';
import { readPlanAddress, PlanAddressResult } from '../../data/planAddress';

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

  useEffect(() => {
    setStatus('idle'); setResult(null); setPeek(false);
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
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100">
              <span className="text-[11.5px] text-gray-500 flex-1 min-w-0 truncate" dir="auto">{found}</span>
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
    </div>
  );
}
