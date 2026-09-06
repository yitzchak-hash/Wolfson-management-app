import React, { useLayoutEffect, useRef, useState } from 'react';
import { Mic, Paperclip, Send, Loader2 } from 'lucide-react';
import { VoiceRecorderButton } from './VoiceMemo';
import { useSpeechToText } from '../../data/voiceSearch';
import { transcribeMemo } from '../../data/transcribe';
import type { RecordedMemo } from '../../data/voiceMemo';

/**
 * THE message box — the one way anything is written in this app.
 *
 * The composer the worker's phone got (owner, 2026-09-03) lifted out so every
 * other input can be it (owner, 2026-09-06: "tasks and all the other input
 * fields should work the same way as the WhatsApp notes"): the paperclip at
 * the start, the box with the DICTATION mic inside it at the left (the
 * browser's speech recognition — words land in the box for you to fix), and
 * at the end the big navy mic that RECORDS a memo — which becomes the Send
 * arrow the moment there is something to send.
 *
 * Two manners, decided by whether the host hands over `onSend`:
 *  - SEND mode (a thread, a stage's notes): the box is one message; Enter or
 *    the arrow sends it and the host clears the text.
 *  - FIELD mode (a task description, the general notes, a pin's note): the
 *    box IS the field — it commits through onChange/onBlur like the plain
 *    input it replaced, the big mic is always there, and a recording's
 *    words are handed back through `onTranscript` so an empty field can take
 *    them as its text (a memo sent as a task description IS the description).
 *
 * The box GROWS with what is typed (one line up to six) so the clip and the
 * mic always sit on its bottom line — a fixed tall box left the mic floating
 * halfway up and the clip at the foot, which the owner read as misaligned.
 * While a recording uploads, a grey "sending" bubble stands where the memo
 * will appear, so the seconds it takes never look like nothing happening.
 *
 * The transcript comes from the server (transcribe.ts) and only when a key
 * is set; with none the memo simply attaches, as it always did.
 */
export type MessageLang = 'en' | 'he' | 'ru';

const WORDS: Record<MessageLang, { placeholder: string; dictate: string; attach: string; record: string; send: string; sending: string }> = {
  en: { placeholder: 'Your message', dictate: 'Dictate', attach: 'Attach a file', record: 'Record a voice memo', send: 'Send', sending: 'Sending the recording…' },
  he: { placeholder: 'ההודעה שלך', dictate: 'הקלדה קולית', attach: 'צירוף קובץ', record: 'הקלטת הודעה קולית', send: 'שליחה', sending: 'שולח את ההקלטה…' },
  ru: { placeholder: 'Ваше сообщение', dictate: 'Голосовой ввод', attach: 'Прикрепить файл', record: 'Записать голосовое', send: 'Отправить', sending: 'Отправляю запись…' },
};

export const dictationLocale = (lang: MessageLang | null | undefined) =>
  lang === 'he' ? 'he-IL' : lang === 'ru' ? 'ru-RU' : 'en-US';

export interface MessageBoxProps {
  value: string;
  onChange: (v: string) => void;
  /** Present → SEND mode. */
  onSend?: () => void;
  /** Files picked with the paperclip; absent → no paperclip. */
  onAttach?: (files: File[]) => void | Promise<void>;
  /** The big mic's recording; absent → no mic. `dataUrl` is the memo's bytes, ready to attach. */
  onMemo?: (memo: RecordedMemo, dataUrl: string) => void | Promise<void>;
  /** The recording's words, when the server has them (FIELD mode's "becomes the text"). */
  onTranscript?: (text: string, dataUrl: string) => void;
  lang?: MessageLang | null;
  placeholder?: string;
  /** The box's SMALLEST height in lines; it grows to six as you type. */
  rows?: number;
  /** SEND mode: the arrow shows when this is true even with no text (pending attachments). */
  hasPending?: boolean;
  onBlur?: () => void;
  autoFocus?: boolean;
  busy?: boolean;
  disabled?: boolean;
  accept?: string;
  className?: string;
  /** A `data-*` hook name for the box's root, for harnesses. */
  hook?: string;
  /** Anything drawn INSIDE the panel above the row — pending attachments, a memo preview. */
  children?: React.ReactNode;
  /** Text size of the input (the phone scales up). */
  fontSize?: number;
}

const LINE = 20;
const MAX_LINES = 6;

export function MessageBox({
  value, onChange, onSend, onAttach, onMemo, onTranscript, lang, placeholder, rows = 1,
  hasPending, onBlur, autoFocus, busy, disabled, accept, className = '', hook, children, fontSize,
}: MessageBoxProps) {
  const L = WORDS[lang ?? 'en'];
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const dictate = useSpeechToText(dictationLocale(lang), text => onChange(text));
  const sendMode = !!onSend;
  const canSend = sendMode && (value.trim().length > 0 || !!hasPending);
  const [sending, setSending] = useState(false);

  // Grow with the words — measured, never guessed, so a pasted paragraph and a
  // one-word reply both sit right; capped at six lines, after which it scrolls.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = '0px';
    const min = Math.max(1, rows) * LINE;
    const h = Math.max(min, Math.min(MAX_LINES * LINE, el.scrollHeight));
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > h + 2 ? 'auto' : 'hidden';
  }, [value, rows, fontSize]);

  async function recorded(memo: RecordedMemo) {
    if (!onMemo) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target?.result as string);
      r.onerror = reject;
      r.readAsDataURL(memo.blob);
    });
    setSending(true);
    try {
      await onMemo(memo, dataUrl);
    } finally {
      setSending(false);
    }
    if (onTranscript) {
      void transcribeMemo(dataUrl).then(t => { if (t) onTranscript(t, dataUrl); });
    }
  }

  const hookAttrs = hook ? { [`data-${hook}`]: '' } : {};
  const multiLook = rows > 1;

  return (
    <div className={`min-w-0 ${className}`} data-message-box {...hookAttrs}>
      {children}
      {sending && (
        <div data-memo-sending className="mb-2 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] font-semibold"
          style={{ backgroundColor: '#f3f6fa', border: '1px solid #e2e8f0', color: '#64748b' }}>
          <Loader2 size={14} className="animate-spin" style={{ color: '#1e3a5f' }} />
          {L.sending}
        </div>
      )}
      <div className="flex gap-2 items-end" data-composer>
        {onAttach && (
          <>
            <button
              type="button"
              data-composer-clip
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:text-[#1e3a5f] flex-shrink-0 disabled:opacity-40"
              title={L.attach}
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={fileRef} type="file" multiple className="hidden"
              accept={accept ?? 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx'}
              onChange={e => {
                // Copy FIRST: a file input's list is live, and clearing the
                // value empties it (the File Tray's paid-for trap).
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (files.length) void onAttach(files);
              }}
            />
          </>
        )}
        <div
          className={`flex-1 min-w-0 flex items-end gap-1 bg-white border ps-1 pe-3 ${multiLook ? 'rounded-2xl' : 'rounded-[22px]'}`}
          style={{ borderColor: dictate.listening ? '#4aa8d8' : '#dbe3ec', minHeight: 44, paddingTop: 3, paddingBottom: 3 }}
        >
          {dictate.supported && (
            <button
              type="button"
              data-composer-dictate
              onClick={dictate.toggle}
              disabled={disabled}
              title={L.dictate}
              className={`w-9 h-9 mb-[0.5px] rounded-full flex items-center justify-center flex-shrink-0 ${
                dictate.listening ? 'text-white animate-pulse' : 'text-[#1e3a5f]'}`}
              style={{ backgroundColor: dictate.listening ? '#dc2626' : '#eef4fa' }}
            >
              <Mic size={16} />
            </button>
          )}
          <textarea
            ref={areaRef}
            data-composer-input
            value={value}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            onKeyDown={e => {
              if (sendMode && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSend) onSend!(); }
            }}
            rows={1}
            autoFocus={autoFocus}
            disabled={disabled}
            placeholder={placeholder ?? L.placeholder}
            data-enter-own
            className="flex-1 min-w-0 bg-transparent py-[9px] ps-1 text-sm focus:outline-none resize-none leading-5"
            style={{ fontSize: fontSize ?? 14, lineHeight: `${LINE}px` }}
          />
        </div>
        {canSend ? (
          <button
            type="button"
            data-composer-send
            onClick={onSend}
            disabled={disabled || busy}
            title={L.send}
            className="w-11 h-11 flex items-center justify-center rounded-full text-white transition-all active:scale-95 flex-shrink-0 disabled:opacity-40"
            style={{ backgroundColor: '#4aa8d8', boxShadow: '0 6px 14px -6px rgba(74,168,216,.7)' }}
          >
            <Send size={18} />
          </button>
        ) : onMemo ? (
          <VoiceRecorderButton big busy={busy || sending} disabled={disabled} onRecorded={recorded} title={L.record} />
        ) : null}
      </div>
    </div>
  );
}

/** A recording as the ordinary audio FILE every attachment path already carries. */
export function memoFile(memo: RecordedMemo): File {
  const ext = memo.blob.type.includes('mp4') ? 'm4a' : 'webm';
  return new File([memo.blob], `voice-memo-${Date.now()}.${ext}`, { type: memo.blob.type || 'audio/webm' });
}
