import React, { useEffect, useRef, useState } from 'react';
import { Eye, ScanSearch, Loader2, X } from 'lucide-react';
import { readPlanAddress, PlanAddressResult } from '../../data/planAddress';

/**
 * "The plan says the address is …" — under the drawer's Address field.
 *
 * Runs by itself when the field is EMPTY and a plan is linked (that is the
 * moment the reading saves typing), and on the little button any other time.
 * The suggestion is never written silently: the eye opens the CUTOUT of the
 * sheet — the exact part of the drawing the address was read from, rendered
 * big enough to read — and only the Use button writes it. The picture is the
 * ground truth; the text is a convenience that a scan or an odd title block
 * can get wrong, which is the whole reason the secretary confirms.
 */
export function PlanAddressSuggest({ fileId, address, onUse }: {
  fileId: string | null;
  address: string;
  onUse: (v: string) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'reading' | 'done'>('idle');
  const [result, setResult] = useState<PlanAddressResult | null>(null);
  const [peek, setPeek] = useState(false);
  /** Which file the auto-read already ran for — once per plan, never a loop. */
  const autoRan = useRef<string | null>(null);
  /** Whether the last read was asked for by hand — failures then get words. */
  const manual = useRef(false);

  useEffect(() => {
    setStatus('idle'); setResult(null); setPeek(false);
  }, [fileId]);

  const run = (byHand: boolean) => {
    if (!fileId || status === 'reading') return;
    manual.current = byHand;
    setStatus('reading');
    readPlanAddress(fileId).then(r => { setResult(r); setStatus('done'); });
  };

  useEffect(() => {
    if (!fileId || address.trim() || autoRan.current === fileId) return;
    autoRan.current = fileId;
    run(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, address]);

  if (!fileId) return null;

  const found = result?.address;
  const isNew = !!found && found.trim() !== address.trim();

  return (
    <div className="mt-1" data-plan-address>
      {status === 'reading' && (
        <span className="flex items-center gap-1.5 text-[10.5px] text-gray-400">
          <Loader2 size={11} className="animate-spin" /> Reading the plan…
        </span>
      )}

      {status !== 'reading' && found && (
        <span className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="font-semibold" style={{ color: '#15803d' }}>
            On the plan: <span dir="auto">{found}</span>
          </span>
          {result?.cutout && (
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
              className="px-2 py-0.5 rounded-md text-[10.5px] font-bold text-white"
              style={{ backgroundColor: '#4aa8d8' }}
            >
              Use this address
            </button>
          )}
        </span>
      )}

      {/* An auto-read that found nothing stays quiet — a field the secretary
          was going to type anyway must not grow an error. A pressed button
          gets an honest answer. */}
      {status === 'done' && !found && manual.current && (
        <span className="text-[10.5px] text-gray-400">
          {result?.problem === 'no-text'
            ? 'This plan is a scan — there is no text to read from it.'
            : result?.problem === 'unreachable'
              ? 'Could not open the plan.'
              : 'No address found on the plan.'}
        </span>
      )}

      {status !== 'reading' && !found && (
        <button
          type="button"
          onClick={() => run(true)}
          className="flex items-center gap-1 text-[10.5px] font-semibold text-gray-400 hover:text-[#1e3a5f]"
        >
          <ScanSearch size={11} /> Read the address from the plan
        </button>
      )}

      {/* The cutout, big. Above the drawer (z-120), like everything it opens. */}
      {peek && result?.cutout && (
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
                From the plan — check the address against this
              </span>
              <button onClick={() => setPeek(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-auto p-3 bg-slate-50">
              <img src={result.cutout} alt="The part of the plan the address was read from"
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
                  Use this address
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
