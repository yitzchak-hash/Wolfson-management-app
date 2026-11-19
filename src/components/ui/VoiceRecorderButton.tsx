import { Mic, Trash2, Send, Loader2 } from 'lucide-react';
import { useVoiceRecorder, clock, type RecordedMemo } from '../../data/voiceRecorder';

/**
 * The record button — and, while it runs, the strip with the bin, the timer, the live trace and Send.
 *
 * In a file of its own, importing nothing but the recorder (2026-11-19): the outside SHARED VIEW records a pin's
 * voice note with this very button, and that page may not load VoiceMemo.tsx's player, which reaches the office's
 * Drive helpers and translation. VoiceMemo.tsx re-exports it, so the office's imports are unchanged.
 */
export function VoiceRecorderButton({
  onRecorded, disabled, busy, title = 'Record a voice memo', compact, label, big,
}: {
  onRecorded: (memo: RecordedMemo) => void | Promise<void>;
  disabled?: boolean;
  /** The caller is uploading — keep the control locked and say so. */
  busy?: boolean;
  title?: string;
  compact?: boolean;
  /**
   * Words beside the microphone.
   *
   * A bare grey icon sitting next to a button that SAYS "Attach" reads as
   * decoration — it was reported as "there is no voice option" on a screen
   * where the control was present the whole time. Where the row has room, say
   * what it is.
   */
  label?: string;
  /**
   * The BIG navy microphone at the end of a message box (the worker's phone,
   * owner 2026-09-03) — the familiar one: press to record, the strip with
   * the timer, the bin and Send takes the box's place while it runs.
   */
  big?: boolean;
}) {
  const rec = useVoiceRecorder();
  const recording = rec.state !== 'idle';

  async function finish() {
    const memo = await rec.stop();
    if (memo) await onRecorded(memo);
  }

  if (!recording && big) {
    return (
      <button
        type="button"
        data-big-mic
        onClick={() => { void rec.start(); }}
        disabled={disabled || busy}
        title={rec.error ?? title}
        className="flex items-center justify-center w-11 h-11 rounded-full text-white flex-shrink-0
                   disabled:opacity-40 active:scale-95 transition-transform"
        style={{ backgroundColor: rec.error ? '#dc2626' : '#1e3a5f', boxShadow: '0 6px 14px -6px rgba(30,58,95,.7)' }}
      >
        {busy ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} />}
      </button>
    );
  }
  if (!recording) {
    return (
      <button
        type="button"
        onClick={() => { void rec.start(); }}
        disabled={disabled || busy}
        title={rec.error ?? title}
        className={`flex items-center justify-center rounded-full transition-colors flex-shrink-0
                    ${compact ? 'w-8 h-8' : 'min-w-[36px] min-h-[36px] px-2'}
                    ${label ? 'border border-gray-200 rounded-lg px-2.5' : ''}
                    ${rec.error
                      ? 'text-red-400 hover:bg-red-50'
                      : 'text-gray-500 hover:text-[#1e3a5f] hover:bg-gray-100'}
                    disabled:opacity-40`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
        {label && <span className="ml-1 text-xs font-medium">{label}</span>}
      </button>
    );
  }

  return (
    <div data-recording-strip className="flex items-center gap-2 rounded-full bg-gray-100 border border-gray-200 px-2 py-1 flex-1 min-w-0">
      {/* Throw it away. Deliberately the LEFT-most control and never the one
          nearest the thumb's resting place, so "send" is not the easy miss. */}
      <button
        type="button"
        onClick={rec.cancel}
        title="Discard"
        className="flex items-center justify-center w-8 h-8 rounded-full text-red-500 hover:bg-red-50 flex-shrink-0"
      >
        <Trash2 size={15} />
      </button>

      <span className="flex items-center gap-1 flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[12px] font-semibold text-gray-700 tabular-nums">{clock(rec.seconds)}</span>
      </span>

      <LiveTrace levels={rec.levels} />

      <button
        type="button"
        onClick={() => { void finish(); }}
        disabled={rec.state === 'stopping'}
        title="Send"
        className="flex items-center justify-center w-9 h-9 rounded-full bg-[#1e3a5f] text-white
                   hover:bg-[#162d4a] disabled:opacity-50 flex-shrink-0"
      >
        {rec.state === 'stopping' ? <Loader2 size={14} className="animate-spin" /> : <Send size={15} />}
      </button>
    </div>
  );
}

/** The live level trace while recording — newest bar on the right. */
function LiveTrace({ levels }: { levels: number[] }) {
  return (
    <div className="flex items-center gap-[2px] flex-1 min-w-0 h-6 overflow-hidden justify-end">
      {levels.map((v, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-[#4aa8d8] flex-shrink-0"
          style={{ height: `${Math.max(3, v * 22)}px`, opacity: 0.35 + v * 0.65 }}
        />
      ))}
    </div>
  );
}
