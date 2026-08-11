import React, { useMemo, useState } from 'react';
import { X, Search, CalendarDays } from 'lucide-react';
import { Apartment, CanvasElement, Contractor, Stage, User } from '../../types';
import { PlannerEntry, PlannerData, personOf, iso, tint } from './PlannerWidget';

/**
 * Every job in the schedule, in one scrollable window.
 *
 * The planner shows a week or a month, which is right for planning and wrong
 * for finding: a job put in three months ago is off the end of the arrows, and
 * walking back to it a week at a time is not a way to find anything. This is
 * the whole schedule, oldest to newest, grouped by day — you scroll rather than
 * navigate, and the list simply gets longer as more goes in.
 *
 * Jobs can be dragged out of here as well, because the other reason to open it
 * is to clear something out of a week you are not looking at.
 */
export function ScheduleWindow({
  el, jobs, contractors, users, stages, onClose, onOpenJob, onRemove,
}: {
  el: CanvasElement;
  jobs: Apartment[];
  contractors: Contractor[];
  users: User[];
  stages: Stage[];
  onClose: () => void;
  onOpenJob: (id: string) => void;
  onRemove: (cellKey: string, entryId: string) => void;
}) {
  const data = (el.data ?? {}) as PlannerData;
  const cells = data.cells ?? {};
  const [q, setQ] = useState('');
  const [showPast, setShowPast] = useState(false);

  const jobById = useMemo(() => {
    const m = new Map<string, Apartment>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const today = iso(new Date());

  /** Flattened to one row per entry, then grouped by day. */
  const byDay = useMemo(() => {
    const rows: {
      key: string; day: string; person: string; entry: PlannerEntry; job?: Apartment;
    }[] = [];
    for (const [key, entries] of Object.entries(cells)) {
      const [person, day] = key.split('|');
      for (const entry of entries) {
        rows.push({ key, day, person, entry, job: entry.jobId ? jobById.get(entry.jobId) : undefined });
      }
    }

    const needle = q.trim().toLowerCase();
    const kept = rows.filter(r => {
      if (!showPast && r.day < today) return false;
      if (!needle) return true;
      const who = personOf(r.person, contractors, users).name.toLowerCase();
      return (r.job?.displayName ?? '').toLowerCase().includes(needle)
        || (r.entry.text ?? '').toLowerCase().includes(needle)
        || who.includes(needle);
    });

    const map = new Map<string, typeof kept>();
    for (const r of kept) {
      if (!map.has(r.day)) map.set(r.day, []);
      map.get(r.day)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cells, jobById, q, showPast, today, contractors, users]);

  const total = byDay.reduce((n, [, rows]) => n + rows.length, 0);

  return (
    <>
      <div className="fixed inset-0 z-[160]" style={{ backgroundColor: 'rgba(15,23,42,.45)' }}
        onClick={onClose} />
      <div className="fixed z-[161] rounded-2xl bg-white overflow-hidden flex flex-col"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(820px, 94vw)', height: 'min(760px, 88vh)',
          boxShadow: '0 26px 64px -18px rgba(15,23,42,.45)',
        }}>

        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <CalendarDays size={16} className="text-[#4aa8d8]" />
          <h3 className="m-0 text-[15px] font-extrabold text-slate-800">
            {data.title || 'Planner'} — everything in the schedule
          </h3>
          <span className="text-[11.5px] text-slate-400 tabular-nums">{total}</span>
          <span className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={17} /></button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
          <span className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Find a job, a note or a person…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-[13px] outline-none
                         focus:ring-2 focus:ring-[#1e3a5f]/20"
            />
          </span>
          <button
            onClick={() => setShowPast(v => !v)}
            className="px-2.5 py-1.5 rounded-lg border text-[12px] font-semibold transition-colors"
            style={showPast
              ? { backgroundColor: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' }
              : { backgroundColor: '#fff', color: '#64748b', borderColor: '#e2e8f0' }}
          >
            Days gone by
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {byDay.length === 0 && (
            <p className="text-[13px] text-gray-400 text-center py-10">
              {q.trim() ? 'Nothing matches.' : 'Nothing in the schedule yet.'}
            </p>
          )}

          {byDay.map(([day, rows]) => {
            const d = new Date(`${day}T00:00:00`);
            const past = day < today;
            return (
              <div key={day} className="mb-4">
                <div className="flex items-baseline gap-2 mb-1.5 sticky top-0 bg-white py-1">
                  <b className="text-[12.5px]" style={{ color: past ? '#94a3b8' : '#1e3a5f' }}>
                    {d.toLocaleDateString(undefined, {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </b>
                  {day === today && (
                    <span className="px-1.5 rounded-full text-[9.5px] font-bold"
                      style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>today</span>
                  )}
                  <span className="text-[10.5px] text-gray-300 tabular-nums">{rows.length}</span>
                </div>

                <div className="grid gap-1">
                  {rows.map(r => {
                    const who = personOf(r.person, contractors, users);
                    const stage = stages.find(s => s.id === r.job?.currentStageId);
                    return (
                      <div key={r.entry.id}
                        className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-gray-100
                                   hover:border-[#4aa8d8]/50 hover:bg-slate-50 transition-colors">
                        <span className="flex items-center gap-1.5 w-[112px] flex-shrink-0 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: who.color }} />
                          <span className="truncate text-[12px] font-bold text-slate-600">{who.name}</span>
                        </span>

                        {r.entry.jobId ? (
                          <button
                            onClick={() => r.entry.jobId && onOpenJob(r.entry.jobId)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <span className="block truncate text-[13px] font-semibold text-slate-800">
                              {r.job?.displayName || '(job removed)'}
                            </span>
                            {(stage || r.entry.text) && (
                              <span className="block truncate text-[10.5px] text-slate-400">
                                {[r.entry.text, stage?.name].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span className="flex-1 min-w-0 truncate text-[13px] text-slate-500">
                            {r.entry.text}
                          </span>
                        )}

                        {r.entry.taskId && (
                          <span className="px-1.5 rounded-full text-[9.5px] font-bold flex-shrink-0"
                            style={{ backgroundColor: '#fdf0e2', color: '#b8650a' }}>task</span>
                        )}

                        <button
                          onClick={() => onRemove(r.key, r.entry.id)}
                          title="Take it out of the schedule"
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500
                                     flex-shrink-0 transition-opacity"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
