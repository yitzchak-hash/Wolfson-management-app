import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, AlertTriangle } from 'lucide-react';
import { aptLabel, projectShortName, getStageName, personColor, ContractorAssignment, Apartment } from '../../types';
import { useStore, loadProjectSnapshot } from '../../data/store';
import {
  TimeOff, TimeOffKind, TIME_OFF_KINDS, TIME_OFF_COLOR, kindWord, hatchOf, bookedDuring, upsertTimeOff,
  removeTimeOff, shortDay, backDay, offOn,
} from '../../data/timeOff';
import { saveTimeOff, timeOffNow } from '../../data/useTimeOff';
import { daysOf } from '../../data/taskDays';
import { Shell, Footer, Field } from './PlannerDialogs';

/**
 * "Time off · Gadi" — the approved form (scene C of "Calendar and Time Off",
 * owner 2026-10-12): from, until, what kind, an optional note, and — the
 * point of the thing — every task already booked on those days, each with
 * "Move it to someone else" / "Keep it on him". NOTHING moves by itself
 * (locked answer 9): Keep is where every row starts, and a kept task wears a
 * small "he's away" warning on the notebook and the calendar so it cannot be
 * missed. Pressing a band reopens this with the entry, to change the dates or
 * remove it.
 */
export interface BookedRow { pid: string; task: ContractorAssignment; apt?: Apartment }

export function TimeOffDialog({ person, name, color, initial, onClose }: {
  /** The notebook's person key: `c:` / `u:` / `n:`. */
  person: string;
  name: string;
  color?: string;
  /** An entry to edit, or `{from,to}` to start a new one on those days. */
  initial: Partial<TimeOff> & { from: string; to: string };
  onClose: () => void;
}) {
  const { contractors, currentProjectId, projects, contractorAssignments, apartments, stages, currentUser,
    updateContractorAssignment, updateAssignmentInProject, mainUiStrings: s } = useStore();
  const snapTick = useStore(st => st.snapshotTick);
  const isRtl = !!s.isRtl;
  const lang = isRtl ? 'he' : 'en';
  const t = (en: string, he: string) => (isRtl ? he : en);
  const editing = !!initial.id;
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to < initial.from ? initial.from : initial.to);
  const [kind, setKind] = useState<TimeOffKind>(initial.kind ?? 'vacation');
  const [note, setNote] = useState(initial.note ?? '');
  /** Per booked task: undefined/'' = keep on him; a contractor id = move to them. */
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const [moving, setMoving] = useState<Record<string, boolean>>({});

  const booked: BookedRow[] = useMemo(() => {
    const out: BookedRow[] = [];
    if (!from || !to || to < from) return out;
    for (const a of bookedDuring(contractorAssignments, person, from, to)) {
      out.push({ pid: currentProjectId, task: a, apt: apartments.find(x => x.id === a.apartmentId) });
    }
    for (const p of projects) {
      if (p.id === currentProjectId) continue;
      const snap = loadProjectSnapshot(p.id);
      for (const a of bookedDuring(snap.assignments ?? [], person, from, to)) {
        out.push({ pid: p.id, task: a, apt: snap.apartments.find(x => x.id === a.apartmentId) });
      }
    }
    return out.sort((x, y) => (daysOf(x.task)[0] ?? '').localeCompare(daysOf(y.task)[0] ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, person, contractorAssignments, apartments, projects, currentProjectId, snapTick]);

  const valid = !!from && !!to && to >= from;
  const others = contractors.filter(c => c.active && `c:${c.id}` !== person);
  const list = timeOffNow();

  function save() {
    if (!valid) return;
    const entry: TimeOff = {
      id: initial.id ?? `TO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      person, from, to, kind,
      ...(note.trim() ? { note: note.trim() } : {}),
      by: initial.by ?? currentUser?.name ?? 'Office',
      at: initial.at ?? new Date().toISOString(),
    };
    saveTimeOff(upsertTimeOff(list, entry));
    for (const row of booked) {
      const target = moving[row.task.id] ? moveTo[row.task.id] : '';
      if (!target) continue;
      const patch = { contractorId: target } as Partial<ContractorAssignment>;
      if (row.pid === currentProjectId) updateContractorAssignment(row.task.id, patch);
      else updateAssignmentInProject(row.pid, row.task.id, patch);
    }
    onClose();
  }

  function remove() {
    if (!initial.id) return;
    saveTimeOff(removeTimeOff(list, initial.id));
    onClose();
  }

  const clashOther = useMemo(() => {
    // Another entry of the same person overlapping the new days would draw
    // two bands on one square — say so rather than silently doubling.
    return list.find(x => x.person === person && x.id !== initial.id && !(x.to < from || x.from > to));
  }, [list, person, initial.id, from, to]);

  const box = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-[#1e3a5f]/25 bg-white';

  return createPortal(
    <Shell title={`${t('Time off', 'חופשה / היעדרות')} · ${name}`} onCancel={onClose}>
      <div data-time-off-dialog className="grid gap-2.5">
        <div className="flex items-center gap-2 text-[11.5px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color ?? personColor(name) }} />
          <span>{t('Set once — every notebook, the calendar and his phone show it.',
            'נקבע פעם אחת — כל הלוחות, היומן והטלפון שלו יראו.')}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('From', 'מ־')}>
            <input data-time-off-from type="date" value={from} className={box}
              onChange={e => { const v = e.target.value; if (!v) return; setFrom(v); if (to < v) setTo(v); }} />
          </Field>
          <Field label={t('Until', 'עד')}>
            <input data-time-off-to type="date" value={to} min={from} className={box}
              onChange={e => { if (e.target.value) setTo(e.target.value); }} />
          </Field>
        </div>
        {valid && (
          <div className="text-[11.5px] text-gray-500 -mt-1">
            {t('Back', 'חוזר')} <b className="text-slate-700">{shortDay(backDay({ id: '', person, from, to, kind }), lang)}</b>
          </div>
        )}
        <Field label={t('What kind', 'איזה סוג')}>
          <div className="flex flex-wrap gap-1.5">
            {TIME_OFF_KINDS.map(k => {
              const on = kind === k;
              const c = TIME_OFF_COLOR[k];
              return (
                <button key={k} data-time-off-kind={k} {...(on ? { 'data-on': '1' } : {})}
                  onClick={() => setKind(k)}
                  className="px-2.5 py-1 rounded-full text-[11.5px] font-bold border"
                  style={on
                    ? { backgroundImage: hatchOf(k), borderColor: c.ink, color: c.ink }
                    : { borderColor: '#e2e8f0', color: '#475569' }}>
                  {kindWord(k, lang)}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label={t('Note (optional)', 'הערה (לא חובה)')}>
          <input data-time-off-note value={note} onChange={e => setNote(e.target.value)} className={box}
            placeholder={t('Anything worth knowing', 'משהו שכדאי לדעת')} />
        </Field>
        {clashOther && (
          <div className="flex items-start gap-1.5 text-[11.5px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>{t(`He already has ${kindWord(clashOther.kind, 'en').toLowerCase()} from ${shortDay(clashOther.from, 'en')} to ${shortDay(clashOther.to, 'en')}.`,
              `כבר רשומה לו ${kindWord(clashOther.kind, 'he')} ${shortDay(clashOther.from, 'he')}–${shortDay(clashOther.to, 'he')}.`)}</span>
          </div>
        )}
        {booked.length > 0 && (
          <div data-time-off-booked className="rounded-xl border border-amber-200 bg-amber-50/60 p-2 grid gap-1.5">
            <div className="text-[11.5px] font-bold text-amber-800">
              {t(`${name} has ${booked.length} task${booked.length === 1 ? '' : 's'} on those days`,
                `ל${name} ${booked.length} משימות בימים האלה`)}
            </div>
            {booked.map(row => {
              const st = stages.find(x => x.id === row.task.stageId)
                ?? loadProjectSnapshot(row.pid).stages.find(x => x.id === row.task.stageId);
              const ws = projectShortName(projects.find(p => p.id === row.pid), isRtl, row.pid);
              const onDays = daysOf(row.task).filter(d => d >= from && d <= to);
              const isMove = !!moving[row.task.id];
              return (
                <div key={row.task.id} data-time-off-task={row.task.id} className="bg-white rounded-lg border border-amber-100 px-2 py-1.5 grid gap-1">
                  <div className="text-[12px] font-semibold text-slate-800">
                    {(row.apt ? aptLabel(row.apt) : '') || row.task.taskDescription || t('A task', 'משימה')}
                    <span className="text-gray-400 font-normal"> · {ws}{st ? ` · ${getStageName(st, isRtl)}` : ''} · {onDays.map(d => shortDay(d, lang)).join(', ')}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button data-time-off-move onClick={() => setMoving(m => ({ ...m, [row.task.id]: true }))}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${isMove ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'border-gray-200 text-gray-600'}`}>
                      {t('Move it to someone else', 'להעביר למישהו אחר')}
                    </button>
                    <button data-time-off-keep onClick={() => setMoving(m => ({ ...m, [row.task.id]: false }))}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${!isMove ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-600'}`}>
                      {t('Keep it on him', 'להשאיר עליו')}
                    </button>
                    {isMove && (
                      <select data-time-off-move-to value={moveTo[row.task.id] ?? ''}
                        onChange={e => setMoveTo(m => ({ ...m, [row.task.id]: e.target.value }))}
                        className="border border-gray-200 rounded-lg px-1.5 py-0.5 text-[11.5px]">
                        <option value="">{t('Who instead?', 'מי במקום?')}</option>
                        {others.map(c => {
                          const away = onDays.some(d => offOn(list, `c:${c.id}`, d));
                          return <option key={c.id} value={c.id}>{c.name}{away ? ` (${t('away', 'לא בעבודה')})` : ''}</option>;
                        })}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer>
        {editing && (
          <button data-time-off-remove onClick={remove}
            className="me-auto flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-semibold text-red-600 hover:bg-red-50">
            <Trash2 size={13} /> {t('Remove', 'להסיר')}
          </button>
        )}
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50">
          {t('Cancel', 'ביטול')}
        </button>
        <button data-time-off-save onClick={save}
          disabled={!valid || booked.some(r => moving[r.task.id] && !moveTo[r.task.id])}
          className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: '#1e3a5f' }}>
          {t('Save', 'שמירה')}
        </button>
      </Footer>
    </Shell>,
    document.body,
  );
}
