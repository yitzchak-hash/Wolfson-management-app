import React, { useLayoutEffect, useRef } from 'react';
import { Mic, Paperclip, Square } from 'lucide-react';
import { useDictation } from '../../data/dictation';
import type { RecordedMemo } from '../../data/voiceRecorder';
import { VoiceRecorderButton } from './VoiceRecorderButton';
import { LiveWave } from './LiveWave';

/**
 * The pin's writing box for the OUTSIDE shared link — the office's message box (MessageBox.tsx) in look and manner:
 * the paperclip at the start, the box with the DICTATION mic inside it (the browser's speech-to-text; the words are
 * added to what is typed, in Hebrew or English as the page is), and the big navy mic at the end that RECORDS a voice
 * note (owner, 2026-11-19: "a recording, and attachments, and an inline mic to talk speech-to-text").
 *
 * Its own file because MessageBox reaches the office's cloud preferences (and through them Firebase), which the
 * outside page may never load. This one imports only the dictation, the recorder and the live line.
 */

/** What an outside pin may carry — the same list the server allows (lib/sharedView.js PIN_FILE_TYPES). */
export const PIN_ATTACH_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav',
];
/** Vercel refuses a request over 4.5 MB: one attachment is at most 4 MB (big photos are made smaller first). */
export const PIN_ATTACH_MAX_BYTES = 4 * 1024 * 1024;
export const PIN_ATTACH_ACCEPT = 'image/*,application/pdf,audio/*';

const BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
  heif: 'image/heif', pdf: 'application/pdf', webm: 'audio/webm', ogg: 'audio/ogg', m4a: 'audio/x-m4a', mp4: 'audio/mp4',
  aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav',
};
/** The file's type as the server will check it, or null when it is not one a pin may carry. */
export function pinAttachType(f: File | Blob, name = (f as File).name ?? ''): string | null {
  let t = (f.type || '').split(';')[0].trim().toLowerCase();
  if (!t) t = BY_EXT[(name.split('.').pop() ?? '').toLowerCase()] ?? '';
  if (t === 'video/webm') t = 'audio/webm';    // some browsers call a voice recording "video"
  return PIN_ATTACH_TYPES.includes(t) ? t : null;
}

/** A recording as an ordinary file. */
export function recordingFile(memo: RecordedMemo): File {
  const type = (memo.blob.type || 'audio/webm').split(';')[0];
  const ext = type.includes('mp4') ? 'm4a' : type.includes('mpeg') ? 'mp3' : type.includes('ogg') ? 'ogg' : 'webm';
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
  return new File([memo.blob], `Voice note ${stamp}.${ext}`, { type });
}

/**
 * A phone photo is often over the 4 MB a link may send: draw it again, at most 2560 px across, as a JPEG. Anything
 * the browser cannot draw (HEIC on most computers), or that is small already, is left as it is.
 */
export async function shrinkPhoto(f: File, over = 3.5 * 1024 * 1024): Promise<File> {
  if (f.size <= over || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type)) return f;
  try {
    const bmp = await createImageBitmap(f);
    const s = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const ctx = c.getContext('2d');
    if (!ctx) return f;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return f;
  }
}

const LINE = 20;
const MAX_LINES = 6;

export function PinComposer({
  value, onChange, onFiles, onMemo, lang, placeholder, rows = 2, autoFocus, busy, disabled, maxLength,
  words, hook,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Files picked with the paperclip. Absent → no paperclip. */
  onFiles?: (files: File[]) => void;
  /** A finished recording. Absent → no big mic. */
  onMemo?: (memo: RecordedMemo) => void;
  lang: 'he' | 'en';
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  busy?: boolean;
  disabled?: boolean;
  maxLength?: number;
  words: { attach: string; dictate: string; record: string; stop: string };
  /** A `data-*` name put on the text box itself, for harnesses. */
  hook?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(value); valueRef.current = value;
  const cap = (t: string) => (maxLength ? t.slice(0, maxLength) : t);
  // Keeps listening until Stop, and ADDS to what is already typed (dictation.ts).
  const dictate = useDictation(lang === 'he' ? 'he-IL' : 'en-US', () => valueRef.current, t => onChange(cap(t)));

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = '0px';
    const min = Math.max(1, rows) * LINE;
    const h = Math.max(min, Math.min(MAX_LINES * LINE, el.scrollHeight));
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > h + 2 ? 'auto' : 'hidden';
  }, [value, rows]);

  const hookAttrs = hook ? { [`data-${hook}`]: '' } : {};
  return (
    <div className="min-w-0" data-message-box data-pin-composer>
      <div className="flex gap-1.5 items-end" data-composer>
        {onFiles && (
          <>
            <button type="button" data-composer-clip onClick={() => fileRef.current?.click()} disabled={disabled || busy}
              title={words.attach} aria-label={words.attach}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:text-[#1e3a5f] flex-shrink-0 disabled:opacity-40">
              <Paperclip size={16} />
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" accept={PIN_ATTACH_ACCEPT}
              onChange={e => {
                // Copy FIRST: a file input's list is live, and clearing the value empties it.
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (files.length) onFiles(files);
              }} />
          </>
        )}
        <div className={`flex-1 min-w-0 flex flex-wrap items-end gap-1 bg-white border ps-1 pe-2 ${rows > 1 || dictate.listening ? 'rounded-2xl' : 'rounded-[22px]'}`}
          style={{ borderColor: dictate.listening ? '#4aa8d8' : '#dbe3ec', minHeight: 44, paddingTop: 3, paddingBottom: 3 }}>
          {dictate.listening && (
            <div data-dictate-live className="basis-full flex items-center gap-2 ps-2 pt-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: '#dc2626' }} />
              <div className="flex-1 min-w-0"><LiveWave level={dictate.level} color="#4aa8d8" height={24} /></div>
            </div>
          )}
          {dictate.supported && (
            <button type="button" data-composer-dictate
              onClick={() => (dictate.listening ? dictate.stop() : dictate.start())}
              disabled={disabled}
              title={dictate.listening ? words.stop : words.dictate} aria-label={dictate.listening ? words.stop : words.dictate}
              className={`w-9 h-9 mb-[0.5px] rounded-full flex items-center justify-center flex-shrink-0 ${dictate.listening ? 'text-white' : 'text-[#1e3a5f]'}`}
              style={{ backgroundColor: dictate.listening ? '#dc2626' : '#eef4fa' }}>
              {dictate.listening ? <Square size={13} fill="currentColor" /> : <Mic size={16} />}
            </button>
          )}
          <textarea ref={areaRef} data-composer-input {...hookAttrs} value={value} rows={1} autoFocus={autoFocus} disabled={disabled}
            maxLength={maxLength} placeholder={placeholder} dir="auto"
            onChange={e => onChange(cap(e.target.value))}
            className="flex-1 min-w-0 bg-transparent py-[9px] ps-1 text-[13px] focus:outline-none resize-none leading-5"
            style={{ lineHeight: `${LINE}px` }} />
        </div>
        {onMemo && !dictate.listening && (
          <VoiceRecorderButton big busy={busy} disabled={disabled} onRecorded={onMemo} title={words.record} />
        )}
      </div>
    </div>
  );
}
