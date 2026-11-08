import { Loader2 } from 'lucide-react';
import { useStore } from '../../data/store';
import { useUploads, useBoxShowing } from '../../data/uploadTracker';

/**
 * THE CORNER CARD FOR WHAT IS GOING UP (owner, 2026-11-08: "the second we press OK and upload the picture or video,
 * we don't see like uploading with the progress"). One small card per file at the bottom corner, its name and a bar,
 * gone the moment the file lands — on every office page, whatever started it. A message box shows its own as well,
 * right where the file was picked; this card is for everything else (the file tray, the planner, a plan's pin).
 */
export function UploadToasts() {
  const ups = useUploads();
  const boxes = useBoxShowing();
  const isRtl = useStore(s => s.mainUiStrings.isRtl);
  if (!ups.length || boxes > 0) return null;
  return (
    <div data-upload-toasts className="fixed z-[180] bottom-20 md:bottom-4 end-4 flex flex-col gap-2 pointer-events-none"
      style={{ width: 'min(300px, calc(100vw - 32px))' }} dir={isRtl ? 'rtl' : 'ltr'}>
      {ups.slice(-4).map(u => (
        <div key={u.id} data-upload-toast className="rounded-xl bg-white border border-gray-200 shadow-lg px-3 py-2.5">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-700">
            <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: '#1e3a5f' }} />
            <span className="truncate flex-1" dir="auto">{isRtl ? 'מעלה' : 'Uploading'} · {u.name}</span>
            <span className="tabular-nums flex-shrink-0 text-gray-500">{u.pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-[#4aa8d8] transition-all" style={{ width: `${Math.max(4, u.pct)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
