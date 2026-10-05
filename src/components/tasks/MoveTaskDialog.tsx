import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, ArrowRight, X, Search, ChevronLeft } from 'lucide-react';
import { useStore } from '../../data/store';
import {
  Apartment, ContractorAssignment, ContractorUiStrings, MainUiStrings, PortalLang, StageMark, User,
  aptLabel, stageNameIn,
  DEFAULT_MAIN_UI_STRINGS, HEBREW_MAIN_UI_STRINGS,
  DEFAULT_CONTRACTOR_UI_STRINGS, HEBREW_CONTRACTOR_UI_STRINGS, RUSSIAN_CONTRACTOR_UI_STRINGS,
} from '../../types';
import { isMoveTarget, placeLabel, taskBaggage, TaskBaggage, MarkMove } from '../../data/taskMove';
import { rowNumOf } from '../../data/floorRows';
import { searchJobs } from '../../data/searchIndex';
import { TrText } from '../ui/Translated';

/**
 * "MOVE TO ANOTHER APARTMENT" — one dialog for the office and the worker
 * (owner, 2026-10-05). Two small steps: pick where the work really happened,
 * then read exactly what moves before anything does — the task, its photos
 * and its messages, and the stage ticks it left behind.
 *
 * The SAME component on both ends, so the two cannot drift: the office hands
 * it MainUiStrings, the worker's portal his own ContractorUiStrings, and
 * `moveWordsOf` reads either (the key names match on purpose). Words that
 * are missing from a stored, user-edited worker object fall back to the
 * preset for his language — the standing rule for that interface.
 *
 * Renders through a PORTAL at z-[130]/[140]: the drawer panel is z-[120] and
 * carries a transform, so a fixed child would be positioned by the panel and
 * painted under its siblings. Pointer events are SEALED (a portal's React
 * events bubble through the React tree into whatever hosts it), and Escape
 * is taken in the capture phase so the job window behind stays open.
 */

export const MOVE_WORD_KEYS = [
  'mvAction', 'mvTitle', 'mvPickHint', 'mvSearch', 'mvAll', 'mvSameWorkspace', 'mvNoMatch', 'mvFloor', 'mvNowOn',
  'mvConfirmTitle', 'mvTheTask', 'mvPhotoOne', 'mvPhotoFew', 'mvPhotoMany', 'mvFilmOne', 'mvFilmFew', 'mvFilmMany',
  'mvFileOne', 'mvFileFew', 'mvFileMany', 'mvMessageOne', 'mvMessageFew', 'mvMessageMany', 'mvAnd',
  'mvMovesOne', 'mvMovesMany', 'mvMarkItem', 'mvMarkDone', 'mvMarkPending', 'mvMarkDoing',
  'mvMarksBothOne', 'mvMarksBothMany', 'mvMarksOffOne', 'mvMarksOffMany', 'mvMarksOnOne', 'mvMarksOnMany',
  'mvMarksKeptOne', 'mvMarksKeptMany', 'mvMarksToggle', 'mvMarksStay', 'mvDriveNote', 'mvBack', 'mvConfirm', 'mvDone',
] as const;
export type MoveWordKey = typeof MOVE_WORD_KEYS[number];
export type MoveWords = Record<MoveWordKey, string> & { lang: PortalLang; rtl: boolean; cancel: string };

/** Every word from `src`, else the language's preset, else English. */
export function moveWordsOf(
  src: Partial<Record<MoveWordKey, string>>,
  preset: Partial<Record<MoveWordKey, string>>,
  lang: PortalLang,
  cancel: string,
): MoveWords {
  const out = { lang, rtl: lang === 'he', cancel } as MoveWords;
  for (const k of MOVE_WORD_KEYS) out[k] = src[k] || preset[k] || DEFAULT_CONTRACTOR_UI_STRINGS[k] || '';
  return out;
}

/** The office's words. On the Job Board the thing a task sits on is a JOB. */
export function officeMoveWords(ui: MainUiStrings, jobBoard: boolean): MoveWords {
  const preset = ui.isRtl ? HEBREW_MAIN_UI_STRINGS : DEFAULT_MAIN_UI_STRINGS;
  const w = moveWordsOf(ui, preset, ui.isRtl ? 'he' : 'en', ui.cancel || preset.cancel);
  if (!jobBoard) return w;
  return {
    ...w,
    mvAction: ui.mvActionJob || preset.mvActionJob,
    mvTitle: ui.mvTitleJob || preset.mvTitleJob,
    mvPickHint: ui.mvPickHintJob || preset.mvPickHintJob,
  };
}

/** The worker's words, in HIS language. */
export function workerMoveWords(s: ContractorUiStrings, lang: PortalLang): MoveWords {
  // `s` is already his language's object (the portal picks the preset for
  // his choice, or the office's stored one, whose language IS the reading
  // language) — the preset only fills keys a stored object predates.
  const preset = lang === 'he' ? HEBREW_CONTRACTOR_UI_STRINGS
    : lang === 'ru' ? RUSSIAN_CONTRACTOR_UI_STRINGS : DEFAULT_CONTRACTOR_UI_STRINGS;
  return moveWordsOf(s, preset, lang, s.cancel || preset.cancel);
}

/** "{n} photos" → "5 photos". Leaves unknown names standing. */
export function fill(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function pluralForm(n: number, lang: PortalLang): 'One' | 'Few' | 'Many' {
  if (lang === 'ru') {
    const d = n % 10, h = n % 100;
    if (d === 1 && h !== 11) return 'One';
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'Few';
    return 'Many';
  }
  return n === 1 ? 'One' : 'Many';
}

export function countPhrase(n: number, kind: 'Photo' | 'Film' | 'File' | 'Message', w: MoveWords): string {
  const key = `mv${kind}${pluralForm(n, w.lang)}` as MoveWordKey;
  return fill(w[key] || w[`mv${kind}Many` as MoveWordKey], { n });
}

/** "A, B and C" — Hebrew's "and" is a prefix (ו, ו- before a digit or Latin). */
export function joinList(items: string[], w: MoveWords): string {
  if (items.length <= 1) return items[0] ?? '';
  const head = items.slice(0, -1).join(', ');
  const last = items[items.length - 1];
  if (w.lang === 'he') return `${head} ${w.mvAnd}${/^[\dA-Za-z'"\u0001]/.test(last) ? '-' : ''}${last}`;
  return `${head} ${w.mvAnd} ${last}`;
}

/** "5 photos", "1 film", "8 messages" — only what there is. */
export function baggagePhrases(b: TaskBaggage, w: MoveWords): string[] {
  const out: string[] = [];
  if (b.photos) out.push(countPhrase(b.photos, 'Photo', w));
  if (b.films) out.push(countPhrase(b.films, 'Film', w));
  if (b.files) out.push(countPhrase(b.files, 'File', w));
  if (b.messages) out.push(countPhrase(b.messages, 'Message', w));
  return out;
}

/** Where the task's own words sit in a composed sentence, so they can be drawn translated. */
const TASK_MARK = '\u0001';

/**
 * A sentence with the task's words drawn in the reader's language.
 *
 * The quoted words sit in a `<bdi>`: an English task inside a Hebrew
 * sentence otherwise lets the bidi algorithm pull the quote marks and the
 * count beside them ("', 3") to the wrong side of the run.
 */
export function WithTask({ text, task, lang }: { text: string; task: string; lang: PortalLang }) {
  const parts = text.split(TASK_MARK);
  const short = task.length > 70 ? `${task.slice(0, 68).trimEnd()}…` : task;
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 && (
            <bdi>'<b className="font-semibold"><TrText text={short} to={lang} /></b>'</bdi>
          )}
        </React.Fragment>
      ))}
    </>
  );
}

/** The task as a phrase — "The task '…'" — its quoted words left to `WithTask`. */
export function theTaskPhrase(w: MoveWords): string {
  return fill(w.mvTheTask, { task: TASK_MARK });
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** A sealed, portalled shell — the two dialogs here share it. */
export function DialogShell({ hook, rtl, width, onClose, children }: {
  hook: string;
  rtl: boolean;
  width: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture, and stopped: the job window behind listens for Escape too.
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div style={{ display: 'contents' }}
      onPointerDown={stop} onPointerUp={stop} onPointerMove={stop} onClick={stop} onDoubleClick={stop}
      onMouseDown={stop} onMouseUp={stop} onContextMenu={stop} onWheel={stop} onTouchStart={stop} onKeyDown={stop}>
      <div className="fixed inset-0 bg-black/50 z-[130]" onClick={onClose} />
      <div
        {...{ [hook]: '' }}
        dir={rtl ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        className="fixed z-[140] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: `min(${width}px, 94vw)`, maxHeight: 'min(760px, 90dvh)' }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function MoveTaskDialog({ task, words: w, actingUser, onClose, onMoved }: {
  task: ContractorAssignment;
  words: MoveWords;
  /** Who the history lines and the stage changes are written in the name of. */
  actingUser: User;
  onClose: () => void;
  onMoved?: (to: Apartment) => void;
}) {
  const apartments = useStore(st => st.apartments);
  const buildings = useStore(st => st.buildings);
  const stages = useStore(st => st.stages);
  const photos = useStore(st => st.contractorPhotos);
  const notes = useStore(st => st.contractorNotes);
  const contractors = useStore(st => st.contractors);
  const allTasks = useStore(st => st.contractorAssignments);
  const boardSettings = useStore(st => st.boardSettings);
  const taskMovePlan = useStore(st => st.taskMovePlan);
  const moveTaskToApartment = useStore(st => st.moveTaskToApartment);

  const [q, setQ] = useState('');
  const [tab, setTab] = useState<string>('all');
  const [target, setTarget] = useState<Apartment | null>(null);
  const [moveMarks, setMoveMarks] = useState(true);

  const from = apartments.find(a => a.id === task.apartmentId);
  const fromPlace = placeLabel(from ?? { buildingId: task.buildingId, apartmentNumber: '', displayName: '' });
  const worker = contractors.find(c => c.id === task.contractorId);
  const stageName = (id: string | null | undefined) => {
    const st = stages.find(x => x.id === id);
    return st ? stageNameIn(st, w.lang) : '';
  };

  /** Every place the work could really have been — this workspace, never the one it is on. */
  const candidates = useMemo(() => {
    const order = new Map(buildings.map((b, i) => [b.id, i]));
    return apartments
      .filter(a => a.id !== task.apartmentId && isMoveTarget(a))
      .sort((a, b) => ((order.get(a.buildingId) ?? 99) - (order.get(b.buildingId) ?? 99))
        || ((Number(a.apartmentNumber) || 1e6) - (Number(b.apartmentNumber) || 1e6))
        || aptLabel(a).localeCompare(aptLabel(b)));
  }, [apartments, buildings, task.apartmentId]);
  const tabs = useMemo(() => buildings.filter(b => candidates.some(a => a.buildingId === b.id)), [buildings, candidates]);
  // Memoised per tab, so the search's own index is built once per list and
  // not on every keystroke (the group-window rule).
  const pool = useMemo(() => (tab === 'all' ? candidates : candidates.filter(a => a.buildingId === tab)), [candidates, tab]);
  const shown = useMemo(() => (q.trim() ? searchJobs(pool, q).map(h => h.rec) : pool), [pool, q]);

  const plan = useMemo(() => (target ? taskMovePlan(task.id, target.id) : null),
    // The plan reads the live records; re-read when any of them change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, task.id, apartments, allTasks, stages, boardSettings]);
  const baggage = useMemo(() => taskBaggage(task.id, photos, notes), [task.id, photos, notes]);

  const markWord = (m: StageMark) => (m === 'done' ? w.mvMarkDone : m === 'pending' ? w.mvMarkPending : w.mvMarkDoing);
  const item = (mv: MarkMove) => fill(w.mvMarkItem, { stage: stageName(mv.stageId) || '?', mark: markWord(mv.mark) });
  const one = (n: number, a: string, b: string) => (n > 1 ? b : a);

  const toPlace = target ? placeLabel(target) : '';
  const things = [theTaskPhrase(w), ...baggagePhrases(baggage, w)];
  const movesSentence = fill(things.length > 1 ? w.mvMovesMany : w.mvMovesOne,
    { things: joinList(things, w), from: fromPlace, to: toPlace });

  const markLines: string[] = [];
  if (plan) {
    const same = plan.off.length === plan.on.length
      && plan.off.every(x => plan.on.some(y => y.stageId === x.stageId && y.mark === x.mark));
    if (plan.off.length && same) {
      markLines.push(fill(one(plan.off.length, w.mvMarksBothOne, w.mvMarksBothMany),
        { marks: joinList(plan.off.map(item), w), from: fromPlace, to: toPlace }));
    } else {
      if (plan.off.length) markLines.push(fill(one(plan.off.length, w.mvMarksOffOne, w.mvMarksOffMany),
        { marks: joinList(plan.off.map(item), w), from: fromPlace }));
      if (plan.on.length) markLines.push(fill(one(plan.on.length, w.mvMarksOnOne, w.mvMarksOnMany),
        { marks: joinList(plan.on.map(item), w), to: toPlace }));
    }
  }
  const keptLine = plan?.kept.length
    ? fill(one(plan.kept.length, w.mvMarksKeptOne, w.mvMarksKeptMany), { marks: joinList(plan.kept.map(item), w), from: fromPlace })
    : '';
  const marksMove = !!plan && (plan.off.length > 0 || plan.on.length > 0);

  const confirm = () => {
    if (!target) return;
    if (moveTaskToApartment(task.id, target.id, actingUser, { moveMarks })) onMoved?.(target);
    onClose();
  };

  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(any-hover: none)').matches;
  const floorOf = (a: Apartment) => (a.buildingId && a.buildingId !== 'G' ? rowNumOf(a.buildingId, a.floor) : '');

  return (
    <DialogShell hook="data-move-dialog" rtl={w.rtl} width={560} onClose={onClose}>
      <div className="flex items-center gap-2 px-4 py-3 text-white flex-shrink-0" style={{ backgroundColor: '#1e3a5f' }}>
        <ArrowRightLeft size={18} className="flex-shrink-0" />
        <span className="font-extrabold text-[15px] truncate">{target ? w.mvConfirmTitle : w.mvTitle}</span>
        <button onClick={onClose} className="ms-auto p-1 rounded-lg hover:bg-white/15" title={w.cancel} aria-label={w.cancel}>
          <X size={18} />
        </button>
      </div>

      {/* The task being moved, and where it sits now. */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2" data-move-task>
          <TrText text={task.taskDescription || '—'} to={w.lang} />
        </p>
        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
          {worker && <span className="font-semibold text-gray-600">{worker.name}</span>}
          {worker && <span className="text-gray-300">·</span>}
          <span data-move-from>{fill(w.mvNowOn, { place: fromPlace })}</span>
        </p>
      </div>

      {!target ? (
        <>
          <div className="px-4 pt-3 space-y-2 flex-shrink-0">
            <p className="text-[13px] font-bold text-[#1e3a5f]">{w.mvPickHint}</p>
            <div className="relative">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400 pointer-events-none" />
              <input
                data-move-search
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => {
                  // Enter takes the first match — the one the eye is already on.
                  if (e.key === 'Enter' && shown[0]) { e.preventDefault(); setTarget(shown[0]); }
                }}
                autoFocus={!touch}
                placeholder={w.mvSearch}
                className="w-full border border-gray-200 rounded-xl ps-9 pe-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4aa8d8]/40"
              />
            </div>
            {tabs.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto no-bar pb-0.5" data-move-buildings>
                {[{ id: 'all', label: w.mvAll }, ...tabs.map(b => ({ id: b.id, label: b.id }))].map(t => (
                  <button key={t.id} type="button" data-move-building={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                      tab === t.id ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#4aa8d8]'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-400">{w.mvSameWorkspace}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[160px]" data-move-list style={{ overscrollBehavior: 'contain' }}>
            {shown.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">{w.mvNoMatch}</p>
            ) : shown.map(a => {
              const fl = floorOf(a);
              const st = stages.find(x => x.id === a.currentStageId);
              return (
                <button key={a.id} type="button" data-move-pick={a.id}
                  onClick={() => setTarget(a)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-start hover:bg-[#4aa8d8]/10 active:bg-[#4aa8d8]/20 transition-colors">
                  {a.buildingId && a.buildingId !== 'G' && (
                    <span className="flex-shrink-0 min-w-[34px] text-center text-[11px] font-black px-1.5 py-1 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
                      {a.buildingId}
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-800 truncate">{aptLabel(a)}</span>
                    {(fl || st) && (
                      <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        {fl && <span>{w.mvFloor} {fl}</span>}
                        {fl && st && <span className="text-gray-300">·</span>}
                        {st && (
                          <span className="flex items-center gap-1 min-w-0">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                            <span className="truncate">{stageNameIn(st, w.lang)}</span>
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  <ArrowRight size={14} className="text-gray-300 flex-shrink-0 rtl:rotate-180" />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* From → to, big enough to check at a glance. */}
            <div className="flex items-center justify-center gap-3" data-move-route>
              <span className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 font-black text-lg line-through decoration-2 decoration-red-300">
                {fromPlace}
              </span>
              <ArrowRight size={22} className="text-[#1e3a5f] flex-shrink-0 rtl:rotate-180" />
              <span className="px-3 py-2 rounded-xl bg-green-50 border border-green-300 text-green-700 font-black text-lg" data-move-to>
                {toPlace}
              </span>
            </div>
            {target.displayName && target.displayName !== target.apartmentNumber && (
              <p className="text-center text-xs text-gray-500 -mt-2">{aptLabel(target)}</p>
            )}

            <p className="text-sm text-gray-700 leading-relaxed" data-move-sentence>
              <WithTask text={movesSentence} task={task.taskDescription || '—'} lang={w.lang} />
            </p>

            {(marksMove || keptLine) && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-2">
                {marksMove && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" data-move-marks checked={moveMarks}
                      onChange={e => setMoveMarks(e.target.checked)}
                      className="w-4 h-4 accent-[#1e3a5f] flex-shrink-0" />
                    <span className="text-[13px] font-bold text-[#1e3a5f]">{w.mvMarksToggle}</span>
                  </label>
                )}
                {marksMove && (moveMarks
                  ? markLines.map((l, i) => (
                      <p key={i} data-move-marks-line className="text-[13px] text-gray-700 leading-snug">{l}</p>
                    ))
                  : <p data-move-marks-line className="text-[13px] text-gray-500 leading-snug">{w.mvMarksStay}</p>)}
                {keptLine && <p data-move-marks-kept className="text-[12px] text-gray-500 leading-snug">{keptLine}</p>}
              </div>
            )}

            {baggage.onDrive && (
              <p className="text-[12px] text-gray-500 leading-snug" data-move-drive>{w.mvDriveNote}</p>
            )}
          </div>
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 flex-shrink-0">
            <button type="button" data-move-back onClick={() => setTarget(null)}
              className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">
              <ChevronLeft size={15} className="rtl:rotate-180" /> {w.mvBack}
            </button>
            <span className="flex-1" />
            <button type="button" data-move-confirm onClick={confirm}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-sm font-bold">
              <ArrowRightLeft size={15} /> {w.mvConfirm}
            </button>
          </div>
        </>
      )}
    </DialogShell>
  );
}
