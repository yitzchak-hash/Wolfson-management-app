import { Loader2 } from 'lucide-react';
import { useStore } from '../../data/store';
import { useUploadBatch, useBoxShowing } from '../../data/uploadTracker';

/**
 * THE CORNER CARD FOR WHAT IS GOING UP (owner, 2026-11-08: "the second we press OK and upload the picture or video,
 * we don't see like uploading with the progress"). ONE card for everything going up together (owner, 2026-11-09:
 * "make the bar of progress show the total number"): "Uploading 2 of 5", the total percent and one bar measured over
 * all the files' bytes, on every office page, whatever started it. A message box shows its own as well, right where
 * the file was picked; this card is for everything else (inspections, the file tray, the planner, a plan's pin).
 */
export function UploadToasts() {
  const b = useUploadBatch();
  const boxes = useBoxShowing();
  const isRtl = useStore(s => s.mainUiStrings.isRtl);
  if (!b || boxes > 0) return null;
  const n = Math.min(b.count, b.done + 1);
  return (
    <div data-upload-toasts className="fixed z-[180] bottom-20 md:bottom-4 end-4 pointer-events-none"
      style={{ width: 'min(300px, calc(100vw - 32px))' }} dir={isRtl ? 'rtl' : 'ltr'}>
      <div data-upload-toast data-upload-count={b.count} data-upload-done={b.done} data-upload-pct={b.pct}
        className="rounded-xl bg-white border border-gray-200 shadow-lg px-3 py-2.5">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-700">
          <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: '#1e3a5f' }} />
          <span className="truncate flex-1">
            {b.count > 1
              ? (isRtl ? `מעלה ${n} מתוך ${b.count}` : `Uploading ${n} of ${b.count}`)
              : (isRtl ? 'מעלה' : 'Uploading')}
          </span>
          <span className="tabular-nums flex-shrink-0 text-gray-500">{b.pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-[#4aa8d8] transition-all" style={{ width: `${Math.max(4, b.pct)}%` }} />
        </div>
        {b.current && <div className="mt-1 text-[11px] text-gray-400 truncate" dir="auto">{b.current}</div>}
      </div>
    </div>
  );
}
