import React, { useRef } from 'react';
import { Mic, Paperclip, Send } from 'lucide-react';
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
 * The transcript comes from the server (transcribe.ts) and only when a key
 * is set; with none the memo simply attaches, as it always did.
 */
export type MessageLang = 'en' | 'he' | 'ru';

const WORDS: Record<MessageLang, { placeholder: string; dictate: string; attach: string; record: string; send: string }> = {
  en: { placeholder: 'Your message', dictate: 'Dictate', attach: 'Attach a file', record: 'Record a voice memo', send: 'Send' },
  he: { placeholder: 'ההודעה שלך', dictate: 'הקלדה קולית', attach: 'צירוף קובץ', record: 'הקלטת הודעה קולית', send: 'שליחה' },
  ru: { placeholder: 'Ваше сообщение', dictate: 'Голосовой ввод', attach: 'Прикрепить файл', record: 'Записать голосовое', send: 'Отправить' },
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
  /** Rows for a multi-line box; 1 (default) draws the single-line pill. */
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

export function MessageBox({
  value, onChange, onSend, onAttach, onMemo, onTranscript, lang, placeholder, rows = 1,
  hasPending, onBlur, autoFocus, busy, disabled, accept, className = '', hook, children, fontSize,
}: MessageBoxProps) {
  const L = WORDS[lang ?? 'en'];
  const fileRef = useRef<HTMLInputElement>(null);
  const dictate = useSpeechToText(dictationLocale(lang), text => onChange(text));
  const sendMode = !!onSend;
  const canSend = sendMode && (value.trim().length > 0 || !!hasPending);
  const multi = rows > 1;

  async function recorded(memo: RecordedMemo) {
    if (!onMemo) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target?.result as string);
      r.onerror = reject;
      r.readAsDataURL(memo.blob);
    });
    await onMemo(memo, dataUrl);
    if (onTranscript) {
      void transcribeMemo(dataUrl).then(t => { if (t) onTranscript(t, dataUrl); });
    }
  }

  const hookAttrs = hook ? { [`data-${hook}`]: '' } : {};

  return (
    <div className={`min-w-0 ${className}`} data-message-box {...hookAttrs}>
      {children}
      <div className={`flex gap-2 ${multi ? 'items-end' : 'items-center'}`} data-composer>
        {onAttach && (
          <>
            <button
              type="button"
              data-composer-clip
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:text-[#1e3a5f] flex-shrink-0 disabled:opacity-40"
              title={L.attach}
            >
              <Paperclip size={15} />
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
          className={`flex-1 min-w-0 flex gap-1 bg-white border ps-1.5 pe-3 ${multi ? 'items-start rounded-2xl py-1' : 'items-center rounded-full'}`}
          style={{ borderColor: dictate.listening ? '#4aa8d8' : '#dbe3ec', minHeight: 42 }}
        >
          {dictate.supported && (
            <button
              type="button"
              data-composer-dictate
              onClick={dictate.toggle}
              disabled={disabled}
              title={L.dictate}
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${multi ? 'mt-1' : ''} ${
                dictate.listening ? 'text-white animate-pulse' : 'text-[#1e3a5f]'}`}
              style={{ backgroundColor: dictate.listening ? '#dc2626' : '#eef4fa' }}
            >
              <Mic size={15} />
            </button>
          )}
          {multi ? (
            <textarea
              data-composer-input
              value={value}
              onChange={e => onChange(e.target.value)}
              onBlur={onBlur}
              onKeyDown={e => {
                if (sendMode && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSend) onSend!(); }
              }}
              rows={rows}
              autoFocus={autoFocus}
              disabled={disabled}
              placeholder={placeholder ?? L.placeholder}
              data-enter-own
              className="flex-1 min-w-0 bg-transparent py-2 text-sm focus:outline-none resize-none"
              style={fontSize ? { fontSize } : undefined}
            />
          ) : (
            <input
              data-composer-input
              value={value}
              onChange={e => onChange(e.target.value)}
              onBlur={onBlur}
              onKeyDown={e => {
                if (sendMode && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSend) onSend!(); }
              }}
              autoFocus={autoFocus}
              disabled={disabled}
              placeholder={placeholder ?? L.placeholder}
              data-enter-own={sendMode ? '' : undefined}
              className="flex-1 min-w-0 bg-transparent py-2 text-sm focus:outline-none"
              style={fontSize ? { fontSize } : undefined}
            />
          )}
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
          <VoiceRecorderButton big busy={busy} disabled={disabled} onRecorded={recorded} title={L.record} />
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
