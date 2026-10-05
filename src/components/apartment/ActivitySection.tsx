import React, { useMemo, useState } from 'react';
import { ActivityLog, BackupSnapshot } from '../../types';
import { format } from 'date-fns';
import { ChevronDown, Clock, RotateCcw } from 'lucide-react';
import { useStore } from '../../data/store';
import { ACTIVITY_UI, ActivityLang, describeGroup, describeLog, familyOf, foldActivity, newestFirst } from '../../data/activityWords';
import { ActivityAvatar, FAMILY_LOOK, clockRange, dateLocale } from '../ui/ActivityBits';

interface ActivitySectionProps {
  logs: ActivityLog[];
  autoBackup?: boolean;
  backupSnapshots?: BackupSnapshot[];
  onRestore?: (snapshotId: string) => void;
}

/** The "go back to this moment" control, with its own are-you-sure step. */
function RestoreControl({ snapshot, onRestore, confirming, setConfirming }: {
  snapshot: BackupSnapshot;
  onRestore: (id: string) => void;
  confirming: boolean;
  setConfirming: (on: boolean) => void;
}) {
  const s = useStore(state => state.mainUiStrings);
  return confirming ? (
    <span className="flex items-center gap-1">
      <span className="text-amber-600 font-medium">{s.revertConfirmMsg}</span>
      <button
        onClick={() => { onRestore(snapshot.id); setConfirming(false); }}
        className="px-1.5 py-0.5 rounded bg-amber-500 text-white font-medium text-[10px]"
      >{s.yesBtn}</button>
      <button
        onClick={() => setConfirming(false)}
        className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-medium text-[10px]"
      >{s.cancel}</button>
    </span>
  ) : (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-amber-600 transition-colors"
      title={s.restoreTooltip}
    >
      <RotateCcw size={9} /> {s.restoreBtn}
    </button>
  );
}

/**
 * The apartment window's History tab — in plain words and consolidated.
 *
 * The owner's own screenshot of it (2026-10-05): "Igor uploaded file:
 * 1791204142497409322422886791595.jpg · Apt 9" five times in a row, then
 * "Igor updated stage note task · Apt Building 1/9" — "This should be
 * consolidated into 'Igor uploaded 4 photos'", and "what does that even
 * mean?". Every row is worded by `activityWords` now, neighbouring records of
 * one kind by one person within half an hour fold into one row that opens up,
 * and the apartment is never repeated — you are standing in it.
 *
 * A record's name comes back from the cloud ABSENT when it was written
 * undefined (fsSet turns undefined into a delete); the words module fills it
 * with "Someone", so a nameless record can never take the tab down.
 */
export function ActivitySection({ logs, autoBackup, backupSnapshots, onRestore }: ActivitySectionProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const s = useStore(state => state.mainUiStrings);
  const stages = useStore(state => state.stages);
  const lang: ActivityLang = s.isRtl ? 'he' : 'en';
  const ui = ACTIVITY_UI[lang];
  const ctx = useMemo(() => ({ lang, stages }), [lang, stages]);
  const groups = useMemo(() => foldActivity(newestFirst(logs)), [logs]);

  if (logs.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-6">
        <Clock size={24} className="mx-auto mb-2 opacity-40" />
        {s.noActivityYet2}
      </div>
    );
  }

  const snapshotOf = (id: string) => (autoBackup ? backupSnapshots?.find(b => b.activityLogId === id) : undefined);
  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="space-y-2.5 pe-1" data-history-list>
      {groups.map(g => {
        const words = describeGroup(g.logs, ctx);
        const fam = familyOf(g.kind);
        const n = g.logs.length;
        const expanded = open.has(g.id);
        const snapshot = snapshotOf(g.logs[0].id);
        const when = `${format(new Date(g.newest), 'd MMM', { locale: dateLocale(lang) })} · ${clockRange(g.newest, g.oldest)}`;
        const look = FAMILY_LOOK[fam];
        const Glyph = look.icon;
        return (
          <div key={g.id} className="flex gap-2.5 text-xs" data-history-row={g.id} data-activity-kind={g.kind} data-activity-count={n}>
            <ActivityAvatar name={words.who} size={28} />
            <div className="flex-1 min-w-0">
              <p className={`leading-snug ${g.kind === 'opened' ? 'text-gray-500' : 'text-gray-700'}`} data-activity-sentence>
                <b className="font-semibold text-gray-800">{words.who}</b>{' '}
                <span>{words.text}</span>
              </p>

              {words.detail && (fam === 'notes' ? (
                <div className="mt-1 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-gray-700 leading-snug text-[11px] whitespace-pre-wrap break-words" data-activity-detail>
                  {words.detail}
                </div>
              ) : (
                <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-2 break-words" data-activity-detail>{words.detail}</p>
              ))}

              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {/* The family's glyph beside the time, not stranded at the far
                    edge of a 1020px window. */}
                <span className="inline-flex items-center gap-1 text-gray-400" data-activity-family={fam}>
                  <Glyph size={11} style={{ color: look.color }} />
                  <span dir="ltr" className="tabular-nums">{when}</span>
                </span>
                {n > 1 && (
                  <button
                    type="button"
                    data-activity-expand
                    onClick={() => toggle(g.id)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 text-[10.5px] font-medium"
                  >
                    <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    {expanded ? ui.hide : ui.showAll(n)}
                  </button>
                )}
                {snapshot && onRestore && !expanded && (
                  <RestoreControl snapshot={snapshot} onRestore={onRestore}
                    confirming={confirmingId === g.logs[0].id}
                    setConfirming={on => setConfirmingId(on ? g.logs[0].id : null)} />
                )}
              </div>

              {expanded && (
                <ul className="mt-1.5 border-s-2 border-gray-100 ps-2.5 space-y-1" data-activity-entries>
                  {g.logs.map(l => {
                    const one = describeLog(l, ctx);
                    const snap = snapshotOf(l.id);
                    return (
                      <li key={l.id} className="flex items-baseline gap-2 min-w-0 text-[11px] text-gray-600 flex-wrap" data-activity-entry>
                        <span dir="ltr" className="tabular-nums text-gray-400 flex-shrink-0">{format(new Date(l.createdAt), 'HH:mm')}</span>
                        <span className="min-w-0">{one.text}</span>
                        {/* A document's name or a note's words — never a camera's file name. */}
                        {one.detail && (
                          <span className="min-w-0 truncate text-gray-400 max-w-[14rem]">{one.detail}</span>
                        )}
                        {snap && onRestore && (
                          <RestoreControl snapshot={snap} onRestore={onRestore}
                            confirming={confirmingId === l.id}
                            setConfirming={on => setConfirmingId(on ? l.id : null)} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
