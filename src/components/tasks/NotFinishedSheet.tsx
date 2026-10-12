import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, CalendarDays, HelpCircle, ArrowRight, Hourglass } from 'lucide-react';
import { comeBackDay, daysBetween } from '../../data/notFinished';
import { parseDay } from '../../data/taskDays';

/**
 * "Not finished today" — ONE screen for the worker's phone and the office's
 * window (owner, 2026-10-11, "build it" on all the starred answers): what he
 * finished today (only when the task has more than one stage), what is left
 * (the host's own message box — so a memo, a picture and dictation work the
 * way they do everywhere else), and when he is coming back. The host writes;
 * this only asks.
 *
 * Portalled to the body at z-[130]/[140] (the drawer rule: anything the
 * drawer opens sits above its z-[120]); its events are sealed so a press
 * inside never reaches whatever hosts it; Escape is taken in the capture
 * phase so closing this never closes the window behind it.
 */

export type NfLang = 'en' | 'he' | 'ru';

const WORDS = {
  en: {
    title: 'Not finished today', finished: 'What did you finish today?', finishedHint: 'Tap the ones you finished. The rest stay half done.',
    left: "What's left?", leftHint: 'Say it or type it — the office reads it in its own language.',
    when: 'When are you coming back?', tomorrow: 'Tomorrow', pick: 'Pick a day', unknown: "I don't know yet",
    unknownHint: 'The office will set the day.', send: 'Send to the office', cancel: 'Cancel',
    officeTitle: 'Not finished', officeLeft: "What's left? (optional)", officeWhen: 'When is he coming back?',
  },
  he: {
    title: 'לא סיימתי היום', finished: 'מה סיימת היום?', finishedHint: 'סמן את מה שסיימת. השאר יישאר חצי גמור.',
    left: 'מה נשאר?', leftHint: 'תגיד או תכתוב — המשרד יקרא בשפה שלו.',
    when: 'מתי אתה חוזר?', tomorrow: 'מחר', pick: 'בחר יום', unknown: 'עוד לא יודע',
    unknownHint: 'המשרד יקבע את היום.', send: 'שלח למשרד', cancel: 'ביטול',
    officeTitle: 'לא הסתיים', officeLeft: 'מה נשאר? (לא חובה)', officeWhen: 'מתי הוא חוזר?',
  },
  ru: {
    title: 'Сегодня не закончил', finished: 'Что ты закончил сегодня?', finishedHint: 'Отметь, что закончил. Остальное останется наполовину.',
    left: 'Что осталось?', leftHint: 'Скажи или напиши — офис прочитает на своём языке.',
    when: 'Когда ты вернёшься?', tomorrow: 'Завтра', pick: 'Выбрать день', unknown: 'Пока не знаю',
    unknownHint: 'Офис назначит день.', send: 'Отправить в офис', cancel: 'Отмена',
    officeTitle: 'Не закончено', officeLeft: 'Что осталось? (по желанию)', officeWhen: 'Когда он вернётся?',
  },
} as const;

const LOCALE: Record<NfLang, string> = { en: 'en-GB', he: 'he-IL', ru: 'ru-RU' };

export interface NfStage { id: string; name: string; color: string }

export function NotFinishedSheet({
  lang, today, aptLabel, stages, composer, busy, office, onSubmit, onClose,
}: {
  lang: NfLang;
  /** Local yyyy-MM-dd. */
  today: string;
  aptLabel: string;
  /** The task's own stages, named in the reader's language. */
  stages: NfStage[];
  /** The host's message box (text, memo, files). */
  composer: React.ReactNode;
  busy?: boolean;
  /** Asked by the office for a worker — "he", not "you". */
  office?: boolean;
  onSubmit: (finishedIds: string[], next: string | null) => void;
  onClose: () => void;
}) {
  const W = WORDS[lang] ?? WORDS.en;
  const rtl = lang === 'he';
  const [finished, setFinished] = useState<string[]>([]);
  const [when, setWhen] = useState<'tomorrow' | 'pick' | 'unknown' | null>(null);
  const [picked, setPicked] = useState('');
  const back = useMemo(() => comeBackDay(today), [today]);
  const nice = (iso: string) => parseDay(iso).toLocaleDateString(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short' });
  // "Tomorrow" when it really is tomorrow; on a Thursday the next working day
  // is Sunday, and the button says Sunday.
  const backLabel = daysBetween(today, back) === 1
    ? W.tomorrow
    : parseDay(back).toLocaleDateString(LOCALE[lang], { weekday: 'long' });
  const minPick = useMemo(() => {
    const d = parseDay(today); d.setDate(d.getDate() + 1);
    const t = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return t.toISOString().slice(0, 10);
  }, [today]);

  const next = when === 'tomorrow' ? back : when === 'pick' ? (picked && picked > today ? picked : '') : when === 'unknown' ? null : '';
  const ready = when !== null && next !== '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation(); e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const seal = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
    onWheel: (e: React.WheelEvent) => e.stopPropagation(),
  };

  const whenBtn = (key: 'tomorrow' | 'pick' | 'unknown', icon: React.ReactNode, label: string, sub?: string) => (
    <button type="button" data-nf-when={key} data-on={when === key ? '1' : undefined}
      onClick={() => setWhen(key)}
      className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
      style={{
        border: `2px solid ${when === key ? '#d97706' : '#e2e8f0'}`,
        backgroundColor: when === key ? '#fffbeb' : '#fff',
      }}>
      <span className="flex-shrink-0" style={{ color: when === key ? '#b45309' : '#64748b' }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[15px] text-gray-900">{label}</span>
        {sub && <span className="block text-[12.5px] text-gray-500">{sub}</span>}
      </span>
      {when === key && <Check size={18} style={{ color: '#b45309' }} />}
    </button>
  );

  return createPortal(
    <div {...seal} dir={rtl ? 'rtl' : 'ltr'} data-not-finished
      className="fixed inset-0 z-[130] flex items-stretch sm:items-center justify-center bg-black/45">
      <div className="relative z-[140] bg-white w-full sm:max-w-[560px] h-full sm:h-auto sm:max-h-[92vh] sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 flex-shrink-0 text-white" style={{ background: 'linear-gradient(135deg, #b45309, #d97706)' }}>
          <Hourglass size={20} className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-extrabold leading-tight" style={{ fontSize: 17 }}>{office ? W.officeTitle : W.title}</div>
            <div className="truncate opacity-80" style={{ fontSize: 12.5 }}>{aptLabel}</div>
          </div>
          <button type="button" data-nf-close onClick={onClose} title={W.cancel} className="p-1.5 rounded-lg hover:bg-white/15 flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6" style={{ overscrollBehavior: 'contain' }}>
          {stages.length > 1 && (
            <section data-nf-finished>
              <h3 className="font-extrabold text-gray-900 text-[16px] mb-1">{W.finished}</h3>
              <p className="text-[12.5px] text-gray-500 mb-2.5">{W.finishedHint}</p>
              <div className="flex flex-wrap gap-2">
                {stages.map(st => {
                  const on = finished.includes(st.id);
                  return (
                    <button type="button" key={st.id} data-nf-stage={st.id} data-on={on ? '1' : undefined}
                      onClick={() => setFinished(f => (on ? f.filter(x => x !== st.id) : [...f, st.id]))}
                      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-bold transition-colors"
                      style={{
                        border: `2px solid ${on ? '#16a34a' : st.color}`,
                        backgroundColor: on ? '#dcfce7' : '#fff',
                        color: on ? '#15803d' : '#334155',
                      }}>
                      {on ? <Check size={15} strokeWidth={3} /> : <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />}
                      {st.name}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section data-nf-left>
            <h3 className="font-extrabold text-gray-900 text-[16px] mb-1">{office ? W.officeLeft : W.left}</h3>
            {!office && <p className="text-[12.5px] text-gray-500 mb-2.5">{W.leftHint}</p>}
            {composer}
          </section>

          <section data-nf-when-q>
            <h3 className="font-extrabold text-gray-900 text-[16px] mb-2.5">{office ? W.officeWhen : W.when}</h3>
            <div className="space-y-2">
              {whenBtn('tomorrow', <ArrowRight size={20} />, backLabel, nice(back))}
              {whenBtn('pick', <CalendarDays size={20} />, W.pick, when === 'pick' && picked > today ? nice(picked) : undefined)}
              {when === 'pick' && (
                <input type="date" data-nf-date min={minPick} value={picked}
                  onChange={e => setPicked(e.target.value)}
                  className="w-full rounded-xl border-2 border-amber-300 px-3 py-2.5 text-[15px] font-semibold" />
              )}
              {whenBtn('unknown', <HelpCircle size={20} />, W.unknown, W.unknownHint)}
            </div>
          </section>
        </div>

        <div className="px-4 py-3.5 border-t border-gray-100 flex-shrink-0 bg-white">
          <button type="button" data-nf-send disabled={!ready || busy}
            onClick={() => { if (ready) onSubmit(finished, next === '' ? null : next); }}
            className="w-full py-3.5 rounded-xl text-base font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #b45309, #d97706)' }}>
            {W.send}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The amber words for the notebook tile / task cards / the morning question, by reading language. */
export function unfinishedWords(lang?: string) {
  if (lang === 'he') return {
    tag: 'לא הסתיים', needs: 'צריך יום חדש', btn: 'לא סיימתי היום', officeBtn: 'לא הסתיים',
    yesterday: 'אתמול', on: (d: string) => `ב-${d}`, ask: (apt: string, when: string) => `סיימת את ${apt} ${when}?`,
    yes: 'כן, לסגור', no: 'לא, לא סיימתי',
  };
  if (lang === 'ru') return {
    tag: 'не закончено', needs: 'нужен новый день', btn: 'Сегодня не закончил', officeBtn: 'Не закончено',
    yesterday: 'вчера', on: (d: string) => d, ask: (apt: string, when: string) => `Ты закончил ${apt} ${when}?`,
    yes: 'Да, закрыть', no: 'Нет, не закончил',
  };
  return {
    tag: 'not finished', needs: 'needs a new day', btn: 'Not finished today', officeBtn: 'Not finished',
    yesterday: 'yesterday', on: (d: string) => `on ${d}`, ask: (apt: string, when: string) => `Did you finish ${apt} ${when}?`,
    yes: 'Yes, close it', no: 'No, not finished',
  };
}
