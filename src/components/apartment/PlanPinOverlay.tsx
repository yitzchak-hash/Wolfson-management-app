import React, { useMemo, useState } from 'react';
import { MapPin, Check, X, Printer, Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { PlanPin } from '../../types';

/**
 * Punch-list pins drawn OVER the engineering plan.
 *
 * The PDF itself is never modified. Pins are coordinates stored against the
 * apartment and drawn as an overlay, so the office viewer and the contractor
 * portal render identical markup from the same data and the original file in
 * Drive stays clean. Anyone who downloads the plan gets the plan.
 *
 * The overlay is `pointer-events: none` unless placing is armed, so the PDF
 * scrolls and zooms normally the rest of the time — otherwise the pins would
 * make the viewer unusable.
 *
 * `readOnly` is what the contractor portal passes: it sees the same pins and can
 * read them, but the punch list is the office's to write.
 */
export function PlanPinOverlay({
  apartmentId, apartmentLabel, readOnly = false, authorName = '',
}: {
  apartmentId: string;
  apartmentLabel: string;
  readOnly?: boolean;
  authorName?: string;
}) {
  const { planPins, addPlanPin, updatePlanPin, deletePlanPin } = useStore();
  const [placing, setPlacing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const pins = useMemo(
    () => planPins
      .filter(p => p.apartmentId === apartmentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [planPins, apartmentId],
  );

  const openPins = pins.filter(p => !p.resolvedAt);

  function place(e: React.MouseEvent<HTMLDivElement>) {
    if (!placing) return;
    const r = e.currentTarget.getBoundingClientRect();
    const id = 'PIN-' + Date.now().toString(36);
    addPlanPin({
      id,
      apartmentId,
      // Percentages, so a pin holds its spot at any viewer size or screen.
      xPct: ((e.clientX - r.left) / r.width) * 100,
      yPct: ((e.clientY - r.top) / r.height) * 100,
      text: '',
      createdAt: new Date().toISOString(),
      createdBy: authorName,
    });
    setPlacing(false);
    setOpen(id);
    setDraft('');
  }

  /**
   * A printable punch list.
   *
   * Deliberately a numbered sheet rather than a re-rendered PDF: the plan lives
   * in Drive and is not ours to rewrite, and a browser cannot read a
   * cross-origin PDF's pixels to burn pins into it. The sheet carries each pin's
   * number, its note and its position on the plan, which is what someone
   * standing on site with a printout actually needs.
   */
  function printPunchList() {
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = pins.map((p, i) => `
      <tr>
        <td class="n">${i + 1}</td>
        <td>${(p.text || '—').replace(/</g, '&lt;')}</td>
        <td class="pos">${p.xPct.toFixed(0)}% / ${p.yPct.toFixed(0)}%</td>
        <td class="st">${p.resolvedAt ? 'Done' : 'Open'}</td>
      </tr>`).join('');
    w.document.write(`
      <!doctype html><title>Punch list — ${apartmentLabel}</title>
      <style>
        body{font:13px/1.5 Segoe UI,Helvetica,Arial,sans-serif;margin:28px;color:#111827}
        h1{font-size:18px;margin:0 0 2px}
        .sub{color:#6b7280;font-size:11px;margin-bottom:16px}
        table{border-collapse:collapse;width:100%}
        th{text-align:left;font-size:10px;letter-spacing:.04em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding:6px 8px}
        td{border-bottom:1px solid #f3f4f6;padding:7px 8px;vertical-align:top}
        .n{width:28px;font-weight:800;color:#1e3a5f}
        .pos,.st{width:88px;color:#6b7280;font-size:11px;white-space:nowrap}
      </style>
      <h1>Punch list — ${apartmentLabel}</h1>
      <div class="sub">${pins.length} item${pins.length === 1 ? '' : 's'} ·
        printed ${new Date().toLocaleString()} ·
        positions are given as a percentage across and down the plan</div>
      <table><tr><th>#</th><th>Item</th><th>On plan</th><th>Status</th></tr>${rows}</table>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 200);
  }

  return (
    <>
      {/* Overlay. Transparent to the pointer unless placing is armed, so the
          plan behind it keeps working. */}
      <div
        onClick={place}
        className="absolute inset-0"
        style={{ pointerEvents: placing ? 'auto' : 'none', cursor: placing ? 'crosshair' : undefined }}
      >
        {pins.map((p, i) => (
          <button
            key={p.id}
            onClick={e => { e.stopPropagation(); setOpen(open === p.id ? null : p.id); setDraft(p.text); }}
            title={p.text || `Item ${i + 1}`}
            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
            style={{ left: `${p.xPct}%`, top: `${p.yPct}%`, pointerEvents: 'auto' }}
          >
            <span
              className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black text-white shadow-md"
              style={{ backgroundColor: p.resolvedAt ? '#94a3b8' : '#dc2626' }}
            >
              {i + 1}
            </span>
            <span className="w-px h-2" style={{ backgroundColor: p.resolvedAt ? '#94a3b8' : '#dc2626' }} />
          </button>
        ))}

        {/* Note bubble for the selected pin. */}
        {open && (() => {
          const p = pins.find(x => x.id === open);
          if (!p) return null;
          return (
            <div
              onClick={e => e.stopPropagation()}
              className="absolute z-20 bg-white rounded-xl shadow-2xl border border-gray-200 p-2.5"
              style={{
                left: `min(${p.xPct}%, calc(100% - 232px))`,
                top: `calc(${p.yPct}% + 8px)`,
                width: 224,
                pointerEvents: 'auto',
              }}
            >
              {readOnly ? (
                <p className="text-[12px] text-gray-700 whitespace-pre-wrap">{p.text || 'No note'}</p>
              ) : (
                <textarea
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => updatePlanPin(p.id, { text: draft })}
                  rows={3}
                  placeholder="What needs doing here?"
                  className="w-full text-[12px] border border-gray-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#1e3a5f]/25 resize-none"
                />
              )}
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[9.5px] text-gray-400 flex-1 truncate">
                  {p.createdBy || 'Office'} · {new Date(p.createdAt).toLocaleDateString()}
                </span>
                {!readOnly && (
                  <>
                    <button
                      onClick={() => updatePlanPin(p.id, p.resolvedAt
                        ? { resolvedAt: undefined, resolvedBy: undefined }
                        : { resolvedAt: new Date().toISOString(), resolvedBy: authorName })}
                      title={p.resolvedAt ? 'Reopen' : 'Mark done'}
                      className="p-1 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={() => { deletePlanPin(p.id); setOpen(null); }}
                      title="Remove this pin"
                      className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50"
                    >
                      <X size={13} />
                    </button>
                  </>
                )}
                {readOnly && (
                  <button onClick={() => setOpen(null)} className="p-1 rounded-md text-gray-400"><X size={13} /></button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Controls, above the viewer. */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
        {!readOnly && (
          <button
            onClick={() => { setPlacing(v => !v); setOpen(null); }}
            title={placing ? 'Click the plan to drop a pin' : 'Add a punch-list pin'}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold shadow-sm border transition-colors"
            style={placing
              ? { backgroundColor: '#dc2626', color: '#fff', borderColor: '#dc2626' }
              : { backgroundColor: 'rgba(255,255,255,.94)', color: '#374151', borderColor: '#e5e7eb' }}
          >
            {placing ? <MapPin size={12} /> : <Plus size={12} />}
            {placing ? 'Click the plan' : 'Pin'}
          </button>
        )}
        {pins.length > 0 && (
          <>
            <span
              className="px-2 py-1 rounded-lg text-[11px] font-bold shadow-sm border border-gray-200"
              style={{ backgroundColor: 'rgba(255,255,255,.94)', color: openPins.length ? '#b91c1c' : '#166534' }}
            >
              {openPins.length ? `${openPins.length} open` : 'All done'}
            </span>
            <button
              onClick={printPunchList}
              title="Print the punch list"
              className="p-1.5 rounded-lg shadow-sm border border-gray-200"
              style={{ backgroundColor: 'rgba(255,255,255,.94)', color: '#374151' }}
            >
              <Printer size={12} />
            </button>
          </>
        )}
      </div>
    </>
  );
}
